"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import PlatShell from "@/components/plat/PlatShell";
import CourseResults, { DEFAULT_FILTERS, type ResultFilters } from "@/components/plat/CourseResults";
import { collegeName, loadGE, loadIndex, type CourseRow, type GEFile, type PlatIndex } from "@/lib/plat";
import { DISCIPLINES, disciplineForSubject, WARREN_RULE } from "@/data/ucsdStructure";

export default function GEPage() {
  return (
    <Suspense fallback={<PlatShell><div className="p-20 text-center text-sm text-gray-400">Loading…</div></PlatShell>}>
      <GESearch />
    </Suspense>
  );
}

/**
 * Two decisions, in order: which college, then which area. The old version put
 * eight college buttons, every area as a multi-select, a "satisfy all" toggle,
 * a clear button and a caveat paragraph on screen at once — before any result.
 */
function GESearch() {
  const search = useSearchParams();
  const [index, setIndex] = useState<PlatIndex | null>(null);
  const [ge, setGE] = useState<GEFile | null>(null);

  const [college, setCollege] = useState(search.get("college") ?? "revelle");
  const [area, setArea] = useState<string | null>(search.get("area"));
  const [discipline, setDiscipline] = useState<string | null>(null);
  const [filters, setFilters] = useState<ResultFilters>({ ...DEFAULT_FILTERS, sort: "grade", hasGrades: true });

  useEffect(() => { loadIndex().then(setIndex).catch(() => {}); }, []);
  useEffect(() => { loadGE().then(setGE).catch(() => {}); }, []);

  const colleges = useMemo(() => (ge ? [...new Set(ge.areas.map((a) => a.college))] : []), [ge]);
  const areas = useMemo(() => ge?.areas.filter((a) => a.college === college) ?? [], [ge, college]);

  // A selection from the previous college would silently yield zero results,
  // so drop it during render as soon as the area list changes underneath it.
  if (area !== null && areas.length > 0 && !areas.some((x) => x.key === area)) {
    setArea(null);
  }

  const isWarren = college === "warren";

  // Leaving a discipline selected after switching college would filter the new
  // college's list by a rule that does not apply to it.
  if (discipline !== null && !isWarren) setDiscipline(null);

  const rows: CourseRow[] = useMemo(() => {
    if (!index || !ge) return [];
    // A Warren discipline is not a published list — it is every course a
    // department in that discipline offers.
    if (discipline) {
      return index.courses.filter((c) => disciplineForSubject(c.s)?.id === discipline);
    }
    const keys = area ? [area] : areas.map((a) => a.key);
    const codes = new Set(keys.flatMap((k) => ge.lists[k] ?? []));
    return index.courses.filter((c) => codes.has(c.k));
  }, [index, ge, area, areas, discipline]);

  return (
    <PlatShell>
      <div className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-black tracking-tight">Easy GEs</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Approved general-education courses, ranked by the grades students actually got.
        </p>

        <label className="mt-6 flex items-center gap-3 text-sm">
          <span className="text-gray-500 dark:text-gray-400">College</span>
          <select
            value={college}
            onChange={(e) => setCollege(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium outline-none focus:border-[#182B49] dark:border-white/10 dark:bg-white/5 dark:text-gray-100"
          >
            {colleges.map((c) => <option key={c} value={c}>{collegeName(c)}</option>)}
          </select>
        </label>

        {isWarren && (
          <div className="mt-5 rounded-xl border border-gray-200 p-4 dark:border-white/10">
            <h2 className="text-sm font-bold">Warren states a rule, not a list</h2>
            <p className="mt-1.5 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
              Every course outside your major&rsquo;s discipline can count, so there is no short
              approved list to browse. You build two collections instead, each drawn from a
              discipline that is neither your major&rsquo;s nor the other collection&rsquo;s.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {[WARREN_RULE.standard, WARREN_RULE.engineering].map((r) => (
                <div key={r.label} className="rounded-lg bg-gray-50 p-3 dark:bg-white/[0.03]">
                  <p className="text-xs font-semibold">{r.label}</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
                    {r.programs} &times; {r.unit}, {r.courses} courses each
                    <span className="block">at least {r.upper} upper-division per collection</span>
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-gray-400">
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

        <div className="mt-4 flex flex-wrap gap-1.5">
          {!discipline && (
            <AreaChip active={area === null} onClick={() => setArea(null)}>All areas</AreaChip>
          )}
          {!discipline && areas.map((a) => (
            <AreaChip key={a.key} active={area === a.key} onClick={() => setArea(a.key)}>
              {a.area}
            </AreaChip>
          ))}
        </div>

        <div className="mt-6">
          <CourseResults
            rows={rows}
            filters={filters}
            onChange={setFilters}
            emptyHint={index && ge ? "Nothing here is offered this term — try turning off that filter." : "Loading…"}
          />
        </div>

        {ge && (
          <p className="mt-10 text-xs leading-relaxed text-gray-400">
            {ge.meta.note}
          </p>
        )}
      </div>
    </PlatShell>
  );
}

function AreaChip({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
        active
          ? "border-[#182B49] bg-[#182B49] text-white dark:border-[#FFCD00] dark:bg-[#FFCD00] dark:text-[#182B49]"
          : "border-gray-200 text-gray-600 hover:border-gray-400 dark:border-white/15 dark:text-gray-300"
      }`}
    >
      {children}
    </button>
  );
}
