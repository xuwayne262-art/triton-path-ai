"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarClock, GraduationCap, Layers, Search, Sparkles, Star, TrendingUp } from "lucide-react";
import PlatShell from "@/components/plat/PlatShell";
import CourseRow from "@/components/plat/CourseRow";
import SearchResults, { type Combined } from "@/components/plat/SearchResults";
import {
  confidentGpa, countdownServerSnapshot, countdownSnapshot, loadIndex, loadProfessors,
  noopSubscribe, professorHref, searchCourses, searchProfessors,
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
 */
export default function HomePage() {
  const router = useRouter();
  const [data, setData] = useState<PlatIndex | null>(null);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);

  const countdown = useSyncExternalStore(noopSubscribe, countdownSnapshot, countdownServerSnapshot);

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

  const shelves = useMemo(() => {
    if (!data) return null;
    const pool = data.courses.filter(REAL_CLASS);

    const easiest = varied(
      [...pool]
        .filter((c) => c.g != null && c.g > 0)
        .sort((a, b) => confidentGpa(b) - confidentGpa(a)),
      6,
    );

    // A shelf about teaching still needs a grade history, or the row reads "–".
    const bestTaught = varied(
      [...pool]
        .filter((c) => (c.pq ?? 0) >= 4 && (c.pn ?? 0) >= 15 && c.g != null && c.g > 0)
        .sort((a, b) => (b.pq ?? 0) - (a.pq ?? 0) || (b.pn ?? 0) - (a.pn ?? 0)),
      6,
    );

    const openToAll = varied(
      [...pool]
        .filter((c) => !c.pr && c.ge?.length && c.g != null && c.g >= 3.3)
        .sort((a, b) => confidentGpa(b) - confidentGpa(a)),
      6,
    );

    return { easiest, bestTaught, openToAll };
  }, [data]);

  const go = (href: string | undefined) => { if (href) router.push(href); };

  return (
    <PlatShell hideSearch>
      {/* ── Search, but not the whole page ─────────────────────────────────── */}
      <section className="border-b border-gray-200 bg-gradient-to-b from-slate-50 to-white dark:border-white/10 dark:from-[#101a2b] dark:to-[#0d1420]">
        <div className="mx-auto max-w-3xl px-4 py-12 sm:py-14">
          <h1 className="text-center text-3xl font-black tracking-tight sm:text-4xl">
            Know the curve before you enroll.
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-center text-sm text-gray-600 dark:text-gray-300">
            {data
              ? `${data.meta.gradeRecords.toLocaleString()} published UCSD grade distributions from ${data.meta.years}, matched to the professors teaching in ${data.meta.termName}.`
              : "Loading UCSD grade distributions…"}
          </p>

          <div className="relative mx-auto mt-7 max-w-xl">
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
              className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-12 pr-4 text-sm shadow-sm outline-none transition
                         placeholder:text-gray-400 focus:border-[#182B49] focus:shadow-md
                         dark:border-white/10 dark:bg-white/5 dark:text-gray-100 dark:focus:border-[#FFCD00]"
            />
            {q.trim().length >= 2 && (
              <div className="absolute left-0 right-0 top-full z-40 mt-2 max-h-[26rem] overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 shadow-xl dark:border-white/10 dark:bg-[#101a2b]">
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
          <div className="mx-auto mt-5 flex max-w-2xl flex-wrap items-center justify-center gap-1.5">
            {QUICK_DEPTS.map((d) => (
              <Link
                key={d}
                href={`/courses/${d}`}
                className="rounded-full border border-gray-200 bg-white px-3 py-1 font-mono text-xs font-semibold text-gray-600 transition hover:border-[#182B49] hover:text-[#182B49] dark:border-white/10 dark:bg-white/5 dark:text-gray-300 dark:hover:border-[#FFCD00] dark:hover:text-[#FFCD00]"
              >
                {d}
              </Link>
            ))}
            <Link href="/courses" className="px-2 text-xs font-semibold text-gray-500 hover:underline dark:text-gray-400">
              all {DEPARTMENTS.length} departments →
            </Link>
          </div>

          {countdown && (
            <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-gray-400">
              <CalendarClock className="h-3.5 w-3.5" />
              {countdown.days} days until {countdown.pass.label}
            </p>
          )}
        </div>
      </section>

      {/* ── Actual courses, on arrival ─────────────────────────────────────── */}
      <div className="mx-auto max-w-3xl px-4 pb-16">
        <Shelf
          icon={<TrendingUp className="h-4 w-4" />}
          title="Kindest grading this term"
          blurb="Real lecture courses with several years of history behind the average — not 12-seat seminars."
          rows={shelves?.easiest}
          href="/ge"
          hrefLabel="More easy courses"
        />
        <Shelf
          icon={<Star className="h-4 w-4" />}
          title="Best-rated professors"
          blurb="Rated 4.0 or better on RateMyProfessors, with at least 15 reviews behind the score."
          rows={shelves?.bestTaught}
          note={(c) => (c.pn ? `${c.pn} reviews` : undefined)}
          href="/courses"
          hrefLabel="Browse departments"
        />
        <Shelf
          icon={<Layers className="h-4 w-4" />}
          title="Easy GEs with no prerequisite"
          blurb="Counts toward a general-education area, and you can enroll right now."
          rows={shelves?.openToAll}
          href="/ge"
          hrefLabel="Pick your college"
        />

        <Link
          href="/planner"
          className="mt-10 flex items-center gap-3 rounded-xl border border-[#182B49]/15 bg-gradient-to-r from-[#182B49] to-[#1e3a63] p-4 text-white transition hover:shadow-lg"
        >
          <Sparkles className="h-5 w-5 shrink-0 text-[#FFCD00]" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">Plan the whole degree</span>
            <span className="block text-xs text-white/70">
              Drop saved courses into the AI four-year planner and check them against your major.
            </span>
          </span>
          <GraduationCap className="h-5 w-5 shrink-0 text-white/50" />
        </Link>
      </div>
    </PlatShell>
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
    <section className="mt-10">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-bold">{icon}{title}</h2>
        <Link href={href} className="text-xs font-semibold text-[#182B49] hover:underline dark:text-[#FFCD00]">
          {hrefLabel} →
        </Link>
      </div>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{blurb}</p>

      <div className="mt-3 overflow-hidden rounded-xl border border-gray-200 dark:border-white/10">
        {rows
          ? rows.map((c) => <CourseRow key={c.k} row={c} note={note?.(c)} />)
          : <p className="py-12 text-center text-sm text-gray-400">Loading…</p>}
      </div>
    </section>
  );
}
