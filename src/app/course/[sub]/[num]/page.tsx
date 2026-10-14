"use client";

import { use, useEffect, useId, useMemo, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookMarked, ChevronRight, ExternalLink, LogIn, MapPin } from "lucide-react";
import PlatShell from "@/components/plat/PlatShell";
import { PAGE_GAP, PAGE_PAD, PAGE_TITLE, SECTION_TITLE } from "@/components/plat/typeScale";
import Disclosure from "@/components/plat/Disclosure";
import CourseRow from "@/components/plat/CourseRow";
import PrereqText from "@/components/plat/PrereqText";
import TermGradesChart, { type TermPoint } from "@/components/plat/TermGradesChart";
import SeatHistoryChart, { type SeatDay } from "@/components/plat/SeatHistoryChart";
import { GradeBadge } from "@/components/plat/Grade";
import SectionPicker from "@/components/plat/SectionPicker";
import ChoiceSummary from "@/components/plat/ChoiceSummary";
import InstructorRow from "@/components/plat/InstructorRow";
import { useShortlist } from "@/components/plat/useShortlist";
import { usePlannerEntry } from "@/components/plat/usePlannerEntry";
import { useSignedIn, useSignInHref } from "@/components/plat/useSignedIn";
import { useNoteVisit } from "@/components/plat/useRecent";
import { useTheme } from "@/components/plat/theme";
import {
  ENROLLMENT_PASSES, HttpError, courseHref, dayLabel, levelBand, loadBuildings, loadIndex, loadProfessors, loadSubject,
  prereqKnown, professorFor, sortCourses, termName, termOrder, typicalGrade,
  type BuildingsFile, type CourseDetail, type PlatIndex, type ProfRecord, type ProfessorRecord, type SubjectFile,
} from "@/lib/plat";
import {
  BUILDING_CODE, CODE, INSTRUCTOR, TSS_HINT, TYPE,
  forcedSelection, groupSections, isChoosable, isOneOff, typeLabel,
  type LectureFamily, type SectionSelection,
} from "@/lib/sections";
import { decodeChoice, encodeChoice, summarizeChoice } from "@/lib/sectionChoice";
import { seatSpan, spanLabel, sumSeatsAt } from "@/lib/freshness";
import { ADD_INTENT_KEY, addIntentHref, storedIntent } from "@/lib/planIntent";
import { tallySectionRows, talliedRows } from "@/lib/seats/tally";
import { quarterByKey } from "@/lib/housing/terms";
import { collegeForSubject, departmentForSubject } from "@/data/ucsdStructure";
import type { CoursePin } from "@/components/plat/CourseMap";

const CourseMap = dynamic(() => import("@/components/plat/CourseMap"), {
  ssr: false,
  loading: () => <div className="h-40 w-full animate-pulse rounded-xl bg-slate-100 dark:bg-white/5" />,
});

/** How many past terms show before "Show all". */
const TERMS_SHOWN = 8;

// The choice in the address bar (`?pick=B,LA:B03`), read once per course so a
// reload, a shared link or a return from sign-in comes back to it.
const noSubscribe = () => () => {};
const readPick = () => new URLSearchParams(window.location.search).get("pick");

function writePick(sel: SectionSelection | undefined) {
  const url = new URL(window.location.href);
  if (sel) url.searchParams.set("pick", encodeChoice(sel));
  else url.searchParams.delete("pick");
  window.history.replaceState(null, "", url.pathname + url.search + url.hash);
}

/** The choice a course makes for you: its only section, with any single-option parts. */
function onlyChoice(families: LectureFamily[]): SectionSelection | undefined {
  return families.length === 1 ? forcedSelection(families) ?? undefined : undefined;
}

