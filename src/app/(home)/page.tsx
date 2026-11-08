"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight, CalendarDays, GraduationCap, Layers, RotateCw, User, X,
} from "lucide-react";
import PlatShell from "@/components/plat/PlatShell";
import { PAGE_PAD, SECTION_TITLE } from "@/components/plat/typeScale";
import CourseRow from "@/components/plat/CourseRow";
import QuarterPicker from "@/components/plat/QuarterPicker";
import AcademicTimelinePanel from "@/components/plat/AcademicTimelinePanel";
import { chooseTerm, useTerm } from "@/components/plat/useTerm";
import ProfessorRow from "@/components/plat/ProfessorShelf";
import SearchCombobox from "@/components/plat/SearchCombobox";
import DiscoverLink from "@/components/plat/DiscoverLink";
import { GradeBadge } from "@/components/plat/Grade";
import { useRecent } from "@/components/plat/useRecent";
import { useNow } from "@/components/plat/useNow";
import {
  CAMPUS, dayLabel, loadGE, sortCourses,
  type CourseRow as Row, type GEFile, type PlatIndex, type ProfessorRecord,
} from "@/lib/plat";
import { loadIndexFor, loadProfessorsFor } from "@/lib/termData";
import { termLabelFor, termPhase, termsServed, withTerm, type TermPhase } from "@/lib/terms";
import { quarterStage } from "@/lib/termTimeline";
import { quarterByKey, todayInSanDiego } from "@/lib/housing/terms";
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
 * The quarter's look on the front page: Winter planning in a cool teal with
 * a calendar, Fall's familiar navy and gold. One layout; only these change.
 */
const LOOK = {
  winter: {
    eyebrow: "text-teal-800 dark:text-teal-300",
    button: "bg-teal-700 text-white hover:bg-teal-800 dark:bg-teal-300 dark:text-[#0d1420] dark:hover:bg-teal-200",
  },
  standard: {
    eyebrow: "text-[#1B2C4F] dark:text-[#FFC72C]",
    button: "bg-[#182B49] text-white hover:bg-[#1e3a63] dark:bg-[#FFCD00] dark:text-[#182B49] dark:hover:bg-[#FFD740]",
  },
} as const;

/**
 * The front door leads with the quarter chosen and what it is for: "Plan
 * Winter 2027" (or Fall 2026), the quarter control, the search and the way
 * into that quarter's planner, then subject shortcuts, one GE entry and Plan
 * with AI. Beside them, one compact academic calendar shows Fall's progress
 * and Winter's dates together, whichever quarter is being browsed; every
 * Winter date opens in a dialog, so the calendar never grows the page. Then
 * courses and professors worth a look, and last the news and the services
 * that are not about a quarter.
 */
