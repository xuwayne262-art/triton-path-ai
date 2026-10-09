"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight, BookOpen, CalendarDays, GraduationCap, History, House, Layers, Search, Star, TrendingUp, User, X,
} from "lucide-react";
import PlatShell from "@/components/plat/PlatShell";
import CourseRow from "@/components/plat/CourseRow";
import PassTimeline from "@/components/plat/PassTimeline";
import ProfessorRow from "@/components/plat/ProfessorShelf";
import SearchResults, { type Combined } from "@/components/plat/SearchResults";
import { GradeBadge } from "@/components/plat/Grade";
import { noteRecent, useRecent } from "@/components/plat/useRecent";
import {
  CAMPUS, loadGE, loadIndex, loadProfessors, professorHref, searchCourses, searchProfessors, sortCourses,
  type CourseRow as Row, type GEFile, type PlatIndex, type ProfessorRecord,
} from "@/lib/plat";
import { agoLabel, type RecentItem } from "@/lib/recent";
import { DEPARTMENTS } from "@/data/ucsdStructure";

/** Departments worth a shortcut chip; the rest are one click further in. */
const QUICK_DEPTS = ["CSE", "MATH", "COGS", "ECON", "BILD", "PHYS", "CHEM", "PSYC", "POLI", "DSC"];

/**
 * A course worth recommending: on the schedule, with real capacity, several
 * years of grade history, and at least 3 units. The unit floor matters — without
 * it the "easiest" shelf fills with 2-unit performance ensembles and practica
 * where everyone earns an A but nobody is choosing them to fill a requirement.
 */
const REAL_CLASS = (c: Row) =>
  c.o === 1 && (c.sl ?? 0) >= 40 && c.r >= 3 && parseFloat(c.u ?? "0") >= 3;

/**
 * Keeps a shelf varied: cross-listed twins (EDS 126 / SOCI 126) share a title,
 * and one popular lecturer can otherwise occupy half the list.
 */
function varied(rows: Row[], count: number): Row[] {
  const seenTitle = new Set<string>();
  const seenProf = new Set<string>();
  const out: Row[] = [];
  for (const c of rows) {
    const title = c.t.toLowerCase();
    if (seenTitle.has(title)) continue;
    if (c.p && seenProf.has(c.p)) continue;
    seenTitle.add(title);
    if (c.p) seenProf.add(c.p);
    out.push(c);
    if (out.length === count) break;
  }
  return out;
}

/**
 * The front door says what the site is before anything else: a headline in
 * plain words, the search, then the four places a student goes — each with
 * how much is behind it — and whatever this browser looked at last. The
 * shelves below exist so a student who knows nothing still lands on real
 * courses.
 */
