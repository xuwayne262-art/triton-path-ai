"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight, BookOpen, CalendarDays, ChevronRight, GraduationCap, Layers, User, X,
} from "lucide-react";
import PlatShell from "@/components/plat/PlatShell";
import QuarterClock from "@/components/plat/QuarterClock";
import { PAGE_PAD, SECTION_TITLE } from "@/components/plat/typeScale";
import CourseRow from "@/components/plat/CourseRow";
import PassTimeline from "@/components/plat/PassTimeline";
import ProfessorRow from "@/components/plat/ProfessorShelf";
import SearchCombobox from "@/components/plat/SearchCombobox";
import DiscoverLink from "@/components/plat/DiscoverLink";
import { GradeBadge } from "@/components/plat/Grade";
import { useRecent } from "@/components/plat/useRecent";
import { useNow } from "@/components/plat/useNow";
import {
  CAMPUS, dayLabel, loadGE, loadIndex, loadProfessors, sortCourses,
  type CourseRow as Row, type GEFile, type PlatIndex, type ProfessorRecord,
} from "@/lib/plat";
import { announcementHref, isNewAnnouncement, latestAnnouncement } from "@/lib/announcements";
import { SHELF_RULE, shelfEligible } from "@/lib/recommend";
import { agoLabel, type RecentItem } from "@/lib/recent";
import { DEPARTMENTS } from "@/data/ucsdStructure";

/** Departments worth a shortcut chip; the rest are one click further in. */
const QUICK_DEPTS = ["CSE", "MATH", "COGS", "ECON", "BILD", "PHYS", "CHEM", "PSYC", "POLI", "DSC"];

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
 * The front door leads with what a visit is for: one line on what the site
 * is, and the search, with the quarter as a compact strip under it. Beside
 * them, the three things a student comes to do — browse courses, find a GE,
 * plan a week — in one list, with Housing and the Academic History as the
 * student services they are. Then the latest announcement, whatever this browser looked at last,
 * and shelves of real courses for a student who knows nothing yet.
 */
