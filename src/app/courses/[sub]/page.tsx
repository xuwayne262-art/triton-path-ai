"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Star } from "lucide-react";
import PlatShell from "@/components/plat/PlatShell";
import CourseResults, { DEFAULT_FILTERS, type ResultFilters } from "@/components/plat/CourseResults";
import { loadIndex, loadSubject, type CourseRow, type PlatIndex, type SubjectFile } from "@/lib/plat";

interface ProfChip {
  name: string;
  rq: number | null;
  rid: number | null;
  courses: number;
}

export default function SubjectPage({ params }: { params: Promise<{ sub: string }> }) {
  const { sub: rawSub } = use(params);
  const sub = decodeURIComponent(rawSub).toUpperCase();

  const [data, setData] = useState<PlatIndex | null>(null);
  const [detail, setDetail] = useState<SubjectFile | null>(null);
  const [showAllProfs, setShowAllProfs] = useState(false);
  const [filters, setFilters] = useState<ResultFilters>({ ...DEFAULT_FILTERS, sort: "code" });

  useEffect(() => { loadIndex().then(setData).catch(() => {}); }, []);
  useEffect(() => { loadSubject(sub).then(setDetail).catch(() => {}); }, [sub]);

  const [loadedFor, setLoadedFor] = useState(sub);
  if (loadedFor !== sub) { setLoadedFor(sub); setDetail(null); }

  const rows: CourseRow[] = useMemo(
    () => data?.courses.filter((c) => c.s === sub) ?? [],
    [data, sub],
  );
  const subject = data?.subjects.find((s) => s.code === sub);

  /** Who is actually teaching here this term, best-rated first. */
  const profs = useMemo<ProfChip[]>(() => {
    if (!detail) return [];
    const map = new Map<string, ProfChip>();
    for (const c of Object.values(detail.courses)) {
      for (const p of c.profs) {
        if (!p.cur) continue;
        const hit = map.get(p.i);
        if (hit) hit.courses += 1;
        else map.set(p.i, { name: p.i, rq: p.rq, rid: p.rid, courses: 1 });
      }
    }
    return [...map.values()].sort((a, b) => (b.rq ?? -1) - (a.rq ?? -1));
  }, [detail]);

  const visible = showAllProfs ? profs : profs.slice(0, 8);

  return (
    <PlatShell>
      <div className="mx-auto max-w-3xl px-4 py-8">
        <Link href="/courses" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:underline dark:text-gray-400">
          <ChevronLeft className="h-3.5 w-3.5" /> All departments
        </Link>

        <h1 className="mt-3 text-2xl font-black tracking-tight">
          {detail?.name ?? subject?.name ?? sub}
          <span className="ml-2 font-mono text-sm font-bold text-gray-400">{sub}</span>
        </h1>
        {subject && (
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {subject.offered} of {subject.n} courses on the {data?.meta.termName} schedule
            {profs.length > 0 && <> · {profs.length} instructors teaching</>}
          </p>
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
            emptyHint={data ? `No ${sub} courses match these filters.` : "Loading…"}
          />
        </div>
      </div>
    </PlatShell>
  );
}