export default function CourseDetailPage({
  params,
}: {
  params: Promise<{ sub: string; num: string }>;
}) {
  const raw = use(params);
  const sub = decodeURIComponent(raw.sub).toUpperCase();
  const num = decodeURIComponent(raw.num);
  const code = `${sub} ${num}`;
  const router = useRouter();

  const [index, setIndex] = useState<PlatIndex | null>(null);
  const [subject, setSubject] = useState<SubjectFile | null>(null);
  const [buildings, setBuildings] = useState<BuildingsFile | null>(null);
  const [profs, setProfs] = useState<ProfessorRecord[] | null>(null);
  const [history, setHistory] = useState<SeatDay[]>([]);
  /**
   * "missing" when the subject has no file at all; "error" when the file could
   * not be fetched. They used to be one state, so a dropped connection told a
   * student that CSE 12 is not a course.
   */
  const [failed, setFailed] = useState<"missing" | "error" | null>(null);
  const [attempt, setAttempt] = useState(0);
  const { has, toggle } = useShortlist();
  const signedIn = useSignedIn();
  const signInHref = useSignInHref();
  const { theme } = useTheme();

  useEffect(() => { loadIndex().then(setIndex).catch(() => {}); }, [attempt]);
  useEffect(() => { loadBuildings().then(setBuildings).catch(() => {}); }, []);
  useEffect(() => { loadProfessors().then((f) => setProfs(f.professors)).catch(() => setProfs([])); }, []);
  useEffect(() => {
    loadSubject(sub)
      .then(setSubject)
      .catch((err: unknown) => setFailed(err instanceof HttpError && err.status === 404 ? "missing" : "error"));
  }, [sub, attempt]);

  // Navigating to another subject must not show the previous one's data while
  // the new file loads, so drop it during render rather than after a paint.
  const [loadedFor, setLoadedFor] = useState(sub);
  if (loadedFor !== sub) {
    setLoadedFor(sub);
    setSubject(null);
    setFailed(null);
  }

  const detail: CourseDetail | undefined = subject?.courses[code];
  const row = index?.courses.find((c) => c.k === code);
  const title = detail?.t ?? row?.t;
  const term = index?.meta.term ?? null;
  const termLabel = index?.meta.termName ?? "This term";

  // ── The section choice ─────────────────────────────────────────────────
  const families = useMemo(() => groupSections(detail?.sec ?? []), [detail]);
  const urlPick = useSyncExternalStore(noSubscribe, readPick, () => null);
  const planner = usePlannerEntry(code, term);
  const [selection, setSelectionState] = useState<SectionSelection | undefined>(undefined);
  const [chosenFor, setChosenFor] = useState<string | null>(null);
  // Opens on the choice in the address, else the sections this course has in
  // the Planner (checked against this term's sections), else its only one.
  if (detail && term && chosenFor !== code) {
    setChosenFor(code);
    const fromPlanner = planner?.sections ? decodeChoice(encodeChoice(planner.sections), families) : null;
    setSelectionState(decodeChoice(urlPick, families) ?? fromPlanner ?? onlyChoice(families));
  }
  const setSelection = (next: SectionSelection | undefined) => {
    setSelectionState(next);
    writePick(next);
  };

  /**
   * Hands the choice to the Planner: the course, and its sections when the
   * choice is complete. The intent rides in the Planner's URL, through sign-in
   * when need be, with a nonce this tab keeps so the Planner knows it was a
   * click here and not a link from somewhere (lib/planIntent.ts).
   */
  const addToPlanner = () => {
    const summary = summarizeChoice(detail?.sec ?? [], families, selection);
    const intent = {
      code,
      pick: summary?.complete && selection ? encodeChoice(selection) : null,
      nonce: crypto.randomUUID(),
    };
    try { sessionStorage.setItem(ADD_INTENT_KEY, storedIntent(intent, Date.now())); } catch { /* the Planner will ask instead */ }
    const target = addIntentHref(intent);
    if (signedIn === false) {
      const from = window.location.pathname + window.location.search;
      router.push(`/login?next=${encodeURIComponent(target)}&from=${encodeURIComponent(from)}`);
    } else {
      router.push(target);
    }
  };

  // ── Seats over time ────────────────────────────────────────────────────
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  useEffect(() => {
    if (!term || !detail?.offered) return;
    let live = true;
    fetch(`/api/seats?course=${encodeURIComponent(code)}&term=${encodeURIComponent(term)}`)
      .then((r) => (r.ok ? r.json() : { points: [] }))
      .then((b: { points?: SeatDay[] }) => { if (live) { setHistory(b.points ?? []); setHistoryFor(code); } })
      .catch(() => {});
    return () => { live = false; };
  }, [code, term, detail?.offered]);

  useNoteVisit(title ? { kind: "course", key: code, label: title, href: courseHref(code) } : null);

  const dept = departmentForSubject(sub) ?? collegeForSubject(sub);
  const known = useMemo(() => {
    const codes = new Set(index?.courses.map((c) => c.k) ?? []);
    return (c: string) => codes.has(c);
  }, [index]);

  /** This term's instructors, best grade history first; then the rest. */
  const teaching = useMemo(
    () => [...(detail?.profs ?? [])].filter((p) => p.cur === 1).sort((a, b) => b.g - a.g),
    [detail],
  );
  const past = useMemo(() => detail?.profs.filter((p) => p.cur !== 1) ?? [], [detail]);

  /** Each instructor's newest term in this course, "Fall 2021". */
  const latestOf = useMemo(() => {
    const out = new Map<string, string>();
    for (const h of detail?.hist ?? []) {
      const name = detail?.profs[h[1]]?.i;
      if (!name) continue;
      const had = out.get(name);
      if (!had || termOrder(h[0]) > termOrder(had)) out.set(name, h[0]);
    }
    return out;
  }, [detail]);

  /** Who answers to which name: a course's "Joe Politz" is the archive's "Joseph Gibbs Politz". */
  const profiles = useMemo(() => {
    const m = new Map<string, ProfessorRecord | null>();
    if (profs) for (const p of detail?.profs ?? []) m.set(p.i, professorFor(profs, p.i));
    return m;
  }, [profs, detail]);
  const profileOf = (name: string) => profiles.get(name) ?? null;

  /** "Lecture B" for each family a person's name heads this term. */
  const teachesOf = (prof: ProfRecord) => {
    const profile = profileOf(prof.i);
    const names = new Set([prof.i, ...(profile ? [profile.n, ...(profile.a ?? [])] : [])]);
    return families
      .filter((f) => f.lecture && String(f.lecture[INSTRUCTOR] ?? "").split(/,\s*/).some((n) => names.has(n)))
      .map((f) => `${typeLabel(f.lecture![TYPE])} ${f.key}`);
  };

  const verdict = typicalGrade(detail?.gpa, detail?.terms);
  const saved = has(code);
  const sectionCount = useMemo(
    () => new Set((detail?.sec ?? []).filter(isChoosable).map((s) => s[CODE])).size,
    [detail],
  );

  // Seats as the dataset counted them, dated by those same counts.
  const seatsNow = useMemo(() => (detail?.sec?.length ? tallySectionRows(detail.sec) : null), [detail]);
  const seatsAt = useMemo(() => {
    const rows = talliedRows(detail?.sec ?? []);
    const times = rows.map((s) => (typeof s[20] === "string" && s[20] ? s[20] : null));
    return sumSeatsAt(times, times.some(Boolean) ? detail?.seatsAt ?? null : null);
  }, [detail]);
  const seatTimeSpan = useMemo(() => seatSpan(talliedRows(detail?.sec ?? []).map((s) => (typeof s[20] === "string" ? s[20] : null))), [detail]);
  const snapshotDay = seatsAt
    ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(seatsAt))
    : null;
  const seatPoints = useMemo((): SeatDay[] => {
    const byDay = new Map<string, SeatDay>();
    // An undated count gets no point: a chart cannot place it, and dating it
    // by when the site read Class Planner would invent a measurement.
    if (seatsNow && snapshotDay) byDay.set(snapshotDay, { day: snapshotDay, ...seatsNow });
    if (historyFor === code) for (const p of history) byDay.set(p.day, p);
    return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
  }, [seatsNow, snapshotDay, history, historyFor, code]);

  // Where it meets: each building a weekly meeting uses, with what meets there.
  const places = useMemo(() => {
    const out = new Map<string, { code: string; name: string; ll: [number, number] | null; what: Set<string> }>();
    for (const s of detail?.sec ?? []) {
      if (isOneOff(s) || !isChoosable(s)) continue;
      const bcode = typeof s[BUILDING_CODE] === "string" ? (s[BUILDING_CODE] as string) : "";
      if (!bcode) continue;
      const b = buildings?.buildings[bcode];
      if (!out.has(bcode)) out.set(bcode, { code: bcode, name: b?.n ?? (s[5] || bcode), ll: b?.ll ?? null, what: new Set() });
      out.get(bcode)!.what.add(typeLabel(s[TYPE]).toLowerCase());
    }
    return [...out.values()];
  }, [detail, buildings]);
  const pins = useMemo((): CoursePin[] =>
    places.filter((p) => p.ll).slice(0, 8).map((p) => ({ code: p.code, name: p.name, ll: p.ll! })), [places]);

  const termPoints = useMemo((): TermPoint[] => (detail?.hist ?? [])
    .filter((h) => h[2] != null && detail?.profs[h[1]])
    .map((h) => ({ term: h[0], series: detail!.profs[h[1]].i, gpa: h[2] as number, aRate: h[3] })), [detail]);
  const highlight = useMemo(() => {
    const count = new Map<string, number>();
    for (const p of termPoints) count.set(p.series, (count.get(p.series) ?? 0) + 1);
    const now = teaching.map((p) => p.i).filter((n) => count.has(n));
    const pool = now.length ? now : [...count.keys()];
    return pool.sort((a, b) => (count.get(b) ?? 0) - (count.get(a) ?? 0)).slice(0, 3);
  }, [termPoints, teaching]);

  // More of the same department at the same level this term, best grades first.
  const related = useMemo(() => {
    if (!index || !row) return [];
    const subs = new Set(dept?.subjects ?? [sub]);
    const band = levelBand(row);
    const pool = index.courses.filter((c) => c.k !== code && c.o === 1 && subs.has(c.s) && levelBand(c) === band && c.g != null && c.r >= 2);
    return sortCourses(pool, "grade").slice(0, 4);
  }, [index, row, dept, sub, code]);

  if (failed === "error") {
    return (
      <PlatShell>
        <div className="mx-auto max-w-2xl px-4 py-24 text-center">
          <h1 className={PAGE_TITLE}>Couldn&apos;t load {code}</h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            The course data did not arrive. Check your connection and try again.
          </p>
          <button
            type="button"
            onClick={() => { setFailed(null); setAttempt((n) => n + 1); }}
            className="mt-6 rounded-lg bg-[#182B49] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1e3a63] dark:bg-[#FFCD00] dark:text-[#182B49]"
          >
            Try again
          </button>
        </div>
      </PlatShell>
    );
  }

  if (failed === "missing" || (subject && !detail)) {
    return (
      <PlatShell>
        <div className="mx-auto max-w-2xl px-4 py-24 text-center">
          <h1 className={PAGE_TITLE}>{code} isn&apos;t in the dataset</h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            It may be graduate-only or recently retired.
          </p>
          <Link href={`/courses/${sub}`} className="mt-6 inline-block text-sm font-semibold text-[#182B49] underline dark:text-[#FFCD00]">
            Browse {sub}
          </Link>
        </div>
      </PlatShell>
    );
  }

  const quarter = quarterByKey(term);
  const leads = detail?.unl ?? [];
  const offered = detail?.offered === 1;
  const ratingFor = index ? { term: index.meta.term, termName: index.meta.termName, code } : null;
  const summaryProps = {
    code, detail, families, selection, termLabel, signedIn, planner,
    onAdd: addToPlanner,
    onClear: () => setSelection(undefined),
  };

  return (
    <PlatShell>
      <div className={`mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 ${PAGE_PAD}`}>
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
          <Link href="/courses" className="hover:underline">Courses</Link>
          <ChevronRight className="h-3 w-3" aria-hidden />
          <Link href={`/courses/${dept?.id ?? sub}`} className="hover:underline">{dept?.name ?? subject?.name ?? sub}</Link>
          <ChevronRight className="h-3 w-3" aria-hidden />
          <span className="text-gray-800 dark:text-gray-200" aria-current="page">{code}</span>
        </nav>

        {/* ── What it is, how it has graded, and the two actions ──────────── */}
        <header className="mt-5 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between lg:gap-10">
          <div className="flex min-w-0 items-start gap-4">
            <GradeBadge gpa={detail?.gpa} terms={detail?.terms ?? 0} size="lg" />
            <div className="min-w-0">
              <p className="font-mono text-sm font-bold text-[#182B49] dark:text-[#FFCD00]">
                {code}
                {detail?.u && <span className="ml-2 font-sans text-xs font-medium text-gray-600 dark:text-gray-400">{parseFloat(detail.u)} units</span>}
              </p>
              <h1 className={`mt-0.5 ${PAGE_TITLE}`}>{title ?? "…"}</h1>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                {detail ? <HistoryLine detail={detail} letter={verdict?.letter} /> : "Loading grade history…"}
              </p>
              {detail?.desc && <Description text={detail.desc} />}
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {signedIn === false ? (
              <Link
                href={signInHref}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium hover:bg-gray-50 dark:border-white/15 dark:hover:bg-white/10"
              >
                <LogIn className="h-4 w-4" aria-hidden />
                Sign in to save
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => toggle(code)}
                aria-pressed={saved}
                title="Saved courses are listed under “Saved from Courses” in your Planner"
                className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  saved
                    ? "bg-[#182B49] text-white dark:bg-[#FFCD00] dark:text-[#182B49]"
                    : "border border-gray-300 hover:bg-gray-50 dark:border-white/15 dark:hover:bg-white/10"
                }`}
              >
                <BookMarked className="h-4 w-4" aria-hidden />
                {saved ? "Saved" : "Save course"}
              </button>
            )}
            {/*
              Straight into UCSD's own enrolment system, on this course. The link
              is only rendered when the build resolved a real TSS module — a URL
              with a missing id lands on a TSS error page, which is worse for a
              student mid-enrolment than no link at all.
            */}
            {detail?.tss && (
              <a
                href={detail.tss}
                target="_blank"
                rel="noreferrer noopener"
                title={TSS_HINT}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium hover:bg-gray-50 dark:border-white/15 dark:hover:bg-white/10"
              >
                Open in <abbr title="Triton Student System" className="no-underline">TSS</abbr>
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                <span className="sr-only">(opens in a new tab; it does not enroll you)</span>
              </a>
            )}
          </div>
        </header>

        {/* ── Can I take it? Before anything else on the page ───────────── */}
        {detail && <Eligibility detail={detail} offered={offered} known={known} catalogued={row ? prereqKnown(row) : offered} />}

        <div className={`${PAGE_GAP} grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-14`}>
          {/* ── Main column ─────────────────────────────────────────────────── */}
          <div className="min-w-0 space-y-12 lg:col-span-7">
            {/* ── Who to take it with ──────────────────────────────────────── */}
            {teaching.length > 0 && (
              <section aria-labelledby="teaching-title">
                <h2 id="teaching-title" className={SECTION_TITLE}>
                  {termLabel}: {teaching.length} {teaching.length === 1 ? "instructor" : "instructors"}
                </h2>
                <TeachingNote code={code} teaching={teaching} latestOf={latestOf} term={term} />
                <div className="mt-4 rounded-xl border border-gray-200 dark:border-white/10">
                  {teaching.map((p, i) => (
                    <InstructorRow
                      key={p.i}
                      prof={p}
                      code={code}
                      profile={profileOf(p.i)}
                      teaches={teachesOf(p)}
                      latest={latestOf.has(p.i) ? termName(latestOf.get(p.i)!) : null}
                      first={i === 0}
                      canRate={signedIn !== false}
                      rating={ratingFor}
                    />
                  ))}
                </div>
                <p className="mt-2 text-xs leading-relaxed text-gray-600 dark:text-gray-400">
                  Letters and averages are past classes from UCSD&rsquo;s grade archive, not a prediction. RMP scores are
                  students&rsquo; ratings of the person across all their courses.{" "}
                  <Link href="/about#letter" className="underline underline-offset-2">How these are worked out</Link>
                </p>
              </section>
            )}

            {/* ── Which sections ──────────────────────────────────────────── */}
            {detail && detail.sec.length > 0 && (
              <section aria-labelledby="sections-title">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 id="sections-title" className={SECTION_TITLE}>{termLabel} sections</h2>
                  <span className="text-xs text-gray-600 dark:text-gray-400">
                    {sectionCount} {sectionCount === 1 ? "section" : "sections"}
                  </span>
                </div>
                <div className="mt-3">
                  <SectionPicker sec={detail.sec} value={selection} onChange={setSelection} />
                </div>
              </section>
            )}

            {/* On a phone the summary follows the choice it describes. */}
            <div className="lg:hidden">
              <ChoiceSummary {...summaryProps} />
            </div>

            {places.length > 0 && (
              <section aria-labelledby="where-title">
                <h2 id="where-title" className={SECTION_TITLE}>Where it meets</h2>
                {pins.length > 0 && (
                  <div className="mt-3">
                    <CourseMap pins={pins} dark={theme === "dark"} />
                  </div>
                )}
                <ul className="mt-3 divide-y divide-gray-100 rounded-xl border border-gray-200 dark:divide-white/5 dark:border-white/10">
                  {places.map((p) => (
                    <li key={p.code} className="flex items-start gap-2 px-3 py-2.5 text-sm text-gray-800 dark:text-gray-200">
                      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#182B49] dark:text-[#FFCD00]" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="font-medium">{p.name}</span>
                        <span className="ml-1.5 font-mono text-xs text-gray-600 dark:text-gray-400">{p.code}</span>
                        <span className="block text-xs text-gray-600 dark:text-gray-400">{[...p.what].join(", ")}</span>
                      </span>
                      {p.ll ? (
                        <a
                          href={`https://www.google.com/maps/dir/?api=1&destination=${p.ll[0]},${p.ll[1]}&travelmode=walking`}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="shrink-0 text-xs font-semibold text-[#182B49] hover:underline dark:text-[#FFCD00]"
                        >
                          Directions<span className="sr-only"> to {p.name} (Google Maps, new tab)</span>
                        </a>
                      ) : (
                        <span className="shrink-0 text-xs text-gray-600 dark:text-gray-400">No map location published</span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* ── Everything else, one click away ──────────────────────────── */}
            <div>
              {leads.length > 0 && (
                <Disclosure title="Leads to" hint={`${leads.length} ${leads.length === 1 ? "course" : "courses"}`}>
                  <LeadsTo code={code} leads={leads} />
                </Disclosure>
              )}

              {detail && (detail.hist?.length ?? 0) > 0 && (
                <Disclosure title="Every term's grades" hint={`${detail.hist!.length} ${detail.hist!.length === 1 ? "term" : "terms"}`}>
                  <PastTerms detail={detail} />
                </Disclosure>
              )}

              {past.length > 0 && (
                <Disclosure title="Past instructors" hint={`${past.length}`}>
                  <div className="rounded-xl border border-gray-200 dark:border-white/10">
                    {past.map((p, i) => (
                      <InstructorRow
                        key={p.i}
                        prof={p}
                        code={code}
                        profile={profileOf(p.i)}
                        teaches={[]}
                        latest={latestOf.has(p.i) ? termName(latestOf.get(p.i)!) : null}
                        first={i === 0}
                        rating={null}
                        canRate={false}
                      />
                    ))}
                  </div>
                </Disclosure>
              )}
            </div>

            {offered && seatPoints.length > 0 && (
              <section aria-labelledby="seats-title">
                <h2 id="seats-title" className={SECTION_TITLE}>Seats over time</h2>
                {seatPoints.length === 1 && seatsNow ? (
                  <p className="mt-2 rounded-xl bg-slate-50 px-4 py-3 text-sm leading-relaxed text-gray-700 dark:bg-white/5 dark:text-gray-200">
                    One count so far: {seatsNow.enrolled.toLocaleString()} of {seatsNow.capacity.toLocaleString()} seats
                    taken{seatsNow.waitlist ? `, ${seatsNow.waitlist} waitlisted` : ""}, across{" "}
                    {talliedRows(detail?.sec ?? []).some((s) => s[TYPE] === "LE") ? "all lectures" : "all sections"},
                    counted {seatTimeSpan ? spanLabel(seatTimeSpan) : dayLabel(seatPoints[0].day, { weekday: false })}.
                    A trend needs more than one count, so none is drawn.
                  </p>
                ) : (
                  <>
                    <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                      {termLabel}, all lectures together, against the enrollment passes. Each dot is a day UCSD&rsquo;s
                      Class Planner counted the seats.
                    </p>
                    <div className="mt-3">
                      <SeatHistoryChart
                        points={seatPoints}
                        passes={ENROLLMENT_PASSES}
                        classesStart={quarter?.classes ?? null}
                        title={`${code} seats taken over time`}
                      />
                    </div>
                  </>
                )}
              </section>
            )}

            {termPoints.length > 1 && (
              <section aria-labelledby="grades-title">
                <h2 id="grades-title" className={SECTION_TITLE}>Grades by term</h2>
                <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                  Each dot is one instructor&rsquo;s class average for one term. Every value is listed under
                  &ldquo;Every term&rsquo;s grades&rdquo;.
                </p>
                <div className="mt-3">
                  <TermGradesChart
                    points={termPoints}
                    highlight={highlight}
                    otherLabel="Other instructors"
                    title={`${code} class averages by term`}
                  />
                </div>
              </section>
            )}

            {related.length > 0 && row && (
              <section aria-labelledby="related-title">
                <h2 id="related-title" className={SECTION_TITLE}>
                  More {["lower-division", "upper-division", "graduate"][levelBand(row)]} {dept?.name ?? sub} courses this term
                </h2>
                <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                  On the {termLabel} schedule, highest historical average first.
                </p>
                <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 dark:border-white/10">
                  {related.map((c) => <CourseRow key={c.k} row={c} />)}
                </div>
              </section>
            )}
          </div>

          {/* ── Rail: the choice, in view while it is being made ─────────── */}
          <aside className="hidden min-w-0 lg:col-span-5 lg:block" aria-label={`${code} at a glance`}>
            <div className="sticky top-32 xl:top-24">
              <ChoiceSummary {...summaryProps} />
            </div>
          </aside>
        </div>
      </div>
    </PlatShell>
  );
}

