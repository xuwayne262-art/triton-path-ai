"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ExternalLink } from "lucide-react";
import PlatShell from "@/components/plat/PlatShell";
import PageHeader from "@/components/plat/PageHeader";
import { LABEL, SECTION_TITLE } from "@/components/plat/typeScale";
import CourseResults, { DEFAULT_FILTERS, type ResultFilters } from "@/components/plat/CourseResults";
import {
  CAMPUS, UNIVERSITY_REQUIREMENTS, collegeName, loadGE, loadIndex,
  type CourseRow, type GEFile, type PlatIndex,
} from "@/lib/plat";
import { DISCIPLINES, disciplineForSubject, WARREN_RULE } from "@/data/ucsdStructure";

export default function GEPage() {
  return (
    <Suspense fallback={<PlatShell><div className="p-20 text-center text-sm text-gray-500">Loading…</div></PlatShell>}>
      <GESearch />
    </Suspense>
  );
}

/** "campus:DEI" and "campus:AHI" — the university requirements, in the order students ask for them. */
const REQ_KEYS = Object.keys(UNIVERSITY_REQUIREMENTS).map((k) => `${CAMPUS}:${k}`);

/**
 * Two decisions, in order: which college, then which area. Then, because a
 * GE is often chosen to clear something else at the same time, an optional
 * third: "also counts for DEI" or "for American History & Institutions" —
 * UCSD's version of UCSBPlat's "Satisfy all". The university requirements can
 * also be browsed on their own, whatever the college.
 */