export default function HomePage() {
  const [loaded, setLoaded] = useState<{ term: string; index: PlatIndex } | null>(null);
  const [failedTerm, setFailedTerm] = useState<string | null>(null);
  const [ge, setGE] = useState<GEFile | null>(null);
  const [people, setPeople] = useState<{ term: string; profs: ProfessorRecord[] | null } | null>(null);
  const [tick, setTick] = useState(0);
  const [q, setQ] = useState("");
  const resolved = useTerm();
  const term = resolved?.term ?? null;

  // The chosen quarter's courses and professors, each kept with its quarter.
  // A quarter switched away from mid-request is ignored when it lands, so it
  // can never paint over the new one, and a failed one says so with a retry.
  const data = loaded && loaded.term === term ? loaded.index : null;
  const failed = !data && term != null && failedTerm === term;
  const profs = people && people.term === term ? people.profs : undefined;
  useEffect(() => {
    if (!term) return;
    let live = true;
    loadIndexFor(term)
      .then((d) => { if (live) { setLoaded({ term, index: d }); setFailedTerm((f) => (f === term ? null : f)); } })
      .catch(() => { if (live) setFailedTerm(term); });
    loadProfessorsFor(term)
      .then((d) => { if (live) setPeople({ term, profs: d.professors }); })
      .catch(() => { if (live) setPeople({ term, profs: null }); });
    return () => { live = false; };
  }, [term, tick]);
  const retry = () => setTick((n) => n + 1);
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
    if (!profs) return null;
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
  const termName = data?.meta.termName ?? (term ? termLabelFor(term) : "this term");
  const link = (href: string) => withTerm(href, term);
  const news = latestAnnouncement();
  const now = useNow();
  const today = now ? todayInSanDiego(new Date(now)) : null;

  return (
    <PlatShell hideSearch>
      <div className={`mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 ${PAGE_PAD}`}>
        {/* Phones read these in order: the quarter and search, its dates, then shortcuts. */}
        {/* The second row takes any height the dates add, so the shortcuts sit right under the search. */}
        <div className="grid grid-cols-1 gap-x-8 gap-y-6 lg:grid-cols-12 lg:grid-rows-[auto_1fr] lg:items-start">
          {/* ── The quarter chosen, the search and its planner ───────────── */}
          <div className="min-w-0 lg:col-span-6 lg:row-start-1">
            <QuarterLead term={term} today={today} />
            {/* Static on purpose: counts that arrived with the data added a line here and moved everything below it.
                It says on screen what the search result's description promises (HOME_DESCRIPTION, src/lib/siteTitle.ts). */}
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-gray-700 dark:text-gray-300">
              Explore UCSD courses with their historical grades, professor ratings and seats. Find GEs by college and
              build your quarter&rsquo;s schedule.
            </p>

            {/* Which quarter the search, the lists and the planner show. */}
            <QuarterPicker className="mt-4 max-w-2xl" />

            <SearchCombobox
              variant="hero"
              className="mt-3 max-w-2xl"
              value={q}
              onValueChange={setQ}
              placeholder="CSE 11, organic chemistry, Joe Politz…"
            />

            <QuarterActions term={term} today={today} />
          </div>

          {/* ── Fall's progress and Winter's dates, the same for either quarter ── */}
          <div className="min-w-0 lg:col-span-6 lg:col-start-7 lg:row-span-2 lg:row-start-1">
            <AcademicTimelinePanel />
          </div>

          {/* ── Shortcuts: subjects, one GE entry, and Plan with AI ───────── */}
          <div className="min-w-0 lg:col-span-6 lg:row-start-2">
            {searches.length > 0 && (
              <div className="flex max-w-2xl flex-wrap items-center gap-2">
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
            <nav aria-label="Departments" className={`flex max-w-2xl flex-wrap items-center gap-2 ${searches.length ? "mt-4" : ""}`}>
              {QUICK_DEPTS.map((d) => (
                <Link
                  key={d}
                  href={link(`/courses/${d}`)}
                  className="rounded-full border border-gray-200 bg-white px-3 py-1 font-mono text-xs font-semibold text-gray-700 transition hover:border-[#1B2C4F] hover:text-[#1B2C4F] dark:border-white/10 dark:bg-white/5 dark:text-gray-300 dark:hover:border-[#FFC72C] dark:hover:text-[#FFC72C]"
                >
                  {d}
                </Link>
              ))}
              <Link href={link("/courses")} className="px-2 text-xs font-semibold text-gray-700 hover:underline dark:text-gray-300">
                all {DEPARTMENTS.length} departments →
              </Link>
            </nav>
            <div className="mt-4 flex max-w-2xl flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-6">
              <Link href={link("/ge")} className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-[#1B2C4F] hover:underline dark:text-[#FFC72C]">
                <GraduationCap aria-hidden className="h-4 w-4" />
                Find a GE by college
                {geCounts && <span className="font-normal text-gray-600 dark:text-gray-400">· {geCounts.college.toLocaleString()} courses</span>}
              </Link>
              <DiscoverLink className="inline-flex min-h-10 items-center text-sm font-medium text-gray-700 underline underline-offset-4 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white" />
            </div>
          </div>
        </div>

        {/* ── Pick up where you left off ─────────────────────────────────── */}
        {visits.length > 0 && (
          <section className="mt-8" aria-labelledby="recent-title">
            <div className="flex items-baseline justify-between gap-2">
              <h2 id="recent-title" className={SECTION_TITLE}>Recently viewed</h2>
              <button type="button" onClick={clearRecent} className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white">
                <X aria-hidden className="h-3 w-3" /> Clear
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">Kept in this browser only.</p>
            <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {visits.map((v) => <RecentCard key={`${v.kind}:${v.key}`} item={v} index={data} term={term} />)}
            </ul>
          </section>
        )}

        {/* ── The index on the left, the shelves across the rest ─────────── */}
        <div className={`${visits.length > 0 ? "mt-16" : "mt-8"} grid grid-cols-1 gap-14 lg:grid-cols-12 lg:gap-12`}>
          {/* An index, not courses: on a phone it waits below the two shelves. */}
          <aside className="order-last lg:order-none lg:col-span-3" aria-labelledby="busiest-title">
            <h2 id="busiest-title" className={SECTION_TITLE}>Busiest subjects</h2>
            <p className="mt-1 text-xs leading-relaxed text-gray-600 dark:text-gray-400">
              Ranked by how many courses each one is running in {termName}.
            </p>

            <div className="mt-4 overflow-hidden rounded-2xl border border-gray-200 dark:border-white/10">
              {busiest
                ? busiest.map((s) => (
                    <Link
                      key={s.code}
                      href={link(`/courses/${s.code}`)}
                      className="group flex items-center gap-3 border-b border-gray-100 px-3 py-2.5 text-sm transition last:border-b-0 hover:bg-gray-50 dark:border-white/5 dark:hover:bg-white/5"
                    >
                      <span className="w-12 shrink-0 font-mono text-xs font-bold text-[#1B2C4F] dark:text-[#FFC72C]">
                        {s.code}
                      </span>
                      <span className="min-w-0 flex-1 text-sm text-gray-800 group-hover:underline dark:text-gray-200">
                        {s.name}
                      </span>
                      <span className="shrink-0 font-mono text-xs tabular-nums text-gray-600 dark:text-gray-400" aria-label={`${s.offered} courses in ${termName}`}>
                        {s.offered}
                      </span>
                    </Link>
                  ))
                : <ShelfState failed={failed} termName={termName} onRetry={retry} />}
            </div>

            <Link
              href={link("/courses")}
              className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-[#1B2C4F] hover:underline dark:text-[#FFC72C]"
            >
              All {DEPARTMENTS.length} departments <ArrowRight aria-hidden className="h-3 w-3" />
            </Link>
          </aside>

          <div className="space-y-14 lg:col-span-9">
            <section aria-labelledby="highest-title">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="highest-title" className={SECTION_TITLE}>Highest historical averages on the {termName} schedule</h2>
                <Link href={link("/ge")} className="text-xs font-semibold text-[#1B2C4F] hover:underline dark:text-[#FFC72C]">
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
                  : <ShelfState failed={failed} termName={termName} onRetry={retry} tall />}
              </div>
            </section>

            {/* People, not courses. Open a department to rank its whole faculty. */}
            <section aria-labelledby="profs-title">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="profs-title" className={SECTION_TITLE}>Highest-rated professors teaching in {termName}</h2>
                <Link href={link("/courses")} className="text-xs font-semibold text-[#1B2C4F] hover:underline dark:text-[#FFC72C]">
                  Rank a department&rsquo;s professors →
                </Link>
              </div>
              <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                RateMyProfessors overall rating 4.0 or better from at least 15 reviews, across all their courses, and on the{" "}
                {termName} schedule.
              </p>
              <div className="mt-4 overflow-hidden rounded-2xl border border-gray-200 dark:border-white/10">
                {topProfs
                  ? topProfs.map((p) => <ProfessorRow key={p.n} prof={p} />)
                  : <ShelfState failed={profs === null} termName={termName} onRetry={retry} tall what="professors" />}
              </div>
            </section>
          </div>
        </div>

        {/* ── What changed lately, and the services that are not about a quarter ── */}
        <section className="mt-16" aria-labelledby="news-title">
          <h2 id="news-title" className={SECTION_TITLE}>Announcements and student services</h2>
          {news && (
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
          )}
          <p className="mt-4 text-xs leading-relaxed text-gray-600 dark:text-gray-400">
            Also for UCSD students:{" "}
            <Link href="/housing" className="font-semibold text-[#1B2C4F] hover:underline dark:text-[#FFC72C]">Housing</Link>
            {" "}for sublets from @ucsd.edu students, and{" "}
            <Link href="/import" className="font-semibold text-[#1B2C4F] hover:underline dark:text-[#FFC72C]">Academic History</Link>
            {" "}to import your completed courses.
          </p>
        </section>
      </div>
    </PlatShell>
  );
}

/** Where the chosen quarter is in its year, from San Diego's date; null until both are known. */
function phaseOf(term: string | null, today: string | null): TermPhase | null {
  return term && today ? termPhase(term, today) : null;
}

const lookOf = (term: string | null) => (term?.startsWith("WI") ? LOOK.winter : LOOK.standard);

/** "Plan Winter 2027" while it is ahead; the quarter's name while it runs (the calendar beside it has its week); "ended" after. */
function QuarterLead({ term, today }: { term: string | null; today: string | null }) {
  const phase = phaseOf(term, today);
  // The heading's room is held while the browser decides the quarter, so nothing below moves.
  if (!term || !phase) return <div aria-hidden className="h-7 w-56 animate-pulse rounded bg-gray-100 motion-reduce:animate-none dark:bg-white/5 sm:h-8" />;
  const name = termLabelFor(term);
  const q = quarterByKey(term);
  const stage = q && today ? quarterStage(q, today) : null;
  return (
    <h1 className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xl font-semibold tracking-tight sm:text-2xl">
      {phase === "upcoming" ? <>Plan {name}</> : name}
      {stage?.kind === "ended" && (
        <span className={`text-sm font-semibold ${lookOf(term).eyebrow}`}>Ended {dayLabel(stage.end, { year: true })}</span>
      )}
    </h1>
  );
}

/** The quarter's labelled way into the Planner, and a switch to the other quarter when it is the one to plan. */
function QuarterActions({ term, today }: { term: string | null; today: string | null }) {
  const phase = phaseOf(term, today);
  if (!term || !phase) return <div aria-hidden className="mt-4 h-10" />;
  const season = termLabelFor(term).split(" ")[0];
  // The quarter still to come, offered from one that is under way or over.
  const ahead = phase === "upcoming" ? null : termsServed().find((t) => t.code !== term && phaseOf(t.code, today) === "upcoming") ?? null;
  return (
    <div className="mt-4 flex max-w-2xl flex-wrap items-center gap-x-4 gap-y-2">
      <Link
        href={withTerm("/planner", term)}
        className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3.5 text-sm font-semibold shadow-sm transition motion-reduce:transition-none ${lookOf(term).button}`}
      >
        <CalendarDays aria-hidden className="h-4 w-4" />
        {phase === "upcoming" ? `Open ${season} planner` : `Open ${season} schedule`}
      </Link>
      {ahead && (
        <button
          type="button"
          onClick={() => chooseTerm(ahead.code)}
          className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-teal-800 hover:underline dark:text-teal-300"
        >
          Plan {ahead.name} <ArrowRight aria-hidden className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/** A shelf whose quarter is still loading, or failed to: never an empty list that looks like an answer. */
function ShelfState({ failed, termName, onRetry, tall = false, what = "courses" }: {
  failed: boolean; termName: string; onRetry: () => void; tall?: boolean; what?: string;
}) {
  return failed ? (
    <div role="alert" className={`flex flex-col items-center justify-center gap-2 px-4 text-center text-sm text-gray-700 dark:text-gray-300 ${tall ? "py-12" : "py-10"}`}>
      <p>{termName} {what} didn&rsquo;t load.</p>
      <button type="button" onClick={onRetry} className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1 text-xs font-semibold hover:bg-gray-50 dark:border-white/15 dark:hover:bg-white/10">
        <RotateCw aria-hidden className="h-3.5 w-3.5" /> Try again
      </button>
    </div>
  ) : (
    <p className={`text-center text-sm text-gray-600 dark:text-gray-400 ${tall ? "py-12" : "py-10"}`}>Loading {termName}…</p>
  );
}

/** One thing this browser looked at, with how long ago. */
function RecentCard({ item, index, term }: { item: RecentItem; index: PlatIndex | null; term: string | null }) {
  const row = item.kind === "course" ? index?.courses.find((c) => c.k === item.key) : undefined;
  return (
    <li>
      <Link
        href={withTerm(item.href, term)}
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
