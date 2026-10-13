"use client";

import { Suspense, useEffect, useId, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowUpRight, ExternalLink, Info } from "lucide-react";
import PlatShell from "@/components/plat/PlatShell";
import PageHeader from "@/components/plat/PageHeader";
import { PAGE_GAP, PAGE_PAD, SECTION_TITLE } from "@/components/plat/typeScale";
import CourseResults, { DEFAULT_FILTERS, type ResultFilters } from "@/components/plat/CourseResults";
import {
  CAMPUS, UNIVERSITY_REQUIREMENTS, collegeName, loadGE, loadIndex,
  type GEFile, type PlatIndex,
} from "@/lib/plat";
import { EMPTY_GE, geQueryString, geResults, parseGeQuery, type GeState } from "@/lib/geQuery";
import { cleanPlanner } from "@/lib/plan/record";
import { PLANNER_KEY } from "@/lib/plan/sync";
import { COLLEGE_SOURCES } from "@/data/collegeSources";
import { DISCIPLINES, disciplineForSubject, WARREN_RULE } from "@/data/ucsdStructure";

export default function GEPage() {
  return (
    <Suspense fallback={<PlatShell><GELoading /></PlatShell>}>
      <GESearch />
    </Suspense>
  );
}

/** "campus:DEI" and "campus:AHI" — the university requirements, in the order students ask for them. */
const REQ_KEYS = Object.keys(UNIVERSITY_REQUIREMENTS).map((k) => `${CAMPUS}:${k}`);
const BASE: ResultFilters = { ...DEFAULT_FILTERS, sort: "grade" };
const DISCIPLINE_IDS = DISCIPLINES.map((d) => d.id);

/** The college a student chose here before — a per-browser convenience, never an account setting. */
const COLLEGE_KEY = "ucsdplans-ge-college";

function rememberedCollege(): { key: string; from: "here" | "planner" } | null {
  try {
    const here = localStorage.getItem(COLLEGE_KEY);
    if (here) return { key: here, from: "here" };
    // The college chosen in the Planner is a deliberate choice too.
    const planner = cleanPlanner(JSON.parse(localStorage.getItem(PLANNER_KEY) ?? "null"));
    if (planner?.college) return { key: planner.college.toLowerCase(), from: "planner" };
  } catch { /* storage unavailable: no memory */ }
  return null;
}

/** Puts a state in the address bar, as a new history entry so Back returns to the last one. */
function go(state: GeState, filters: ResultFilters, { replace = false } = {}) {
  const url = `/ge${geQueryString(state, filters, BASE)}`;
  if (replace) window.history.replaceState(null, "", url);
  else window.history.pushState(null, "", url);
}

/**
 * Three decisions, in order: which college, which of its GE areas, and —
 * optionally — a university requirement each course must also be on. The
 * whole state lives in the address (lib/geQuery.ts), so a reload, a link sent
 * to a friend and the Back button all return to it, and nothing is a default
 * the page picked on a student's behalf: a first visit is asked for a college
 * rather than silently shown Revelle's.
 */