export default function HomePage() {
  const router = useRouter();
  const [data, setData] = useState<PlatIndex | null>(null);
  const [ge, setGE] = useState<GEFile | null>(null);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  // The results close on a click elsewhere or Escape, as the bar's search does.
  const [open, setOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const [profs, setProfs] = useState<ProfessorRecord[]>([]);
  useEffect(() => { loadIndex().then(setData).catch(() => {}); }, []);
  useEffect(() => { loadProfessors().then((d) => setProfs(d.professors)).catch(() => {}); }, []);
  useEffect(() => { loadGE().then(setGE).catch(() => {}); }, []);
  const { items: recent, clear: clearRecent } = useRecent();

  // Everyone in the grade archive is on file, but little more than half have a
  // RateMyProfessors score; this used to print the whole file (4,205) as rated.
  const rated = useMemo(() => profs.filter((p) => p.q != null && p.q > 0).length, [profs]);

  /** Distinct courses on any college's GE list, and on the DEI list. */
  const geCounts = useMemo(() => {
    if (!ge) return null;
    const college = new Set<string>();
    for (const a of ge.areas) if (a.college !== CAMPUS) for (const c of ge.lists[a.key] ?? []) college.add(c);
    return { college: college.size, dei: ge.lists[`${CAMPUS}:DEI`]?.length ?? 0 };
  }, [ge]);

  const results = useMemo<Combined>(
    () => ({
      profs: searchProfessors(profs, q, 4),
      courses: searchCourses(data?.courses ?? [], q, 6),
    }),
    [data, profs, q],
  );

  const flat = useMemo(
    () => [
      ...results.profs.map((p) => professorHref(p.prof.n)),
      ...results.courses.map(({ row }) => {
        const i = row.k.lastIndexOf(" ");
        return `/course/${encodeURIComponent(row.k.slice(0, i))}/${encodeURIComponent(row.k.slice(i + 1))}`;
      }),
    ],
    [results],
  );
  const [activeFor, setActiveFor] = useState(q);
  if (activeFor !== q) { setActiveFor(q); setActive(0); }

  /** Rated 4.0+ with a real sample size, and actually on this term's schedule. */
  const topProfs = useMemo(() => {
    if (!profs.length) return null;
    return profs
      .filter((p) => p.cur && (p.q ?? 0) >= 4 && (p.nr ?? 0) >= 15)
      .sort((a, b) => (b.q ?? 0) - (a.q ?? 0) || (b.nr ?? 0) - (a.nr ?? 0))
      .slice(0, 6);
  }, [profs]);

  const easiest = useMemo(() => {
    if (!data) return null;
    const pool = data.courses.filter(REAL_CLASS);
    // The same order as "Best grades" everywhere else, so the shelf's letters
    // descend too. REAL_CLASS already demands three terms of history.
    return varied(sortCourses(pool.filter((c) => c.g != null && c.g > 0), "grade"), 6);
  }, [data]);

  /** Subjects with the most on-schedule courses — the left rail's index. */
  const busiest = useMemo(() => {
    if (!data) return null;
    return [...data.subjects]
      .filter((s) => s.offered > 0)
      .sort((a, b) => b.offered - a.offered)
      .slice(0, 12);
  }, [data]);

  const go = (href: string | undefined) => {
    if (!href) return;
    if (q.trim().length >= 2) noteRecent({ kind: "search", key: q.trim(), label: q.trim(), href: "/" });
    router.push(href);
  };

  const searches = recent.filter((r) => r.kind === "search");
  const visits = recent.filter((r) => r.kind !== "search");

  return (
    <PlatShell hideSearch>
      {/* ── Hero: what this is, and the way in ─────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-gray-200 bg-gradient-to-br from-slate-50 via-white to-slate-50 dark:border-white/10 dark:from-[#101a2b] dark:via-[#0d1420] dark:to-[#101a2b]">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-40 -top-40 h-[32rem] w-[32rem] rounded-full bg-[#1B2C4F]/[0.04] blur-3xl dark:bg-[#FFC72C]/[0.05]"
        />

        <div className="relative mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-14">
            <div className="lg:col-span-7">
              <span className="inline-flex items-center gap-2 rounded-full border border-[#1B2C4F]/15 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#1B2C4F] shadow-sm dark:border-[#FFC72C]/25 dark:bg-white/5 dark:text-[#FFC72C]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#FFC72C]" />
                {data ? data.meta.termName : "Loading"}
              </span>

              <h1 className="mt-5 text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl lg:text-[3.2rem]">
                Grades, professors and seats
                <br />
                <span className="text-[#1B2C4F] dark:text-[#FFC72C]">for every UCSD course.</span>
              </h1>

              <p className="mt-5 max-w-xl text-base leading-relaxed text-gray-600 dark:text-gray-300">
                {data
                  ? `${data.meta.gradeRecords.toLocaleString()} published grade distributions from ${data.meta.years}, matched to who is teaching in ${data.meta.termName} — and a planner for your week and your four years.`
                  : "Loading UCSD grade distributions…"}
              </p>

              <div ref={searchRef} className="relative mt-8 max-w-xl">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                <input
                  ref={inputRef}
                  value={q}
                  onChange={(e) => { setQ(e.target.value); setOpen(true); }}
                  onFocus={() => setOpen(true)}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((i) => Math.min(i + 1, flat.length - 1)); }
                    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
                    else if (e.key === "Enter") { e.preventDefault(); go(flat[active]); }
                    else if (e.key === "Escape") setOpen(false);
                  }}
                  aria-label="Search courses and professors"
                  placeholder="CSE 11, organic chemistry, Joe Politz…"
                  className="w-full rounded-2xl border border-gray-200 bg-white py-4 pl-12 pr-4 text-base shadow-sm outline-none transition
                             placeholder:text-gray-400 focus:border-[#1B2C4F] focus:shadow-lg focus:ring-4 focus:ring-[#1B2C4F]/5
                             dark:border-white/10 dark:bg-white/5 dark:text-gray-100 dark:focus:border-[#FFC72C] dark:focus:ring-[#FFC72C]/10"
                />
                {open && q.trim().length >= 2 && (
                  <div className="absolute left-0 right-0 top-full z-40 mt-2 max-h-[26rem] overflow-y-auto rounded-2xl border border-gray-200 bg-white p-1 shadow-2xl dark:border-white/10 dark:bg-[#101a2b]">
                    <SearchResults
                      results={results}
                      query={q}
                      active={active}
                      onHover={setActive}
                      onPick={go}
                    />
                  </div>
                )}
              </div>

              {/* Recent searches first, then department shortcuts. */}
              {searches.length > 0 && (
                <div className="mt-4 flex max-w-xl flex-wrap items-center gap-1.5">
                  <History className="h-3.5 w-3.5 text-gray-400" aria-label="Recent searches" />
                  {searches.map((s) => (
                    <button
                      key={s.key}
                      type="button"
                      onClick={() => { setQ(s.key); setOpen(true); inputRef.current?.focus(); }}
                      className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-700 transition hover:border-[#1B2C4F] dark:border-white/10 dark:bg-white/5 dark:text-gray-200 dark:hover:border-[#FFC72C]"
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              )}
              <div className="mt-3 flex max-w-xl flex-wrap items-center gap-1.5">
                {QUICK_DEPTS.map((d) => (
                  <Link
                    key={d}
                    href={`/courses/${d}`}
                    className="rounded-full border border-gray-200 bg-white px-3 py-1 font-mono text-xs font-semibold text-gray-600 transition hover:border-[#1B2C4F] hover:text-[#1B2C4F] dark:border-white/10 dark:bg-white/5 dark:text-gray-300 dark:hover:border-[#FFC72C] dark:hover:text-[#FFC72C]"
                  >
                    {d}
                  </Link>
                ))}
                <Link href="/courses" className="px-2 text-xs font-semibold text-gray-600 hover:underline dark:text-gray-300">
                  all {DEPARTMENTS.length} departments →
                </Link>
              </div>
            </div>

            {/* The term itself — numbers and the enrollment clock */}
            <div className="lg:col-span-5">
              <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
                <div className="h-1 bg-gradient-to-r from-[#1B2C4F] via-[#FFC72C] to-[#1B2C4F]" />
                <div className="p-6">
                  <div className="flex items-baseline justify-between gap-3">
                    <h2 className="text-sm font-bold tracking-tight">
                      {data?.meta.termName ?? "This term"} at a glance
                    </h2>
                    <span className="font-mono text-xs text-gray-500 dark:text-gray-400">{data?.meta.term}</span>
                  </div>

                  <dl className="mt-5 grid grid-cols-3 gap-3">
                    <Stat label="on the schedule" value={data?.meta.offered} />
                    <Stat label="courses catalogued" value={data?.meta.catalogCourses} />
                    <Stat label="professors rated" value={rated || undefined} />
                  </dl>

                  <div className="mt-5 border-t border-gray-100 pt-1 dark:border-white/5">
                    <PassTimeline termName={data?.meta.termName} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 pb-20 pt-8 sm:px-6 lg:px-8">
        {/* ── The four places a student goes ─────────────────────────────── */}
        <nav aria-label="Start here" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <EntryCard
            href="/courses"
            icon={<BookOpen className="h-5 w-5" />}
            title="Courses"
            count={data ? `${data.meta.catalogCourses.toLocaleString()} courses` : undefined}
            detail={data ? `${data.meta.offered.toLocaleString()} on the ${data.meta.termName} schedule, in ${DEPARTMENTS.length} departments` : "Every department"}
            cta="Browse by department"
          />
          <EntryCard
            href="/ge"
            icon={<GraduationCap className="h-5 w-5" />}
            title="Easy GEs"
            count={geCounts ? `${geCounts.college.toLocaleString()} GE courses` : undefined}
            detail={geCounts ? `Ranked by grades, by college — plus ${geCounts.dei} for DEI and the AHI list` : "Ranked by the grades students got"}
            cta="Find a GE"
          />
          <EntryCard
            href="/planner"
            icon={<CalendarDays className="h-5 w-5" />}
            title="Planner"
            detail="Your week of sections on a map, and all four years against your major"
            cta="Open the planner"
            filled
          />
          <EntryCard
            href="/housing"
            icon={<House className="h-5 w-5" />}
            title="Housing"
            badge="New"
            detail="Sublets from verified @ucsd.edu students, by the walk to your classes"
            cta="Find a place"
          />
        </nav>

        {/* ── Pick up where you left off ─────────────────────────────────── */}
        {visits.length > 0 && (
          <section className="mt-10">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="flex items-center gap-2 text-base font-bold">
                <History className="h-4 w-4" /> Recently viewed
              </h2>
              <button type="button" onClick={clearRecent} className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white">
                <X className="h-3 w-3" /> Clear
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Kept in this browser only.</p>
            <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {visits.map((v) => <RecentCard key={`${v.kind}:${v.key}`} item={v} index={data} />)}
            </ul>
          </section>
        )}

        {/* ── The index on the left, the shelves across the rest ─────────── */}
        <div className="mt-12 grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-10">
          <aside className="lg:col-span-3">
            <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">
              <Layers className="h-3.5 w-3.5" />
              Busiest subjects
            </h2>
            <p className="mt-1.5 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
              Ranked by how many courses each one is actually running this term.
            </p>

            <div className="mt-4 overflow-hidden rounded-2xl border border-gray-200 dark:border-white/10">
              {busiest
                ? busiest.map((s) => (
                    <Link
                      key={s.code}
                      href={`/courses/${s.code}`}
                      className="group flex items-center gap-3 border-b border-gray-100 px-3 py-2.5 text-sm transition last:border-b-0 hover:bg-gray-50 dark:border-white/5 dark:hover:bg-white/5"
                    >
                      <span className="w-12 shrink-0 font-mono text-xs font-bold text-[#1B2C4F] dark:text-[#FFC72C]">
                        {s.code}
                      </span>
                      <span
                        title={`${s.name} — ${s.offered} ${s.offered === 1 ? "course" : "courses"} this term`}
                        className="min-w-0 flex-1 truncate text-sm text-gray-700 group-hover:underline dark:text-gray-200"
                      >
                        {s.name}
                      </span>
                      <span className="shrink-0 font-mono text-xs tabular-nums text-gray-500 dark:text-gray-400">
                        {s.offered}
                      </span>
                    </Link>
                  ))
                : <p className="py-10 text-center text-xs text-gray-500">Loading…</p>}
            </div>

            <Link
              href="/courses"
              className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#1B2C4F] hover:underline dark:text-[#FFC72C]"
            >
              All {DEPARTMENTS.length} departments <ArrowRight className="h-3 w-3" />
            </Link>
          </aside>

          <div className="grid grid-cols-1 gap-10 lg:col-span-9 xl:grid-cols-2">
            <section>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="flex items-center gap-2 text-base font-bold">
                  <TrendingUp className="h-4 w-4" />Kindest grading this term
                </h2>
                <Link href="/ge" className="text-xs font-semibold text-[#1B2C4F] hover:underline dark:text-[#FFC72C]">
                  More easy courses →
                </Link>
              </div>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Real lecture courses with several years of history behind the average — not 12-seat seminars.{" "}
                <Link href="/about#letter" className="underline underline-offset-2 hover:text-gray-900 dark:hover:text-white">How the letter is worked out</Link>
              </p>
              <div className="mt-3 overflow-hidden rounded-2xl border border-gray-200 dark:border-white/10">
                {easiest
                  ? easiest.map((c) => <CourseRow key={c.k} row={c} />)
                  : <p className="py-12 text-center text-sm text-gray-500">Loading…</p>}
              </div>
            </section>

            {/* People, not courses. Open a department to rank its whole faculty. */}
            <section>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="flex items-center gap-2 text-base font-bold">
                  <Star className="h-4 w-4" />Best-rated professors teaching now
                </h2>
                <Link href="/courses" className="text-xs font-semibold text-[#1B2C4F] hover:underline dark:text-[#FFC72C]">
                  Rank a department&rsquo;s professors →
                </Link>
              </div>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Rated 4.0 or better on RateMyProfessors with at least 15 reviews, and on the{" "}
                {data?.meta.termName ?? "current"} schedule.
              </p>
              <div className="mt-3 overflow-hidden rounded-2xl border border-gray-200 dark:border-white/10">
                {topProfs
                  ? topProfs.map((p) => <ProfessorRow key={p.n} prof={p} />)
                  : <p className="py-12 text-center text-sm text-gray-500">Loading…</p>}
              </div>
            </section>
          </div>
        </div>
      </div>
    </PlatShell>
  );
}

/** One figure in the term card. Undefined reads as loading, not as zero. */
function Stat({ label, value }: { label: string; value?: number }) {
  return (
    <div>
      <dt className="sr-only">{label}</dt>
      <dd className="text-xl font-black tracking-tight">
        {value != null ? value.toLocaleString() : <span className="text-gray-300 dark:text-gray-600">—</span>}
      </dd>
      <p className="mt-0.5 text-xs leading-tight text-gray-500 dark:text-gray-400">{label}</p>
    </div>
  );
}

/** A front door: what it is, how much is behind it, and where it goes. */
function EntryCard({
  href, icon, title, count, detail, cta, badge, filled = false,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  count?: string;
  detail: string;
  /** What following it does, in words. */
  cta: string;
  badge?: string;
  filled?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`group flex flex-col rounded-2xl p-5 transition ${
        filled
          ? "bg-gradient-to-br from-[#1B2C4F] to-[#24406e] text-white shadow-sm hover:shadow-xl"
          : "border border-gray-200 bg-white hover:border-[#1B2C4F]/40 hover:shadow-md dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-[#FFC72C]/40"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className={filled ? "text-[#FFC72C]" : "text-[#1B2C4F] dark:text-[#FFC72C]"}>{icon}</span>
        {badge && (
          <span className="rounded-full bg-[#FFC72C] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#1B2C4F]">
            {badge}
          </span>
        )}
      </div>
      <p className="mt-3 text-lg font-black tracking-tight">{title}</p>
      {count && (
        <p className={`text-sm font-semibold ${filled ? "text-white/90" : "text-gray-900 dark:text-gray-100"}`}>{count}</p>
      )}
      <p className={`mt-1 flex-1 text-sm leading-relaxed ${filled ? "text-white/75" : "text-gray-600 dark:text-gray-300"}`}>{detail}</p>
      <span className={`mt-4 inline-flex items-center gap-1.5 text-sm font-semibold ${filled ? "text-[#FFC72C]" : "text-[#1B2C4F] dark:text-[#FFC72C]"}`}>
        {cta}
        <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}

/** One thing this browser looked at, with how long ago. */
function RecentCard({ item, index }: { item: RecentItem; index: PlatIndex | null }) {
  const row = item.kind === "course" ? index?.courses.find((c) => c.k === item.key) : undefined;
  return (
    <li>
      <Link
        href={item.href}
        className="flex h-full items-center gap-3 rounded-xl border border-gray-200 px-3 py-2.5 transition hover:border-[#1B2C4F]/40 hover:bg-gray-50 dark:border-white/10 dark:hover:border-[#FFC72C]/40 dark:hover:bg-white/5"
      >
        {item.kind === "course" ? (
          <GradeBadge gpa={row?.g} terms={row?.r ?? 0} size="sm" />
        ) : (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-300">
            {item.kind === "professor" ? <User className="h-4 w-4" /> : <Layers className="h-4 w-4" />}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">
            {item.kind === "course" && <span className="mr-1.5 font-mono text-xs font-bold text-[#182B49] dark:text-[#FFCD00]">{item.key}</span>}
            {item.label}
          </span>
          <span className="block text-xs text-gray-500 dark:text-gray-400">
            {item.kind === "professor" ? "Professor" : item.kind === "department" ? "Department" : "Course"} · {agoLabel(item.at)}
          </span>
        </span>
      </Link>
    </li>
  );
}