function GESearch() {
  const search = useSearchParams();
  const [index, setIndex] = useState<PlatIndex | null>(null);
  const [ge, setGE] = useState<GEFile | null>(null);

  const [college, setCollege] = useState(search.get("college") ?? "revelle");
  const [area, setArea] = useState<string | null>(search.get("area"));
  const [also, setAlso] = useState<string[]>([]);
  const [discipline, setDiscipline] = useState<string | null>(null);
  // Every approved course, ranked by grades. Courses with no history come last.
  const [filters, setFilters] = useState<ResultFilters>({ ...DEFAULT_FILTERS, sort: "grade" });

  useEffect(() => { loadIndex().then(setIndex).catch(() => {}); }, []);
  useEffect(() => { loadGE().then(setGE).catch(() => {}); }, []);

  const colleges = useMemo(
    () => (ge ? [...new Set(ge.areas.map((a) => a.college))].filter((c) => c !== CAMPUS) : []),
    [ge],
  );
  const areas = useMemo(() => ge?.areas.filter((a) => a.college === college) ?? [], [ge, college]);
  const reqs = useMemo(() => REQ_KEYS.filter((k) => ge?.lists[k]), [ge]);

  const onReq = area !== null && area.startsWith(`${CAMPUS}:`);

  // A selection from the previous college would silently yield zero results,
  // so drop it during render as soon as the area list changes underneath it.
  if (area !== null && !onReq && areas.length > 0 && !areas.some((x) => x.key === area)) {
    setArea(null);
  }

  const isWarren = college === "warren";

  // Leaving a discipline selected after switching college would filter the new
  // college's list by a rule that does not apply to it.
  if (discipline !== null && !isWarren) setDiscipline(null);

  const { rows, unknown } = useMemo((): { rows: CourseRow[]; unknown: string[] } => {
    if (!index || !ge) return { rows: [], unknown: [] };
    let base: CourseRow[];
    let codes: Set<string>;
    if (onReq && area) {
      codes = new Set(ge.lists[area] ?? []);
      base = index.courses.filter((c) => codes.has(c.k));
    } else if (discipline) {
      // A Warren discipline is not a published list — it is every course a
      // department in that discipline offers.
      codes = new Set();
      base = index.courses.filter((c) => disciplineForSubject(c.s)?.id === discipline);
    } else {
      const keys = area ? [area] : areas.map((a) => a.key);
      codes = new Set(keys.flatMap((k) => ge.lists[k] ?? []));
      base = index.courses.filter((c) => codes.has(c.k));
    }
    // "Also counts for": keep only courses on every one of those lists too.
    const also1 = also.filter((k) => k !== area);
    const rowsOut = also1.length
      ? base.filter((c) => also1.every((k) => ge.lists[k]?.includes(c.k)))
      : base;
    // An approved code that no UCSD source knows — not the catalog, the grade
    // archive or this term's schedule — has nothing to rank, but leaving it out
    // silently would make the list look complete when it is not.
    const known = new Set(base.map((c) => c.k));
    return { rows: rowsOut, unknown: also1.length ? [] : [...codes].filter((k) => !known.has(k)).sort() };
  }, [index, ge, area, areas, discipline, onReq, also]);

  const toggleAlso = (k: string) => setAlso((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]));
  const campus = ge?.meta.campus;
  const reqLabel = (k: string) => UNIVERSITY_REQUIREMENTS[k.slice(CAMPUS.length + 1)] ?? k;

  return (
    <PlatShell>
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
        {/* The first of the page's decisions, so it sits on the title's line. */}
        <PageHeader
          title="Easy GEs"
          description="Approved general-education courses, ranked by the grades students actually got."
          actions={
            <label className="flex items-center gap-2 text-sm">
              <span className="text-gray-600 dark:text-gray-300">College</span>
              <select
                value={college}
                onChange={(e) => { setCollege(e.target.value); if (onReq) setArea(null); }}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium outline-none focus:border-[#182B49] dark:border-white/10 dark:bg-white/5 dark:text-gray-100"
              >
                {colleges.map((c) => <option key={c} value={c}>{collegeName(c)}</option>)}
              </select>
            </label>
          }
        />

        {isWarren && !onReq && (
          <div className="mt-5 rounded-xl border border-gray-200 p-4 dark:border-white/10">
            <h2 className={SECTION_TITLE}>Warren states a rule, not a list</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
              Every course outside your major&rsquo;s discipline can count, so there is no short
              approved list to browse. You build two collections instead, each drawn from a
              discipline that is neither your major&rsquo;s nor the other collection&rsquo;s.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {[WARREN_RULE.standard, WARREN_RULE.engineering].map((r) => (
                <div key={r.label} className="rounded-lg bg-gray-50 p-3 dark:bg-white/[0.03]">
                  <p className="text-sm font-semibold">{r.label}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-gray-600 dark:text-gray-300">
                    {r.programs} &times; {r.unit}, {r.courses} courses each
                    <span className="block">at least {r.upper} upper-division per collection</span>
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
              A minor may stand in for either collection, and an interdisciplinary collection
              needs Warren advising approval &mdash; they are the authority, not this page.
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <AreaChip active={discipline === null} onClick={() => setDiscipline(null)}>
                Warren&rsquo;s own courses
              </AreaChip>
              {DISCIPLINES.map((d) => (
                <AreaChip
                  key={d.id}
                  active={discipline === d.id}
                  onClick={() => { setDiscipline(d.id); setArea(null); }}
                >
                  {d.name}
                </AreaChip>
              ))}
            </div>
          </div>
        )}

        {/* The filters as labelled rows, label on the left from a tablet up:
            one block to read across instead of three stacked boxes. */}
        <div className="mt-5 space-y-3">
          <FilterRow label={`${collegeName(college)} GE requirements`}>
            {!discipline && (
              <AreaChip active={area === null} onClick={() => setArea(null)}>All areas</AreaChip>
            )}
            {!discipline && areas.map((a) => (
              <AreaChip key={a.key} active={area === a.key} onClick={() => setArea(a.key)}>
                {a.area}
              </AreaChip>
            ))}
          </FilterRow>

          {reqs.length > 0 && (
            <FilterRow label="University requirements · every college">
              {reqs.map((k) => (
                <AreaChip key={k} active={area === k} onClick={() => { setArea(k); setDiscipline(null); setAlso((cur) => cur.filter((x) => x !== k)); }}>
                  {reqLabel(k)}
                </AreaChip>
              ))}
            </FilterRow>
          )}

          {reqs.length > 0 && !onReq && (
            <FilterRow
              label="Clear two at once"
              hint="Keeps only the courses on this list that are also approved for the one you pick. A course on both can usually count for both, but your college has the final say."
            >
              {reqs.map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={also.includes(k)}
                  onClick={() => toggleAlso(k)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    also.includes(k)
                      ? "border-emerald-700 bg-emerald-700 text-white dark:border-emerald-400 dark:bg-emerald-400 dark:text-emerald-950"
                      : "border-emerald-300 bg-white text-emerald-900 hover:border-emerald-600 dark:border-emerald-500/30 dark:bg-transparent dark:text-emerald-100"
                  }`}
                >
                  Also {reqLabel(k)}
                </button>
              ))}
            </FilterRow>
          )}
        </div>

        {onReq && area && campus && (
          <p className="mt-4 flex flex-wrap items-center gap-x-1 text-xs leading-relaxed text-gray-600 dark:text-gray-300">
            {area.endsWith(":DEI") ? (
              <>
                From the Academic Senate&rsquo;s list of approved courses
                {campus.dei.termName && campus.dei.asOf ? `, with ${campus.dei.termName}'s offerings as of ${campus.dei.asOf}` : ""}. A course
                counts only if taken in or after the quarter its approval began — check the
                <a href={campus.dei.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-0.5 font-semibold underline underline-offset-2">
                  Senate list <ExternalLink className="h-3 w-3" />
                </a>.
              </>
            ) : (
              <>
                From the UCSD General Catalog. {campus.ahi.note} AP, IB and high-school credit can
                satisfy it too —
                <a href={campus.ahi.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-0.5 font-semibold underline underline-offset-2">
                  see the catalog <ExternalLink className="h-3 w-3" />
                </a>.
              </>
            )}
          </p>
        )}

        <div className="mt-5">
          <CourseResults
            rows={rows}
            filters={filters}
            onChange={setFilters}
            termName={index?.meta.termName}
            emptyHint={index && ge ? "No approved courses match these filters." : "Loading…"}
          />
          {unknown.length > 0 && (
            <p className="mt-4 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
              Also approved here, but not yet in UCSD&rsquo;s catalog, grade archive or schedule, so there is
              nothing to rank them by: <span className="font-mono">{unknown.join(", ")}</span>.
            </p>
          )}
        </div>

        {ge && (
          <p className="mt-8 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
            {ge.meta.note}
          </p>
        )}
      </div>
    </PlatShell>
  );
}

/** One kind of choice: its name, then its chips — side by side from a tablet up. */
function FilterRow({
  label, hint, children,
}: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="sm:grid sm:grid-cols-[13rem_minmax(0,1fr)] sm:gap-4">
      <p className={`${LABEL} sm:pt-2`}>{label}</p>
      <div className="mt-2 sm:mt-0">
        <div className="flex flex-wrap gap-1.5">{children}</div>
        {hint && <p className="mt-1.5 text-xs leading-relaxed text-gray-500 dark:text-gray-400">{hint}</p>}
      </div>
    </div>
  );
}

function AreaChip({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
        active
          ? "border-[#182B49] bg-[#182B49] text-white dark:border-[#FFCD00] dark:bg-[#FFCD00] dark:text-[#182B49]"
          : "border-gray-200 text-gray-700 hover:border-gray-400 dark:border-white/15 dark:text-gray-200"
      }`}
    >
      {children}
    </button>
  );
}