/** The course's own history in one sentence: the average, its letter, and how much stands behind it. */
function HistoryLine({ detail, letter }: { detail: CourseDetail; letter: string | undefined }) {
  if (!letter || detail.gpa == null) return <>No grade distribution has been published for this course.</>;
  const terms = [...(detail.hist ?? [])].map((h) => h[0]).sort((a, b) => termOrder(a) - termOrder(b));
  const years = terms.length ? `${termName(terms[0]).slice(-4)}–${termName(terms[terms.length - 1]).slice(-4)}` : "";
  return (
    <>
      <span className="font-semibold">Historical average {detail.gpa.toFixed(2)} GPA ({letter})</span>
      {" "}over {detail.terms} graded {detail.terms === 1 ? "term" : "terms"}{years ? `, ${years}` : ""}, all instructors.
      {detail.terms === 1 && <span className="font-semibold text-amber-800 dark:text-amber-300"> Limited history.</span>}
      {" "}
      <Link href="/about#letter" className="whitespace-nowrap text-gray-600 underline underline-offset-2 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white">
        How it&rsquo;s worked out
      </Link>
    </>
  );
}

/** The catalog's description, two lines until asked for the rest. */
function Description({ text }: { text: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2 max-w-3xl">
      <p id={id} className={`text-sm leading-relaxed text-gray-600 dark:text-gray-400 ${open ? "" : "line-clamp-2"}`}>{text}</p>
      {text.length > 160 && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={id}
          className="mt-1 text-xs font-semibold text-[#182B49] hover:underline dark:text-[#FFCD00]"
        >
          {open ? "Show less" : "Full description"}
        </button>
      )}
    </div>
  );
}

