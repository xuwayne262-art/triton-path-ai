"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, GraduationCap, Layers, Search, Sparkles, Star, TrendingUp } from "lucide-react";
import PlatShell from "@/components/plat/PlatShell";
import CourseRow from "@/components/plat/CourseRow";
import PassTimeline from "@/components/plat/PassTimeline";
import ProfessorRow from "@/components/plat/ProfessorShelf";
import SearchResults, { type Combined } from "@/components/plat/SearchResults";
import {
  confidentGpa, loadIndex, loadProfessors, professorHref, searchCourses, searchProfessors,
  type CourseRow as Row, type PlatIndex, type ProfessorRecord,
} from "@/lib/plat";
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
 * Search matters, but it only helps someone who already knows what to type. The
 * shelves below exist so a student who knows nothing still lands on real courses.
 *
 * The page runs on a 12-column grid rather than one centred measure. Everything
 * used to sit in a single max-w-3xl stack, which left the page hanging in the
 * middle of a wide screen with empty gutters on both sides; the department index
 * and the planner rail now hold those edges.
 */
export default function HomePage() {
  const router = useRouter();
  const [data, setData] = useState<PlatIndex | null>(null);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);


  const [profs, setProfs] = useState<ProfessorRecord[]>([]);
  useEffect(() => { loadIndex().then(setData).catch(() => {}); }, []);
  useEffect(() => { loadProfessors().then((d) => setProfs(d.professors)).catch(() => {}); }, []);

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

  const shelves = useMemo(() => {
    if (!data) return null;
    const pool = data.courses.filter(REAL_CLASS);

    const easiest = varied(
      [...pool]
        .filter((c) => c.g != null && c.g > 0)
        .sort((a, b) => confidentGpa(b) - confidentGpa(a)),
      6,
    );

    return { easiest };
  }, [data]);

  /** Subjects with the most on-schedule courses — the left rail's index. */
  const busiest = useMemo(() => {
    if (!data) return null;
    return [...data.subjects]
      .filter((s) => s.offered > 0)
      .sort((a, b) => b.offered - a.offered)
      .slice(0, 12);
  }, [data]);

  const go = (href: string | undefined) => { if (href) router.push(href); };

  return (
    <PlatShell hideSearch>
      {/* ── Hero: headline and search on the left, the term on the right ────── */}
      <section className="relative overflow-hidden border-b border-gray-200 bg-gradient-to-br from-slate-50 via-white to-slate-50 dark:border-white/10 dark:from-[#101a2b] dark:via-[#0d1420] dark:to-[#101a2b]">
        {/* a single soft wash, off-centre, so the band is not flat white */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-40 -top-40 h-[32rem] w-[32rem] rounded-full bg-[#1B2C4F]/[0.04] blur-3xl dark:bg-[#FFC72C]/[0.05]"
        />

        <div className="relative mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
          <div className="grid gap-12 lg:grid-cols-12 lg:gap-14">
            {/* Left: the pitch and the way in */}
            <div className="lg:col-span-7">
              <span className="inline-flex items-center gap-2 rounded-full border border-[#1B2C4F]/15 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#1B2C4F] shadow-sm dark:border-[#FFC72C]/25 dark:bg-white/5 dark:text-[#FFC72C]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#FFC72C]" />
                {data ? data.meta.termName : "Loading"}
              </span>

              <h1 className="mt-5 text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl lg:text-[3.4rem]">
                Know the curve
                <br />
                <span className="text-[#1B2C4F] dark:text-[#FFC72C]">before you enroll.</span>
              </h1>

              <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-gray-600 dark:text-gray-300">
                {data
                  ? `${data.meta.gradeRecords.toLocaleString()} published UCSD grade distributions from ${data.meta.years}, matched to the professors actually teaching in ${data.meta.termName}.`
                  : "Loading UCSD grade distributions…"}
              </p>

              <div className="relative mt-8 max-w-xl">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, flat.length - 1)); }
                    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
                    else if (e.key === "Enter") { e.preventDefault(); go(flat[active]); }
                  }}
                  placeholder="CSE 11, organic chemistry, Joe Politz…"
                  className="w-full rounded-2xl border border-gray-200 bg-white py-4 pl-12 pr-4 text-sm shadow-sm outline-none transition
                             placeholder:text-gray-400 focus:border-[#1B2C4F] focus:shadow-lg focus:ring-4 focus:ring-[#1B2C4F]/5
                             dark:border-white/10 dark:bg-white/5 dark:text-gray-100 dark:focus:border-[#FFC72C] dark:focus:ring-[#FFC72C]/10"
                />
                {q.trim().length >= 2 && (
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

              {/* Department shortcuts — a starting point when you have no code in mind */}
              <div className="mt-5 flex max-w-xl flex-wrap items-center gap-1.5">
                {QUICK_DEPTS.map((d) => (
                  <Link
                    key={d}
                    href={`/courses/${d}`}
                    className="rounded-full border border-gray-200 bg-white px-3 py-1 font-mono text-xs font-semibold text-gray-600 transition hover:border-[#1B2C4F] hover:text-[#1B2C4F] dark:border-white/10 dark:bg-white/5 dark:text-gray-300 dark:hover:border-[#FFC72C] dark:hover:text-[#FFC72C]"
                  >
                    {d}
                  </Link>
                ))}
                <Link href="/courses" className="px-2 text-xs font-semibold text-gray-500 hover:underline dark:text-gray-400">
                  all {DEPARTMENTS.length} departments →
                </Link>
              </div>
            </div>

            {/* Right: the term itself — numbers and the enrollment clock */}
            <div className="lg:col-span-5">
              <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
                <div className="h-1 bg-gradient-to-r from-[#1B2C4F] via-[#FFC72C] to-[#1B2C4F]" />
                <div className="p-6">
                  <div className="flex items-baseline justify-between gap-3">
                    <h2 className="text-sm font-bold tracking-tight">
                      {data?.meta.termName ?? "This term"} at a glance
                    </h2>
                    <span className="font-mono text-[11px] text-gray-400">{data?.meta.term}</span>
                  </div>

                  <dl className="mt-5 grid grid-cols-3 gap-3">
                    <Stat label="on the schedule" value={data?.meta.offered} />
                    <Stat label="courses catalogued" value={data?.meta.catalogCourses} />
                    <Stat label="professors rated" value={profs.length || undefined} />
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

      {/* ── Body: index on the left, courses centre, planner on the right ───── */}
      <div className="mx-auto max-w-7xl px-4 pb-20 pt-10 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-12 lg:gap-10">
          {/* Left rail — the department index that used to be one line of chips */}
          <aside className="lg:col-span-3">
            <div className="lg:sticky lg:top-24">
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
                        <span className="min-w-0 flex-1 truncate text-xs text-gray-600 group-hover:underline dark:text-gray-300">
                          {s.name}
                        </span>
                        <span className="shrink-0 font-mono text-[11px] tabular-nums text-gray-400">
                          {s.offered}
                        </span>
                      </Link>
                    ))
                  : <p className="py-10 text-center text-xs text-gray-400">Loading…</p>}
              </div>

              <Link
                href="/courses"
                className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#1B2C4F] hover:underline dark:text-[#FFC72C]"
              >
                All {DEPARTMENTS.length} departments <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </aside>

          {/* Centre — the actual recommendations */}
          <div className="lg:col-span-6">
            <Shelf
              icon={<TrendingUp className="h-4 w-4" />}
              title="Kindest grading this term"
              blurb="Real lecture courses with several years of history behind the average — not 12-seat seminars."
              rows={shelves?.easiest}
              href="/ge"
              hrefLabel="More easy courses"
            />

            {/* People, not courses. Open a department to rank its whole faculty. */}
            <section className="mt-10">
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
                {data?.meta.termName ?? "current"} schedule. Open any department to see the same ranking
                for its whole faculty.
              </p>

              <div className="mt-3 overflow-hidden rounded-2xl border border-gray-200 dark:border-white/10">
                {topProfs
                  ? topProfs.map((p) => <ProfessorRow key={p.n} prof={p} />)
                  : <p className="py-12 text-center text-sm text-gray-400">Loading…</p>}
              </div>
            </section>
          </div>

          {/* Right rail — where the planner lives instead of one banner at the end */}
          <aside className="lg:col-span-3">
            <div className="space-y-4 lg:sticky lg:top-24">
              <Link
                href="/planner"
                className="group block overflow-hidden rounded-2xl bg-gradient-to-br from-[#1B2C4F] to-[#24406e] p-5 text-white shadow-sm transition hover:shadow-xl"
              >
                <Sparkles className="h-5 w-5 text-[#FFC72C]" />
                <p className="mt-3 text-sm font-bold">Plan the whole degree</p>
                <p className="mt-1.5 text-xs leading-relaxed text-white/70">
                  Drop saved courses into the four-year planner and check them against your major.
                </p>
                <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-[#FFC72C]">
                  Open the planner
                  <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                </span>
              </Link>

              <div className="rounded-2xl border border-gray-200 p-5 dark:border-white/10">
                <GraduationCap className="h-5 w-5 text-[#1B2C4F] dark:text-[#FFC72C]" />
                <p className="mt-3 text-sm font-bold">Hunting a GE?</p>
                <p className="mt-1.5 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                  Every approved list, by college, sorted by how the course has actually graded.
                </p>
                <Link
                  href="/ge"
                  className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-[#1B2C4F] hover:underline dark:text-[#FFC72C]"
                >
                  Browse GE lists <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>

              <p className="px-1 text-[11px] leading-relaxed text-gray-400 dark:text-gray-500">
                Letter badges average every published grade record for a course, weighted by terms
                taught — not a grade any one student received.
              </p>
            </div>
          </aside>
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
      <dd className="text-xl font-black tabular-nums tracking-tight">
        {value != null ? value.toLocaleString() : <span className="text-gray-300 dark:text-gray-600">—</span>}
      </dd>
      <p className="mt-0.5 text-[11px] leading-tight text-gray-500 dark:text-gray-400">{label}</p>
    </div>
  );
}

function Shelf({
  icon, title, blurb, rows, note, href, hrefLabel,
}: {
  icon: React.ReactNode;
  title: string;
  blurb: string;
  rows: Row[] | undefined;
  note?: (row: Row) => string | undefined;
  href: string;
  hrefLabel: string;
}) {
  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-bold">{icon}{title}</h2>
        <Link href={href} className="text-xs font-semibold text-[#1B2C4F] hover:underline dark:text-[#FFC72C]">
          {hrefLabel} →
        </Link>
      </div>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{blurb}</p>

      <div className="mt-3 overflow-hidden rounded-2xl border border-gray-200 dark:border-white/10">
        {rows
          ? rows.map((c) => <CourseRow key={c.k} row={c} note={note?.(c)} />)
          : <p className="py-12 text-center text-sm text-gray-400">Loading…</p>}
      </div>
    </section>
  );
}
