"use client";

import { use, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { BookMarked, ChevronDown, ChevronRight, ExternalLink, LogIn, MapPin, Star } from "lucide-react";
import PlatShell from "@/components/plat/PlatShell";
import { LABEL, PAGE_GAP, PAGE_PAD, PAGE_TITLE, SECTION_TITLE } from "@/components/plat/typeScale";
import Disclosure from "@/components/plat/Disclosure";
import CourseRow from "@/components/plat/CourseRow";
import PrereqText from "@/components/plat/PrereqText";
import TermGradesChart, { type TermPoint } from "@/components/plat/TermGradesChart";
import SeatHistoryChart, { type SeatDay } from "@/components/plat/SeatHistoryChart";
import { GradeBadge, LoadTag } from "@/components/plat/Grade";
import GradeBars from "@/components/plat/GradeBars";
import SectionPicker from "@/components/plat/SectionPicker";
import RateProfessor from "@/components/plat/RateProfessor";
import { useShortlist } from "@/components/plat/useShortlist";
import { ratingKey, useTermRatings } from "@/components/plat/useTermRatings";
import { useSignedIn, useSignInHref } from "@/components/plat/useSignedIn";
import { useNoteVisit } from "@/components/plat/useRecent";
import { useTheme } from "@/components/plat/theme";
import {
  ENROLLMENT_PASSES, HttpError, courseHref, dayLabel, geLabel, levelBand, loadBuildings, loadIndex, loadSubject,
  prettyRange, ratingTone, refreshedDay, refreshedLabel, sortCourses, termName, typicalGrade, universityRequirement,
  type BuildingsFile, type CourseDetail, type PlatIndex, type ProfRecord, type SubjectFile,
} from "@/lib/plat";
import {
  BUILDING_CODE, CODE, DAYS, END, START, TSS_HINT, TYPE, isChoosable, isOneOff,
} from "@/lib/sections";
import { tallySectionRows } from "@/lib/seats/tally";
import { quarterByKey } from "@/lib/housing/terms";
import { collegeForSubject, departmentForSubject } from "@/data/ucsdStructure";
import type { CoursePin } from "@/components/plat/CourseMap";

const CourseMap = dynamic(() => import("@/components/plat/CourseMap"), {
  ssr: false,
  loading: () => <div className="h-44 w-full animate-pulse rounded-xl bg-slate-100 dark:bg-white/5" />,
});

/** How many "leads to" courses show before "Show all". */
const LEADS_SHOWN = 12;
/** How many past terms show before "Show all". */
const TERMS_SHOWN = 8;

export default function CourseDetailPage({
  params,
}: {
  params: Promise<{ sub: string; num: string }>;
}) {
  const raw = use(params);
  const sub = decodeURIComponent(raw.sub).toUpperCase();
  const num = decodeURIComponent(raw.num);
  const code = `${sub} ${num}`;

  const [index, setIndex] = useState<PlatIndex | null>(null);
  const [subject, setSubject] = useState<SubjectFile | null>(null);
  const [buildings, setBuildings] = useState<BuildingsFile | null>(null);
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

  // The seat counts kept day by day, when the deployment keeps them.
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

  /**
   * This term's instructors, best grade history first, so the option the summary
   * recommends is the one that leads the list and opens by default.
   */
  const teaching = useMemo(
    () => [...(detail?.profs ?? [])].filter((p) => p.cur === 1).sort((a, b) => b.g - a.g),
    [detail],
  );
  const past = useMemo(() => detail?.profs.filter((p) => p.cur !== 1) ?? [], [detail]);

  const verdict = typicalGrade(detail?.gpa, detail?.terms);
  const saved = has(code);
  // Sections a student can pick, counted once each.
  const sectionCount = useMemo(
    () => new Set((detail?.sec ?? []).filter(isChoosable).map((s) => s[CODE])).size,
    [detail],
  );
  const seatsNow = useMemo(() => (detail?.sec?.length ? tallySectionRows(detail.sec) : null), [detail]);
  const finals = useMemo(() => (detail?.sec ?? []).filter((s) => isOneOff(s) && s[TYPE] === "FI"), [detail]);

  // Where it meets: each building a weekly meeting uses, once.
  const pins = useMemo((): CoursePin[] => {
    if (!detail || !buildings) return [];
    const out = new Map<string, CoursePin>();
    for (const s of detail.sec) {
      if (isOneOff(s)) continue;
      const b = s[BUILDING_CODE] && buildings.buildings[s[BUILDING_CODE] as string];
      if (b && !out.has(s[BUILDING_CODE] as string)) out.set(s[BUILDING_CODE] as string, { code: s[BUILDING_CODE] as string, name: b.n, ll: b.ll });
    }
    return [...out.values()].slice(0, 6);
  }, [detail, buildings]);

  // The dataset's own snapshot is one dated point; the kept history adds the rest.
  const snapshotDay = refreshedDay(index?.meta.refreshed);
  const seatPoints = useMemo((): SeatDay[] => {
    const byDay = new Map<string, SeatDay>();
    if (seatsNow && snapshotDay) byDay.set(snapshotDay, { day: snapshotDay, ...seatsNow });
    if (historyFor === code) for (const p of history) byDay.set(p.day, p);
    return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
  }, [seatsNow, snapshotDay, history, historyFor, code]);

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
          <p className="mt-2 text-sm text-gray-500">
            The course data did not arrive — check your connection and try again.
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
          <p className="mt-2 text-sm text-gray-500">
            It may be graduate-only or recently retired.
          </p>
          <Link href={`/courses/${sub}`} className="mt-6 inline-block text-sm font-semibold text-[#182B49] underline dark:text-[#FFCD00]">
            Browse {sub}
          </Link>
        </div>
      </PlatShell>
    );
  }

  const termLabel = index?.meta.termName ?? "This term";
  const quarter = quarterByKey(term);
  const leads = detail?.unl ?? [];

  // The newest count there is: a day's kept count when there is one after the
  // dataset's own snapshot, so the card and the chart's last dot agree.
  const latest = seatPoints[seatPoints.length - 1];
  const facts = (
    <FactsCard
      detail={detail}
      termLabel={termLabel}
      seats={latest ?? seatsNow}
      asOf={latest ? dayLabel(latest.day, { weekday: false, year: true }) : refreshedLabel(index?.meta.refreshed)}
      finals={finals}
    />
  );

  return (
    <PlatShell>
      <div className={`mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 ${PAGE_PAD}`}>
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
          <Link href="/courses" className="hover:underline">Courses</Link>
          <ChevronRight className="h-3 w-3" aria-hidden />
          <Link href={`/courses/${dept?.id ?? sub}`} className="hover:underline">{dept?.name ?? subject?.name ?? sub}</Link>
          <ChevronRight className="h-3 w-3" aria-hidden />
          <span className="text-gray-700 dark:text-gray-200">{code}</span>
        </nav>

        {/* ── The answer, up front ─────────────────────────────────────────── */}
        {/* The grade badge stays large — it is the answer — while the title
            is set at page-title size and the two actions sit to its right on
            a laptop, rather than on a row of their own beneath it. */}
        <header className="mt-5 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between lg:gap-10">
          <div className="flex min-w-0 items-start gap-4">
            <GradeBadge gpa={detail?.gpa} terms={detail?.terms ?? 0} size="lg" />
            <div className="min-w-0">
              <p className="font-mono text-sm font-bold text-[#182B49] dark:text-[#FFCD00]">{code}</p>
              <h1 className={`mt-0.5 ${PAGE_TITLE}`}>{title ?? "…"}</h1>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                {detail ? summary(detail, verdict?.letter, teaching) : "Loading grade history…"}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {signedIn === false ? (
              <Link
                href={signInHref}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium hover:bg-gray-50 dark:border-white/15 dark:hover:bg-white/10"
              >
                <LogIn className="h-4 w-4" />
                Sign in to save to your planner
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => toggle(code)}
                className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  saved
                    ? "bg-[#182B49] text-white dark:bg-[#FFCD00] dark:text-[#182B49]"
                    : "border border-gray-300 hover:bg-gray-50 dark:border-white/15 dark:hover:bg-white/10"
                }`}
              >
                <BookMarked className="h-4 w-4" />
                {saved ? "Saved" : "Save to planner"}
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
                Book on <abbr title="Triton Student System" className="no-underline">TSS</abbr>
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        </header>

        <div className={`${PAGE_GAP} grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-14`}>
          {/* ── Main column ─────────────────────────────────────────────────── */}
          <div className="min-w-0 space-y-12 lg:col-span-7">
            {/* On a phone the facts lead; on a laptop they sit in the rail. */}
            <div className="lg:hidden">{facts}</div>

            <section>
              <h2 className={SECTION_TITLE}>About this course</h2>
              {detail?.desc ? (
                <p className="mt-3 text-sm leading-relaxed text-gray-700 dark:text-gray-200">{detail.desc}</p>
              ) : (
                <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
                  {detail ? "The UCSD General Catalog has no description for this course." : "Loading…"}
                </p>
              )}
              {detail?.pre && (
                <p className="mt-5 rounded-lg bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-950 dark:bg-amber-500/10 dark:text-amber-100">
                  <span className="font-semibold">Prerequisites: </span>
                  <PrereqText text={detail.pre} known={known} />
                </p>
              )}
              {detail?.res && (
                <p className="mt-3 rounded-lg bg-rose-50 px-4 py-3 text-sm leading-relaxed text-rose-950 dark:bg-rose-500/10 dark:text-rose-100">
                  <span className="font-semibold">Enrolment restrictions: </span>{detail.res}
                </p>
              )}
            </section>

            {leads.length > 0 && <LeadsTo code={code} leads={leads} />}

            {/* ── Who to take it with ──────────────────────────────────────── */}
            {teaching.length > 0 && (
              <section>
                <h2 className={SECTION_TITLE}>
                  {teaching.length} {teaching.length === 1 ? "instructor" : "instructors"} teaching this term
                </h2>
                {teaching.length > 1 && (
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Best grade history first.</p>
                )}
                <div className="mt-4 rounded-xl border border-gray-200 dark:border-white/10">
                  {teaching.map((p, i) => (
                    <ProfLine
                      key={p.i}
                      prof={p}
                      first={i === 0}
                      defaultOpen={i === 0}
                      canRate={signedIn !== false}
                      // Rating is per-term, so it needs the loaded term. Past
                      // instructors below get none — rating someone for a term they
                      // are not teaching would be meaningless.
                      rating={index ? { term: index.meta.term, termName: index.meta.termName, code } : null}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* ── Everything else, one click away ──────────────────────────── */}
            <div>
              {detail && detail.sec.length > 0 && (
                <Disclosure
                  title={`${termLabel} sections`}
                  hint={`${sectionCount} ${sectionCount === 1 ? "section" : "sections"}`}
                  defaultOpen
                >
                  <SectionPicker sec={detail.sec} tss={detail.tss} />
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
                    {past.map((p) => <ProfLine key={p.i} prof={p} rating={null} canRate={false} />)}
                  </div>
                </Disclosure>
              )}
            </div>

            {related.length > 0 && row && (
              <section>
                <h2 className={SECTION_TITLE}>
                  More {["lower-division", "upper-division", "graduate"][levelBand(row)]} {dept?.name ?? sub} courses this term
                </h2>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  On the {termLabel} schedule, best grades first.
                </p>
                <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 dark:border-white/10">
                  {related.map((c) => <CourseRow key={c.k} row={c} />)}
                </div>
              </section>
            )}
          </div>

          {/* ── Rail: the term at a glance, then the pictures ──────────────── */}
          <aside className="min-w-0 space-y-6 lg:col-span-5">
            <div className="hidden lg:block">{facts}</div>

            {pins.length > 0 && (
              <section className="rounded-2xl border border-gray-200 p-5 dark:border-white/10">
                <h2 className={SECTION_TITLE}>Where it meets</h2>
                <div className="mt-3">
                  <CourseMap pins={pins} dark={theme === "dark"} />
                </div>
                <ul className="mt-4 space-y-2">
                  {pins.map((p) => (
                    <li key={p.code} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                      <MapPin className="h-3.5 w-3.5 shrink-0 text-[#182B49] dark:text-[#FFCD00]" aria-hidden />
                      <span className="min-w-0 flex-1 truncate">{p.name}</span>
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${p.ll[0]},${p.ll[1]}&travelmode=walking`}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="shrink-0 text-xs font-semibold text-[#182B49] hover:underline dark:text-[#FFCD00]"
                      >
                        Directions
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {detail?.offered === 1 && seatPoints.length > 0 && (
              <section className="rounded-2xl border border-gray-200 p-5 dark:border-white/10">
                <h2 className={SECTION_TITLE}>Seats over time</h2>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {termLabel}, all lectures together, against the enrollment passes.
                </p>
                <div className="mt-3">
                  <SeatHistoryChart
                    points={seatPoints}
                    passes={ENROLLMENT_PASSES}
                    classesStart={quarter?.classes ?? null}
                    title={`${code} seats taken over time`}
                  />
                </div>
                {seatPoints.length < 3 && (
                  <p className="mt-3 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                    Each dot is a day the seats were counted from UCSD&rsquo;s Class Planner, the first on{" "}
                    {dayLabel(seatPoints[0].day, { weekday: false })}. A new one is added every day, so Winter 2027&rsquo;s
                    passes will be the first measured from start to finish.
                  </p>
                )}
              </section>
            )}

            {termPoints.length > 1 && (
              <section className="rounded-2xl border border-gray-200 p-5 dark:border-white/10">
                <h2 className={SECTION_TITLE}>Grades by term</h2>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
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
          </aside>
        </div>
      </div>
    </PlatShell>
  );
}