/**
 * Prerequisites and restrictions, where they are seen before a section is
 * chosen. "None listed" and "not on record" are different answers: a retired
 * course the current catalog does not list has no prerequisite record at all,
 * which is not a promise that it has none.
 */
function Eligibility({
  detail, offered, known, catalogued,
}: { detail: CourseDetail; offered: boolean; known: (code: string) => boolean; catalogued: boolean }) {
  return (
    <div className="mt-6 grid max-w-4xl gap-2">
      <p className="rounded-lg bg-amber-50 px-4 py-2.5 text-sm leading-relaxed text-amber-950 dark:bg-amber-500/10 dark:text-amber-100">
        <span className="font-semibold">Prerequisites: </span>
        {detail.pre ? (
          <PrereqText text={detail.pre} known={known} />
        ) : catalogued ? (
          `none listed in the UCSD General Catalog${offered ? " or on this term's schedule" : ""}.`
        ) : (
          "not on record. This course is not in the current catalog, so check with the department."
        )}
      </p>
      {detail.res && (
        <p className="rounded-lg bg-rose-50 px-4 py-2.5 text-sm leading-relaxed text-rose-950 dark:bg-rose-500/10 dark:text-rose-100">
          <span className="font-semibold">Enrollment restrictions: </span>{detail.res}
        </p>
      )}
    </div>
  );
}