function GESearch() {
  const search = useSearchParams();
  const [index, setIndex] = useState<PlatIndex | null>(null);
  const [ge, setGE] = useState<GEFile | null>(null);
  const [failed, setFailed] = useState(false);
  const [memory, setMemory] = useState<{ key: string; from: "here" | "planner" } | null>(null);

  useEffect(() => { loadIndex().then(setIndex).catch(() => setFailed(true)); }, []);
  useEffect(() => { loadGE().then(setGE).catch(() => setFailed(true)); }, []);

  const parsed = useMemo(
    () => (ge ? parseGeQuery(search, ge, DISCIPLINE_IDS, BASE) : null),
    [ge, search],
  );
  const state = parsed?.state ?? EMPTY_GE;
  const filters = parsed?.filters ?? BASE;
  const colleges = useMemo(
    () => (ge ? [...new Set(ge.areas.map((a) => a.college))].filter((c) => c !== CAMPUS) : []),
    [ge],
  );

  // A plain /ge with a college remembered from before opens on that college,
  // and says where the choice came from. The address then names it.
  useEffect(() => {
    if (!ge || search.get("college") || search.get("req")) return;
    const t = window.setTimeout(() => {
      const m = rememberedCollege();
      if (m && colleges.includes(m.key)) {
        setMemory(m);
        go({ ...EMPTY_GE, college: m.key }, filters, { replace: true });
      }
    }, 0);
    return () => window.clearTimeout(t);
    // Only on arrival: later choices are the student's, made in the address.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ge]);

  const areas = useMemo(() => ge?.areas.filter((a) => a.college === state.college) ?? [], [ge, state.college]);
  const reqs = useMemo(() => REQ_KEYS.filter((k) => ge?.lists[k]), [ge]);
  const isWarren = state.college === "warren";

  const results = useMemo(
    () => (index && ge ? geResults(index.courses, ge, state, (s) => disciplineForSubject(s)?.id === state.discipline) : null),
    [index, ge, state],
  );

  const set = (next: Partial<GeState>, f: ResultFilters = filters) => go({ ...state, ...next }, f);
  const chooseCollege = (key: string) => {
    try { localStorage.setItem(COLLEGE_KEY, key); } catch { /* not remembered */ }
    setMemory(null);
    // The areas and discipline belong to the old college; the requirement
    // overlap and list filters are the student's and carry over.
    go({ ...state, college: key, areas: [], discipline: null, req: null }, filters);
  };
  const toggleArea = (key: string) =>
    set({ areas: state.areas.includes(key) ? state.areas.filter((a) => a !== key) : [...state.areas, key], discipline: null, req: null });
  const toggleAlso = (key: string) =>
    set({ also: state.also.includes(key) ? state.also.filter((a) => a !== key) : [...state.also, key], req: null });
  const resetAll = () => go({ ...EMPTY_GE, college: state.college }, BASE);
  // The text filter changes the address as it is typed, without a history entry per letter.
  const onFilters = (f: ResultFilters) => go(state, f, { replace: f.q !== filters.q });

  const reqLabel = (k: string) => UNIVERSITY_REQUIREMENTS[k.slice(CAMPUS.length + 1)] ?? k;
  const areaName = (k: string) => k.slice(k.indexOf(":") + 1);
  const campus = ge?.meta.campus;
  const source = state.college ? COLLEGE_SOURCES[state.college] : null;

  // One summary of what narrows the list, each removable, plus a reset.
  const chips = [
    ...(state.req ? [{ label: reqLabel(state.req), clear: () => set({ req: null }) }] : []),
    ...state.areas.map((k) => ({ label: areaName(k), clear: () => toggleArea(k) })),
    ...(state.discipline ? [{ label: DISCIPLINES.find((d) => d.id === state.discipline)?.name ?? state.discipline, clear: () => set({ discipline: null }) }] : []),
    ...state.also.map((k) => ({ label: `Also ${reqLabel(k)}`, clear: () => toggleAlso(k) })),
  ];

  if (!ge || !index) {
    return <PlatShell>{failed ? <GEFailed /> : <GELoading />}</PlatShell>;
  }

  return (
    <PlatShell>
      <div className={`mx-auto max-w-4xl px-4 sm:px-6 ${PAGE_PAD}`}>
        <PageHeader
          title="Easy GEs"
          description="Courses on each college's GE lists and UCSD's university-requirement lists, with how they have graded in the past."
        />

        {/* ── Where the lists come from, before anything is chosen from them ── */}
        <div className="mt-6 flex gap-2.5 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm leading-relaxed text-amber-950 dark:border-amber-500/25 dark:bg-amber-500/5 dark:text-amber-100">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div>
            <p>
              <span className="font-semibold">College GE lists are community-compiled. Confirm eligibility with your college.</span>{" "}
              They cover only areas with a fixed course list — writing programs, sequences and department-based
              areas aren&rsquo;t here — so this is not every requirement, and not a degree audit.
            </p>
            <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs">
              {source && (
                <a href={source.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-0.5 font-semibold underline underline-offset-2">
                  {collegeName(state.college!)}&rsquo;s own requirements{source.publisher !== source.name ? ` (${source.publisher})` : ""}
                  <ExternalLink className="h-3 w-3" aria-hidden />
                </a>
              )}
              <Link href="/about#ge" className="font-semibold underline underline-offset-2">What these lists cover</Link>
            </p>
          </div>
        </div>

        {parsed && parsed.problems.length > 0 && (
          <p role="status" className="mt-4 rounded-lg bg-rose-50 px-4 py-2.5 text-sm text-rose-950 dark:bg-rose-500/10 dark:text-rose-100">
            {parsed.problems.join(" ")}
          </p>
        )}

        <div className={`${PAGE_GAP} space-y-7`}>
          {/* ── 1. College ─────────────────────────────────────────────────── */}
          <Step n={1} title="Your college" hint={
            memory
              ? memory.from === "planner" ? "From the college set in your Planner." : "Remembered from your last visit, in this browser."
              : state.college ? undefined : "Choose your college to see its GE lists. Nothing is picked for you."
          }>
            <RadioChips
              name="college"
              value={state.college}
              options={colleges.map((c) => ({ value: c, label: collegeName(c) }))}
              onChange={chooseCollege}
            />
          </Step>

          {/* ── 2. Its requirements ────────────────────────────────────────── */}
          {state.college && !isWarren && (
            <Step
              n={2}
              title={`${collegeName(state.college)} GE requirements`}
              hint={state.areas.length
                ? `Showing courses on any selected area (${state.areas.length} of ${areas.length}).`
                : `Showing every area with a list (${areas.length}). Select areas to narrow to courses on any of them.`}
            >
              <CheckChips
                options={areas.map((a) => ({ value: a.key, label: a.area }))}
                values={state.areas}
                onToggle={toggleArea}
                legend={`${collegeName(state.college)} GE areas`}
              />
            </Step>
          )}

          {isWarren && (
            <Step n={2} title="Warren College GE requirements" hint="Warren states a rule, not a list.">
              <div className="rounded-xl border border-gray-200 p-5 dark:border-white/10">
                <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                  Every course outside your major&rsquo;s discipline can count, so there is no short approved list to
                  browse. You build two collections instead, each drawn from a discipline that is neither your
                  major&rsquo;s nor the other collection&rsquo;s.
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {[WARREN_RULE.standard, WARREN_RULE.engineering].map((r) => (
                    <div key={r.label} className="rounded-lg bg-gray-50 p-3 dark:bg-white/[0.03]">
                      <p className="text-sm font-semibold">{r.label}</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-gray-700 dark:text-gray-300">
                        {r.programs} &times; {r.unit}, {r.courses} courses each
                        <span className="block">at least {r.upper} upper-division per collection</span>
                      </p>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-xs leading-relaxed text-gray-600 dark:text-gray-400">
                  A minor may stand in for either collection, and an interdisciplinary collection needs Warren
                  advising approval &mdash; they are the authority, not this page.
                </p>
                <div className="mt-4">
                  <RadioChips
                    name="discipline"
                    value={state.discipline ?? ""}
                    options={[{ value: "", label: "Warren’s listed areas" }, ...DISCIPLINES.map((d) => ({ value: d.id, label: d.name }))]}
                    onChange={(v) => set({ discipline: v || null, areas: [], req: null })}
                  />
                </div>
                {!state.discipline && areas.length > 0 && (
                  <div className="mt-4">
                    <CheckChips
                      options={areas.map((a) => ({ value: a.key, label: a.area }))}
                      values={state.areas}
                      onToggle={toggleArea}
                      legend="Warren College GE areas with lists"
                    />
                  </div>
                )}
              </div>
            </Step>
          )}

          {/* ── 3. Also fulfills ───────────────────────────────────────────── */}
          {state.college && reqs.length > 0 && !state.req && (
            <Step
              n={3}
              title="Also fulfills (optional)"
              hint="Keeps only courses that are also on that UCSD list. Whether one course may count for both depends on your college's rules."
            >
              <CheckChips
                options={reqs.map((k) => ({ value: k, label: reqLabel(k) }))}
                values={state.also}
                onToggle={toggleAlso}
                legend="Also fulfills"
                tone="emerald"
              />
            </Step>
          )}

          {/* ── Or a university requirement on its own ─────────────────────── */}
          {reqs.length > 0 && (
            <div className="rounded-xl border border-gray-200 px-4 py-3 dark:border-white/10">
              <p className={SECTION_TITLE}>University requirements · every college</p>
              <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">From UCSD&rsquo;s own lists. Browse one by itself:</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {reqs.map((k) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={state.req === k}
                    onClick={() => set(state.req === k ? { req: null } : { req: k, areas: [], discipline: null, also: [] })}
                    className={chipClass(state.req === k, "emerald")}
                  >
                    {reqLabel(k)}
                  </button>
                ))}
              </div>
              {state.req && campus && (
                <p className="mt-3 flex flex-wrap items-center gap-x-1 text-xs leading-relaxed text-gray-700 dark:text-gray-300">
                  {state.req.endsWith(":DEI") ? (
                    <>
                      From the Academic Senate&rsquo;s list of approved courses
                      {campus.dei.termName && campus.dei.asOf ? `, with ${campus.dei.termName}'s offerings as of ${campus.dei.asOf}` : ""}. A course
                      counts only if taken in or after the quarter its approval began — check the
                      <a href={campus.dei.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-0.5 font-semibold underline underline-offset-2">
                        Senate list <ExternalLink className="h-3 w-3" aria-hidden />
                      </a>.
                    </>
                  ) : (
                    <>
                      From the UCSD General Catalog. {campus.ahi.note} AP, IB and high-school credit can satisfy it too —
                      <a href={campus.ahi.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-0.5 font-semibold underline underline-offset-2">
                        see the catalog <ExternalLink className="h-3 w-3" aria-hidden />
                      </a>.
                    </>
                  )}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="mt-10">
          {!state.college && !state.req ? (
            <p className="rounded-xl border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-600 dark:border-white/15 dark:text-gray-400">
              Choose your college above, or a university requirement, to list its courses.
            </p>
          ) : (
            <CourseResults
              rows={results?.rows ?? []}
              filters={filters}
              onChange={onFilters}
              noteFor={results?.noteFor}
              termName={index.meta.termName}
              extraChips={[
                ...(state.college && !state.req ? [{ label: collegeName(state.college), clear: () => go({ ...EMPTY_GE }, filters) }] : []),
                ...chips,
              ]}
              onResetAll={resetAll}
              emptyHint={state.also.length
                ? `No course on ${state.areas.length ? "the selected areas" : `${collegeName(state.college ?? "")}'s lists`} is also on the ${state.also.map(reqLabel).join(" and ")} list${filters.offeredOnly ? ` and on the ${index.meta.termName} schedule` : ""}.`
                : "No listed course matches these filters."}
            />
          )}
          {results && results.unknown.length > 0 && (
            <p className="mt-5 text-xs leading-relaxed text-gray-600 dark:text-gray-400">
              Also listed, but not in UCSD&rsquo;s catalog, grade archive or schedule, so there is nothing to rank them
              by: <span className="font-mono">{results.unknown.join(", ")}</span>.
            </p>
          )}
        </div>

        <details className="mt-12 text-xs text-gray-600 dark:text-gray-400">
          <summary className="cursor-pointer font-semibold">How these lists were prepared</summary>
          <p className="mt-2 leading-relaxed">
            The college lists were compiled by the ucsd-easy-a-radar project
            {ge.meta.date ? ` (${ge.meta.date})` : ""}; the university-requirement lists come from UCSD&rsquo;s Academic
            Senate and General Catalog. {ge.meta.note}{" "}
            <Link href="/about#ge" className="inline-flex items-center gap-0.5 underline underline-offset-2">
              More on the sources <ArrowUpRight className="h-3 w-3" aria-hidden />
            </Link>
          </p>
        </details>
      </div>
    </PlatShell>
  );
}

/** A numbered decision, its label on the left from a tablet up. */
function Step({ n, title, hint, children }: { n: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="sm:grid sm:grid-cols-[13rem_minmax(0,1fr)] sm:gap-6">
      <div className="sm:pt-1.5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300">
          <span className="mr-1.5 text-gray-500 dark:text-gray-400">{n}.</span>{title}
        </h2>
      </div>
      <div className="mt-2.5 sm:mt-0">
        {children}
        {hint && <p className="mt-2 text-xs leading-relaxed text-gray-600 dark:text-gray-400">{hint}</p>}
      </div>
    </section>
  );
}

function chipClass(active: boolean, tone: "navy" | "emerald" = "navy") {
  if (tone === "emerald") {
    return `rounded-full border px-3 py-1.5 text-xs font-medium transition ${
      active
        ? "border-emerald-700 bg-emerald-700 text-white dark:border-emerald-400 dark:bg-emerald-400 dark:text-emerald-950"
        : "border-emerald-300 bg-white text-emerald-900 hover:border-emerald-600 dark:border-emerald-500/30 dark:bg-transparent dark:text-emerald-100"
    }`;
  }
  return `rounded-full border px-3 py-1.5 text-xs font-medium transition ${
    active
      ? "border-[#182B49] bg-[#182B49] text-white dark:border-[#FFCD00] dark:bg-[#FFCD00] dark:text-[#182B49]"
      : "border-gray-300 text-gray-800 hover:border-gray-500 dark:border-white/20 dark:text-gray-200"
  }`;
}

/** One-of-several chips that are real radios: arrow keys move through them. */
function RadioChips({
  name, value, options, onChange,
}: {
  name: string;
  value: string | null;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  const id = useId();
  return (
    <div role="radiogroup" aria-label={name === "college" ? "College" : "Warren discipline"} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <label key={o.value} className={`${chipClass(value === o.value)} cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#182B49] has-[:focus-visible]:ring-offset-1 dark:has-[:focus-visible]:ring-[#FFCD00]`}>
          <input type="radio" name={`${id}-${name}`} className="sr-only" checked={value === o.value} onChange={() => onChange(o.value)} />
          {o.label}
        </label>
      ))}
    </div>
  );
}

/** Any-of-several chips that are real checkboxes. */
function CheckChips({
  options, values, onToggle, legend, tone = "navy",
}: {
  options: { value: string; label: string }[];
  values: string[];
  onToggle: (v: string) => void;
  legend: string;
  tone?: "navy" | "emerald";
}) {
  return (
    <fieldset>
      <legend className="sr-only">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label key={o.value} className={`${chipClass(values.includes(o.value), tone)} cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#182B49] has-[:focus-visible]:ring-offset-1 dark:has-[:focus-visible]:ring-[#FFCD00]`}>
            <input type="checkbox" className="sr-only" checked={values.includes(o.value)} onChange={() => onToggle(o.value)} />
            {tone === "emerald" ? `Also ${o.label}` : o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** The page's outline while its two files load: never "0 courses" under an empty college picker. */
function GELoading() {
  return (
    <div className={`mx-auto max-w-4xl px-4 sm:px-6 ${PAGE_PAD}`} aria-busy="true">
      <p role="status" className="sr-only">Loading the GE lists…</p>
      <div className="h-6 w-32 animate-pulse rounded bg-gray-100 dark:bg-white/5" />
      <div className="mt-3 h-4 w-2/3 animate-pulse rounded bg-gray-100 dark:bg-white/5" />
      <div className="mt-6 h-16 animate-pulse rounded-xl bg-gray-100 dark:bg-white/5" />
      <div className="mt-10 flex flex-wrap gap-2">
        {Array.from({ length: 8 }, (_, i) => <div key={i} className="h-8 w-28 animate-pulse rounded-full bg-gray-100 dark:bg-white/5" />)}
      </div>
    </div>
  );
}

function GEFailed() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-24 text-center">
      <p className="text-sm text-gray-700 dark:text-gray-300">The GE lists did not arrive — check your connection.</p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-4 rounded-lg bg-[#182B49] px-4 py-2 text-sm font-semibold text-white dark:bg-[#FFCD00] dark:text-[#182B49]"
      >
        Try again
      </button>
    </div>
  );
}