/** Units, seats, finals and requirements: the facts a student checks before anything else. */
function FactsCard({
  detail, termLabel, seats, asOf, finals,
}: {
  detail: CourseDetail | undefined;
  termLabel: string;
  seats: { enrolled: number; capacity: number; waitlist: number } | null;
  asOf: string | null;
  finals: CourseDetail["sec"];
}) {
  const ges = (detail?.ge ?? []).filter((g) => !universityRequirement(g));
  const reqs = (detail?.ge ?? []).filter((g) => universityRequirement(g));
  const [allGe, setAllGe] = useState(false);
  return (
    <section className="rounded-2xl border border-gray-200 p-5 dark:border-white/10">
      <h2 className={SECTION_TITLE}>{termLabel} at a glance</h2>
      <dl className="mt-4 grid grid-cols-2 gap-3">
        <Fact label="Units" value={detail?.u ? String(parseFloat(detail.u)) : "—"} />
        <Fact
          label="Seats taken"
          value={seats ? `${seats.enrolled.toLocaleString()} / ${seats.capacity.toLocaleString()}` : detail?.offered ? "Not published" : "Not offered"}
          note={seats ? `${seats.waitlist ? `${seats.waitlist} waitlisted · ` : ""}as of ${asOf ?? "the last refresh"}` : undefined}
        />
        {finals.length > 0 && (
          <Fact
            label="Final exam"
            value={dayLabel(finals[0][DAYS])}
            note={prettyRange(finals[0][START], finals[0][END])}
          />
        )}
        <Fact label="On the schedule" value={detail?.offered ? "Yes" : "No"} note={detail?.offered ? termLabel : `Not in ${termLabel}`} />
      </dl>

      {(ges.length > 0 || reqs.length > 0) && (
        <div className="mt-5 border-t border-gray-100 pt-4 dark:border-white/5">
          <p className={LABEL}>Satisfies</p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {reqs.map((g) => (
              <li key={g} className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200">
                {geLabel(g)}
              </li>
            ))}
            {(allGe ? ges : ges.slice(0, 4)).map((g) => (
              <li key={g} className="rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-800 dark:bg-indigo-500/15 dark:text-indigo-200">
                {geLabel(g)}
              </li>
            ))}
          </ul>
          {ges.length > 4 && (
            <button type="button" onClick={() => setAllGe((v) => !v)} className="mt-2 text-xs font-semibold text-[#182B49] hover:underline dark:text-[#FFCD00]">
              {allGe ? "Show fewer" : `Show all ${ges.length} college GE areas`}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function Fact({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-white/5">
      <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold tabular-nums">{value}</dd>
      {note && <dd className="text-xs text-gray-500 dark:text-gray-400">{note}</dd>}
    </div>
  );
}

/** The courses whose prerequisites name this one: where it leads. */
function LeadsTo({ code, leads }: { code: string; leads: string[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? leads : leads.slice(0, LEADS_SHOWN);
  return (
    <section>
      <h2 className={SECTION_TITLE}>Leads to</h2>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
        {leads.length} {leads.length === 1 ? "course lists" : "courses list"} {code} among their prerequisites — alone, or as one of several options.
      </p>
      <ul className="mt-4 flex flex-wrap gap-2">
        {shown.map((c) => (
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
      {leads.length > LEADS_SHOWN && (
        <button type="button" onClick={() => setAll((v) => !v)} className="mt-2 text-xs font-semibold text-[#182B49] hover:underline dark:text-[#FFCD00]">
          {all ? "Show fewer" : `Show all ${leads.length}`}
        </button>
      )}
    </section>
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
        <thead>
          <tr className="text-left text-xs text-gray-500 dark:text-gray-400">
            <th scope="col" className="pb-2 font-medium">Term</th>
            <th scope="col" className="pb-2 font-medium">Instructor</th>
            <th scope="col" className="pb-2 text-right font-medium">Average</th>
            <th scope="col" className="pb-2 text-right font-medium">A&rsquo;s</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((h, i) => (
            <tr key={`${h[0]}-${h[1]}-${i}`} className="border-t border-gray-100 dark:border-white/5">
              <td className="py-2 pr-3 whitespace-nowrap">{termName(h[0])}</td>
              <td className="py-2 pr-3">{detail.profs[h[1]]?.i ?? "—"}</td>
              <td className="py-2 text-right tabular-nums">
                {h[2] != null ? (
                  <span className="inline-flex items-center justify-end gap-2">
                    <GradeBadge gpa={h[2]} terms={2} size="xs" />
                    {h[2].toFixed(2)}
                  </span>
                ) : (
                  <span className="text-gray-500 dark:text-gray-400" title="Pass/no pass, or too small to publish">no GPA</span>
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
      <p className="mt-3 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
        From the UCSD Associated Students Instructor Grade Archive, which publishes each class&rsquo;s
        average GPA and the share of each letter, not how many students took it.
      </p>
    </div>
  );
}

const surname = (name: string) => name.split(" ").slice(-1)[0];

/**
 * One plain-English sentence instead of a strip of four competing numbers.
 *
 * Only instructors who actually have a published history for this course get
 * compared. This sentence used to end "the instructors teaching it grade
 * similarly" whenever it could not find a spread — including when the person
 * teaching had never taught it and so had no number to spread. Saying two
 * people grade alike when one of them has no record is a claim the data does
 * not support, and it is the sentence a student reads first.
 */
function summary(detail: CourseDetail, letter: string | undefined, teaching: ProfRecord[]): string {
  if (!letter) return "No grade distribution has been published for this course yet.";
  const base = `Students typically earn a ${letter} here, across ${detail.terms} graded ${detail.terms === 1 ? "term" : "terms"}.`;

  const known = teaching.filter((p) => p.g > 0 && p.n > 0).sort((a, b) => b.g - a.g);
  const unknown = teaching.filter((p) => !(p.g > 0 && p.n > 0));

  // Nobody teaching it has taught it before — the history above is somebody
  // else's, and the sentence has to say so.
  if (!known.length) {
    if (!unknown.length) return base;
    const who = unknown.length === 1
      ? `${unknown[0].i} is`
      : `The ${unknown.length} instructors listed are`;
    return `${base} That history is from past instructors: ${who} teaching it this term with no published record for this course yet.`;
  }

  const best = known[0];
  const worst = known[known.length - 1];
  const spread = known.length > 1 && best.g - worst.g >= 0.3
    ? ` Who you pick matters: ${surname(best.i)} averages ${best.g.toFixed(2)} against ${surname(worst.i)}'s ${worst.g.toFixed(2)}.`
    : known.length > 1
      ? " The instructors with a record here grade similarly."
      : "";

  const caveat = unknown.length
    ? ` ${unknown.length === 1 ? `${surname(unknown[0].i)} has` : `${unknown.length} of them have`} no published record for this course.`
    : "";

  return base + spread + caveat;
}

/**
 * Collapsed to a single line; the distribution opens from the chevron and the
 * name opens the rating panel.
 *
 * The row used to be one big <button>. It cannot be any more: the name is now
 * interactive too, and a button inside a button is invalid HTML that browsers
 * silently reparent. So the row is a plain div holding two sibling controls.
 */
function ProfLine({
  prof, first = false, defaultOpen = false, rating, canRate,
}: {
  prof: ProfRecord;
  first?: boolean;
  defaultOpen?: boolean;
  /** null for past instructors — rating is scoped to the current term. */
  rating: { term: string; termName: string; code: string } | null;
  /** Ratings are saved to an account, so a visitor who is not signed in gets the name alone. */
  canRate: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [rateOpen, setRateOpen] = useState(false);
  const { ratings } = useTermRatings();

  const mine = rating ? ratings[ratingKey(rating.term, rating.code, prof.i)] : undefined;
  const meta = (
    <span className="flex flex-wrap items-center gap-x-2 text-xs text-gray-500 dark:text-gray-400">
      <span>{prof.n > 0 ? `${prof.n} term${prof.n === 1 ? "" : "s"}` : "no grade history"}</span>
      <LoadTag difficulty={prof.rd} />
      {mine && (
        <span className="inline-flex items-center gap-0.5 font-semibold text-[#1B2C4F] dark:text-[#FFC72C]">
          <Star className="h-3 w-3 fill-current" />
          you rated {mine.quality}/5
        </span>
      )}
    </span>
  );

  return (
    <div className={first ? "" : "border-t border-gray-100 dark:border-white/5"}>
      <div className="flex w-full items-center gap-3 px-3 py-3">
        <GradeBadge gpa={prof.g} terms={prof.n} size="sm" />

        <span className="min-w-0 flex-1">
          {rating && canRate ? (
            <button
              type="button"
              onClick={() => setRateOpen((v) => !v)}
              aria-expanded={rateOpen}
              title={`Rate ${prof.i} for ${rating.termName}`}
              className="block max-w-full truncate text-left text-sm font-medium underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1B2C4F] dark:focus-visible:ring-[#FFC72C]"
            >
              {prof.i}
            </button>
          ) : (
            <span className="block truncate text-sm font-medium">{prof.i}</span>
          )}
          {meta}
        </span>

        {prof.rq != null && prof.rq > 0 && (
          <span
            className={`flex shrink-0 items-center gap-0.5 text-xs font-semibold ${ratingTone(prof.rq)}`}
            title={prof.rn ? `${prof.rn} RateMyProfessors ratings` : undefined}
          >
            <Star className="h-3 w-3 fill-current" />
            {prof.rq.toFixed(1)}
          </span>
        )}

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={`${open ? "Hide" : "Show"} grade distribution for ${prof.i}`}
          className="shrink-0 rounded p-1 text-gray-500 transition hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1B2C4F] dark:text-gray-400 dark:hover:bg-white/10 dark:focus-visible:ring-[#FFC72C]"
        >
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </div>

      {rating && canRate && rateOpen && (
        <RateProfessor
          key={`${rating.term}:${rating.code}:${prof.i}`}
          term={rating.term}
          termName={rating.termName}
          code={rating.code}
          instructor={prof.i}
          onClose={() => setRateOpen(false)}
        />
      )}

      {open && (
        <div className="px-3 pb-5 pl-14">
          <GradeBars prof={prof} />
          {prof.rid && (
            <a
              href={`https://www.ratemyprofessors.com/professor/${prof.rid}`}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-3 inline-flex items-center gap-1 text-xs text-gray-500 hover:underline dark:text-gray-400"
            >
              {prof.rn ?? 0} RateMyProfessors ratings
              {prof.rw != null && prof.rw > 0 ? ` · ${prof.rw}% would retake` : ""}
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      )}
    </div>
  );
}