const surname = (name: string) => name.split(" ").slice(-1)[0];

/**
 * How this term's instructors compare here, with how recent each record is.
 * Only instructors with a published history in this course are compared;
 * one with none is named as such rather than counted as grading alike, and a
 * record from years ago says so — CSE 11's Politz history ends in Fall 2021.
 */
function TeachingNote({
  code, teaching, latestOf, term,
}: { code: string; teaching: ProfRecord[]; latestOf: Map<string, string>; term: string | null }) {
  const known = teaching.filter((p) => p.g > 0 && p.n > 0).sort((a, b) => b.g - a.g);
  const unknown = teaching.filter((p) => !(p.g > 0 && p.n > 0));
  const when = (p: ProfRecord) => (latestOf.has(p.i) ? `, latest ${termName(latestOf.get(p.i)!)}` : "");
  const lines: string[] = [];
  if (known.length > 1) {
    const best = known[0];
    const worst = known[known.length - 1];
    lines.push(best.g - worst.g >= 0.3
      ? `Their past ${code} averages differ: ${surname(best.i)} ${best.g.toFixed(2)} (${best.n} ${best.n === 1 ? "term" : "terms"}${when(best)}) and ${surname(worst.i)} ${worst.g.toFixed(2)} (${worst.n} ${worst.n === 1 ? "term" : "terms"}${when(worst)}).`
      : `Their past ${code} averages are within 0.3 of each other.`);
  }
  // A record whose newest term is three or more years before this one is old
  // enough to say so: it may not be how they teach it now.
  const oldest = term
    ? known
      .map((p) => ({ p, t: latestOf.get(p.i) }))
      .filter((x): x is { p: ProfRecord; t: string } => Boolean(x.t))
      .filter((x) => termOrder(x.t) <= termOrder(term) - 30)
    : [];
  for (const { p, t } of oldest) lines.push(`${surname(p.i)}'s ${code} record ends in ${termName(t)}.`);
  if (unknown.length) {
    lines.push(`${unknown.map((p) => p.i).join(", ")} ${unknown.length === 1 ? "has" : "have"} no published ${code} record yet.`);
  }
  if (!lines.length) return null;
  return <p className="mt-1 text-xs leading-relaxed text-gray-600 dark:text-gray-400">{lines.join(" ")}</p>;
}