export default function HomePage() {
  const [data, setData] = useState<PlatIndex | null>(null);
  const [ge, setGE] = useState<GEFile | null>(null);
  const [profs, setProfs] = useState<ProfessorRecord[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => { loadIndex().then(setData).catch(() => {}); }, []);
  useEffect(() => { loadProfessors().then((d) => setProfs(d.professors)).catch(() => {}); }, []);
  useEffect(() => { loadGE().then(setGE).catch(() => {}); }, []);
  const { items: recent, clear: clearRecent } = useRecent();

  /** Distinct courses on any college's GE list, and on the DEI list. */
  const geCounts = useMemo(() => {
    if (!ge) return null;
    const college = new Set<string>();
    for (const a of ge.areas) if (a.college !== CAMPUS) for (const c of ge.lists[a.key] ?? []) college.add(c);
    return { college: college.size, dei: ge.lists[`${CAMPUS}:DEI`]?.length ?? 0 };
  }, [ge]);

  /** Rated 4.0+ with a real sample size, and actually on this term's schedule. */
  const topProfs = useMemo(() => {
    if (!profs.length) return null;
    return profs
      .filter((p) => p.cur && (p.q ?? 0) >= 4 && (p.nr ?? 0) >= 15)
      .sort((a, b) => (b.q ?? 0) - (a.q ?? 0) || (b.nr ?? 0) - (a.nr ?? 0))
      .slice(0, 6);
  }, [profs]);

  // The same order as "Highest historical average" everywhere else, so the
  // shelf's letters descend too, over a pool whose rule the shelf states.
  const highest = useMemo(
    () => (data ? varied(sortCourses(data.courses.filter(shelfEligible), "grade"), 6) : null),
    [data],
  );

  /** Subjects with the most on-schedule courses — the left rail's index. */
  const busiest = useMemo(() => {
    if (!data) return null;
    return [...data.subjects]
      .filter((s) => s.offered > 0)
      .sort((a, b) => b.offered - a.offered)
      .slice(0, 12);
  }, [data]);

  const searches = recent.filter((r) => r.kind === "search");
  const visits = recent.filter((r) => r.kind !== "search");
  const term = data?.meta.termName ?? "this term";
  const news = latestAnnouncement();
  const now = useNow();

  return (
    <PlatShell hideSearch>
      <div className={`mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 ${PAGE_PAD}`}>
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-12">
          {/* ── What this is, and the way in ──────────────────────────────── */}
          <div className="min-w-0 lg:col-span-7">
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
              Grades, professors and seats for every UCSD course
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-700 dark:text-gray-300">
              See how a course has graded since 2015, who teaches it in {term}, and which sections fit your week.
              {data && (
                <span className="text-gray-600 dark:text-gray-400">
                  {" "}{data.meta.gradeRecords.toLocaleString()} published grade distributions ·{" "}
                  {data.meta.offered.toLocaleString()} courses on the {data.meta.termName} schedule.
                </span>
              )}
            </p>

            <SearchCombobox
              variant="hero"
              className="mt-5 max-w-2xl"
              value={q}
              onValueChange={setQ}
              placeholder="CSE 11, organic chemistry, Joe Politz…"
            />

            {/* Recent searches first, then department shortcuts. */}
            {searches.length > 0 && (
              <div className="mt-4 flex max-w-2xl flex-wrap items-center gap-2">
                <span className="mr-0.5 text-xs text-gray-600 dark:text-gray-400">Recent searches</span>
                {searches.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => {
                      setQ(s.key);
                      document.querySelector<HTMLInputElement>('input[role="combobox"]')?.focus();
                    }}
                    className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-800 transition hover:border-[#1B2C4F] dark:border-white/10 dark:bg-white/5 dark:text-gray-200 dark:hover:border-[#FFC72C]"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
            <nav aria-label="Departments" className="mt-4 flex max-w-2xl flex-wrap items-center gap-2">
              {QUICK_DEPTS.map((d) => (
                <Link
                  key={d}
                  href={`/courses/${d}`}
                  className="rounded-full border border-gray-200 bg-white px-3 py-1 font-mono text-xs font-semibold text-gray-700 transition hover:border-[#1B2C4F] hover:text-[#1B2C4F] dark:border-white/10 dark:bg-white/5 dark:text-gray-300 dark:hover:border-[#FFC72C] dark:hover:text-[#FFC72C]"
                >
                  {d}
                </Link>
              ))}
              <Link href="/courses" className="px-2 text-xs font-semibold text-gray-700 hover:underline dark:text-gray-300">
                all {DEPARTMENTS.length} departments →
              </Link>
            </nav>

            <DiscoverLink className="mt-4 inline-flex min-h-10 items-center text-sm font-semibold text-[#1B2C4F] underline underline-offset-4 dark:text-[#FFC72C]" />

            {/* The quarter as context, under the search it must not outrank. */}
            <QuarterClock className="mt-8 max-w-2xl" />
          </div>

          {/* ── What to do ────────────────────────────────────────────────── */}
          <div className="flex min-w-0 flex-col gap-5 lg:col-span-5">
            <nav aria-label="Start here" className="overflow-hidden rounded-2xl border border-gray-200 dark:border-white/10">
              <EntryRow
                href="/courses"
                icon={<BookOpen className="h-4 w-4" />}
                title="Browse courses"
                detail="Every course's grades, professors and seats, by department"
              />
              <EntryRow
                href="/ge"
                icon={<GraduationCap className="h-4 w-4" />}
                title="Find a GE"
                count={geCounts ? `${geCounts.college.toLocaleString()} on college lists` : undefined}
                detail={geCounts ? `By college, with past grades, plus ${geCounts.dei} for DEI and the AHI list` : "By college, with past grades"}
              />
              <EntryRow
                href="/planner"
                icon={<CalendarDays className="h-4 w-4" />}
                title="Plan your week"
                detail="Sections on a calendar and a map, and all four years against your major · sign in with @ucsd.edu"
                filled
              />
              <div className="border-t border-gray-100 px-5 py-3 dark:border-white/5">
                <PassTimeline termName={data?.meta.termName} />
              </div>
            </nav>

            <p className="text-xs leading-relaxed text-gray-600 dark:text-gray-400">
              Also for UCSD students:{" "}
              <Link href="/housing" className="font-semibold text-[#1B2C4F] hover:underline dark:text-[#FFC72C]">Housing</Link>
              {" "}for sublets from @ucsd.edu students, and{" "}
              <Link href="/import" className="font-semibold text-[#1B2C4F] hover:underline dark:text-[#FFC72C]">Academic History</Link>
              {" "}to import your completed courses.
            </p>
          </div>
        </div>

        {/* ── What changed lately: the newest announcement, one click from all of them ── */}
        {news && (
          <section className="mt-16" aria-labelledby="news-title">
            <h2 id="news-title" className={SECTION_TITLE}>Announcements</h2>
            <Link
              href={announcementHref(news)}
              className="group mt-4 flex flex-col gap-3 rounded-2xl border border-gray-200 px-5 py-4 transition hover:border-[#1B2C4F]/40 hover:bg-gray-50 sm:flex-row sm:items-center sm:gap-8 dark:border-white/10 dark:hover:border-[#FFC72C]/40 dark:hover:bg-white/5"
            >
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                  <time dateTime={news.date}>{dayLabel(news.date)}</time>
                  {now && isNewAnnouncement(news, now) && (
                    <span className="rounded-full bg-[#FFCD00] px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-[#182B49]">New</span>
                  )}
                </span>
                <span className="mt-1 block text-sm font-semibold group-hover:underline">{news.title}</span>
                <span className="mt-1 block max-w-3xl text-xs leading-relaxed text-gray-700 dark:text-gray-300">{news.summary}</span>
              </span>
              <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-[#1B2C4F] dark:text-[#FFC72C]">
                Read more
              </span>
            </Link>
          </section>
        )}

        {/* ── Pick up where you left off ─────────────────────────────────── */}
        {visits.length > 0 && (
          <section className="mt-16" aria-labelledby="recent-title">
            <div className="flex items-baseline justify-between gap-2">
              <h2 id="recent-title" className={SECTION_TITLE}>Recently viewed</h2>
              <button type="button" onClick={clearRecent} className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white">
                <X aria-hidden className="h-3 w-3" /> Clear
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">Kept in this browser only.</p>
            <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {visits.map((v) => <RecentCard key={`${v.kind}:${v.key}`} item={v} index={data} />)}
            </ul>
          </section>
        )}

        {/* ── The index on the left, the shelves across the rest ─────────── */}
        <div className="mt-16 grid grid-cols-1 gap-14 lg:grid-cols-12 lg:gap-12">
          {/* An index, not courses: on a phone it waits below the two shelves. */}
          <aside className="order-last lg:order-none lg:col-span-3" aria-labelledby="busiest-title">
            <h2 id="busiest-title" className={SECTION_TITLE}>Busiest subjects</h2>
            <p className="mt-1 text-xs leading-relaxed text-gray-600 dark:text-gray-400">
              Ranked by how many courses each one is running this term.
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
                      <span className="min-w-0 flex-1 text-sm text-gray-800 group-hover:underline dark:text-gray-200">
                        {s.name}
                      </span>
                      <span className="shrink-0 font-mono text-xs tabular-nums text-gray-600 dark:text-gray-400" aria-label={`${s.offered} courses this term`}>
                        {s.offered}
                      </span>
                    </Link>
                  ))
                : <p className="py-10 text-center text-xs text-gray-600 dark:text-gray-400">Loading…</p>}
            </div>

            <Link
              href="/courses"
              className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-[#1B2C4F] hover:underline dark:text-[#FFC72C]"
            >
              All {DEPARTMENTS.length} departments <ArrowRight aria-hidden className="h-3 w-3" />
            </Link>
          </aside>

          <div className="space-y-14 lg:col-span-9">
            <section aria-labelledby="highest-title">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="highest-title" className={SECTION_TITLE}>Highest historical averages on the {term} schedule</h2>
                <Link href="/ge" className="text-xs font-semibold text-[#1B2C4F] hover:underline dark:text-[#FFC72C]">
                  Find GEs by college →
                </Link>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-gray-600 dark:text-gray-400">
                {SHELF_RULE} A high past average says nothing about workload, and some courses still have
                restrictions, so check each one.{" "}
                <Link href="/about#letter" className="underline underline-offset-2 hover:text-gray-900 dark:hover:text-white">How the letter is worked out</Link>
              </p>
              <div className="mt-4 overflow-hidden rounded-2xl border border-gray-200 dark:border-white/10">
                {highest
                  ? highest.map((c) => <CourseRow key={c.k} row={c} />)
                  : <p className="py-12 text-center text-sm text-gray-600 dark:text-gray-400">Loading…</p>}
              </div>
            </section>

            {/* People, not courses. Open a department to rank its whole faculty. */}
            <section aria-labelledby="profs-title">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="profs-title" className={SECTION_TITLE}>Highest-rated professors teaching now</h2>
                <Link href="/courses" className="text-xs font-semibold text-[#1B2C4F] hover:underline dark:text-[#FFC72C]">
                  Rank a department&rsquo;s professors →
                </Link>
              </div>
              <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                RateMyProfessors overall rating 4.0 or better from at least 15 reviews, across all their courses, and on the{" "}
                {data?.meta.termName ?? "current"} schedule.
              </p>
              <div className="mt-4 overflow-hidden rounded-2xl border border-gray-200 dark:border-white/10">
                {topProfs
                  ? topProfs.map((p) => <ProfessorRow key={p.n} prof={p} />)
                  : <p className="py-12 text-center text-sm text-gray-600 dark:text-gray-400">Loading…</p>}
              </div>
            </section>
          </div>
        </div>
      </div>
    </PlatShell>
  );
}

/** One of the things a student comes to do: what it is, and where it goes. */
function EntryRow({
  href, icon, title, count, detail, filled = false,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  count?: string;
  detail: string;
  filled?: boolean;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-4 border-b border-gray-100 px-5 py-3.5 transition last:border-b-0 hover:bg-gray-50 dark:border-white/5 dark:hover:bg-white/5"
    >
      <span
        aria-hidden
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
          filled
            ? "bg-[#1B2C4F] text-[#FFC72C] dark:bg-[#FFC72C] dark:text-[#1B2C4F]"
            : "bg-[#1B2C4F]/[0.06] text-[#1B2C4F] dark:bg-[#FFC72C]/10 dark:text-[#FFC72C]"
        }`}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-sm font-semibold">{title}</span>
          {count && <span className="text-xs text-gray-600 dark:text-gray-400">{count}</span>}
        </span>
        <span className="mt-0.5 block text-xs leading-relaxed text-gray-700 dark:text-gray-300">{detail}</span>
      </span>
      <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-gray-400 transition group-hover:translate-x-0.5 group-hover:text-gray-600 motion-reduce:transition-none dark:text-gray-500 dark:group-hover:text-gray-300" />
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
          <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300">
            {item.kind === "professor" ? <User className="h-4 w-4" /> : <Layers className="h-4 w-4" />}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">
            {item.kind === "course" && <span className="mr-1.5 font-mono text-xs font-bold text-[#182B49] dark:text-[#FFCD00]">{item.key}</span>}
            {item.label}
          </span>
          <span className="block text-xs text-gray-600 dark:text-gray-400">
            {item.kind === "professor" ? "Professor" : item.kind === "department" ? "Department" : "Course"} · {agoLabel(item.at)}
          </span>
        </span>
      </Link>
    </li>
  );
}
