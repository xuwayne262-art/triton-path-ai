"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Star } from "lucide-react";
import PlatShell from "@/components/plat/PlatShell";
import CourseResults, { DEFAULT_FILTERS, type ResultFilters } from "@/components/plat/CourseResults";
import { loadIndex, loadSubject, type CourseRow, type PlatIndex, type ProfRecord } from "@/lib/plat";
import {
  collegeForSubject, departmentById, departmentForSubject, schoolById,
} from "@/data/ucsdStructure";

interface ProfChip {
  name: string;
  rq: number | null;
  rid: number | null;
  courses: number;
}

/**
 * A department page spanning every subject code the department owns, so
 * Biological Sciences shows BILD through BGGN in one place instead of six
 * disconnected listings.
 *
 * The route param accepts a department id ("biology") or any subject code
 * ("BILD"), since links and bookmarks use both.
 */
export default function DepartmentPage({ params }: { params: Promise<{ sub: string }> }) {
  const { sub: raw } = use(params);
  const param = decodeURIComponent(raw);

  const dept = departmentById(param) ?? departmentForSubject(param.toUpperCase());
  const college = dept ? null : collegeForSubject(param.toUpperCase());
  const subjects = dept?.subjects ?? college?.subjects ?? [param.toUpperCase()];
  const title = dept?.name ?? college?.name ?? param.toUpperCase();
  const school = dept ? schoolById(dept.schoolId) : null;

  const [data, setData] = useState<PlatIndex | null>(null);
  const [profs, setProfs] = useState<ProfChip[]>([]);
  const [showAllProfs, setShowAllProfs] = useState(false);
  const [filters, setFilters] = useState<ResultFilters>({ ...DEFAULT_FILTERS, sort: "code" });

  useEffect(() => { loadIndex().then(setData).catch(() => {}); }, []);

  // Instructor list is merged across every subject code in the department.
  useEffect(() => {
    let cancelled = false;
    setProfs([]);
    Promise.all(subjects.map((s) => loadSubject(s).catch(() => null))).then((files) => {
      if (cancelled) return;
      const map = new Map<string, ProfChip>();
      for (const file of files) {
        if (!file) continue;
        for (const c of Object.values(file.courses)) {
          for (const p of c.profs as ProfRecord[]) {
            if (!p.cur) continue;
            const hit = map.get(p.i);
            if (hit) hit.courses += 1;
            else map.set(p.i, { name: p.i, rq: p.rq, rid: p.rid, courses: 1 });
          }
        }
      }
      setProfs([...map.values()].sort((a, b) => (b.rq ?? -1) - (a.rq ?? -1)));
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjects.join(",")]);

  const subjectSet = useMemo(() => new Set(subjects), [subjects]);
  const rows: CourseRow[] = useMemo(
    () => data?.courses.filter((c) => subjectSet.has(c.s)) ?? [],
    [data, subjectSet],
  );

  const offered = rows.filter((r) => r.o).length;
  const visible = showAllProfs ? profs : profs.slice(0, 8);

  return (
    <PlatShell>
      <div className="mx-auto max-w-3xl px-4 py-8">
        <Link href="/courses" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:underline dark:text-gray-400">
          <ChevronLeft className="h-3.5 w-3.5" /> All departments
        </Link>

        {school && (
          <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
            {school.name}
          </p>
        )}
        <h1 className="mt-1 text-2xl font-black tracking-tight">{title}</h1>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {offered} of {rows.length} courses on the {data?.meta.termName} schedule
          </span>
          {profs.length > 0 && (
            <span className="text-sm text-gray-500 dark:text-gray-400">
              · {profs.length} instructors teaching
            </span>
          )}
        </div>

        {subjects.length > 1 && (
          <div className="mt-3 flex flex-wrap items-center gap-1">
            <span className="mr-1 text-[10px] uppercase tracking-wide text-gray-400">
              Course prefixes
            </span>
            {subjects.map((code) => (
              <span
                key={code}
                className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-gray-600 dark:bg-white/10 dark:text-gray-300"
              >
                {code}
              </span>
            ))}
          </div>
        )}

        {profs.length > 0 && (
          <div className="mt-5 rounded-xl border border-gray-200 p-3 dark:border-white/10">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Teaching this term
              </span>
              {profs.length > 8 && (
                <button
                  type="button"
                  onClick={() => setShowAllProfs((v) => !v)}
                  className="text-xs font-semibold text-[#182B49] hover:underline dark:text-[#FFCD00]"
                >
                  {showAllProfs ? "Show fewer" : `See all ${profs.length}`}
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {visible.map((p) => {
                const tone =
                  p.rq == null || p.rq <= 0 ? "text-gray-400"
                    : p.rq >= 4 ? "text-emerald-600 dark:text-emerald-400"
                      : p.rq >= 3 ? "text-amber-600 dark:text-amber-400"
                        : "text-red-500 dark:text-red-400";
                const body = (
                  <>
                    <span className="text-xs">{p.name}</span>
                    {p.rq != null && p.rq > 0 ? (
                      <span className={`inline-flex items-center gap-0.5 text-xs font-bold ${tone}`}>
                        <Star className="h-3 w-3 fill-current" />{p.rq.toFixed(1)}
                      </span>
                    ) : (
                      <span className="text-[11px] text-gray-400">unrated</span>
                    )}
                  </>
                );
                const cls =
                  "inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-2.5 py-1 transition hover:border-gray-400 dark:border-white/10";
                return p.rid ? (
                  <a key={p.name} href={`https://www.ratemyprofessors.com/professor/${p.rid}`} target="_blank" rel="noreferrer noopener" className={cls}>
                    {body}
                  </a>
                ) : (
                  <span key={p.name} className={cls}>{body}</span>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-6">
          <CourseResults
            rows={rows}
            filters={filters}
            onChange={setFilters}
            emptyHint={data ? `No ${title} courses match these filters.` : "Loading…"}
          />
        </div>
      </div>
    </PlatShell>
  );
}