/** The courses whose prerequisites name this one: where it leads. */
function LeadsTo({ code, leads }: { code: string; leads: string[] }) {
  return (
    <div>
      <p className="text-xs text-gray-600 dark:text-gray-400">
        {leads.length} {leads.length === 1 ? "course lists" : "courses list"} {code} among their prerequisites, alone or as one of several options.
      </p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {leads.map((c) => (
          <li key={c}>
            <Link
              href={courseHref(c)}
              className="inline-block rounded-full border border-gray-200 px-2.5 py-1 font-mono text-xs font-semibold text-[#182B49] transition hover:border-[#182B49] dark:border-white/10 dark:text-[#FFCD00] dark:hover:border-[#FFCD00]"
            >
              {c}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Every published term, newest first: the table the "Grades by term" chart draws. */
function PastTerms({ detail }: { detail: CourseDetail }) {
  const [all, setAll] = useState(false);
  const rows = detail.hist ?? [];
  const shown = all ? rows : rows.slice(0, TERMS_SHOWN);
  return (
    <div>
      <table className="w-full text-sm">
        <caption className="sr-only">Average GPA and share of A grades for each published term and instructor</caption>
        <thead>
          <tr className="text-left text-xs text-gray-600 dark:text-gray-400">
            <th scope="col" className="pb-2 font-medium">Term</th>
            <th scope="col" className="pb-2 font-medium">Instructor</th>
            <th scope="col" className="pb-2 text-right font-medium">Class average</th>
            <th scope="col" className="pb-2 text-right font-medium">A&rsquo;s</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((h, i) => (
            <tr key={`${h[0]}-${h[1]}-${i}`} className="border-t border-gray-100 dark:border-white/5">
              <th scope="row" className="py-2 pr-3 text-left font-normal whitespace-nowrap">{termName(h[0])}</th>
              <td className="py-2 pr-3">{detail.profs[h[1]]?.i ?? "Not listed"}</td>
              <td className="py-2 text-right tabular-nums">
                {h[2] != null ? (
                  <span className="inline-flex items-center justify-end gap-2">
                    <GradeBadge gpa={h[2]} terms={2} size="xs" />
                    {h[2].toFixed(2)}
                  </span>
                ) : (
                  <span className="text-gray-600 dark:text-gray-400" title="Pass/no pass, or too small to publish">no GPA published</span>
                )}
              </td>
              <td className="py-2 pl-3 text-right tabular-nums">{Math.round(h[3])}%</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > TERMS_SHOWN && (
        <button type="button" onClick={() => setAll((v) => !v)} className="mt-3 text-xs font-semibold text-[#182B49] hover:underline dark:text-[#FFCD00]">
          {all ? "Show fewer" : `Show all ${rows.length} terms`}
        </button>
      )}
      <p className="mt-3 text-xs leading-relaxed text-gray-600 dark:text-gray-400">
        From the UCSD Associated Students Instructor Grade Archive, which publishes each class&rsquo;s
        average GPA and the share of each letter, not how many students took it.
      </p>
    </div>
  );
}
