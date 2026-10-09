"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, ExternalLink, Star } from "lucide-react";
import PlatShell from "@/components/plat/PlatShell";
import { PAGE_GAP, PAGE_PAD, PAGE_TITLE, SECTION_TITLE } from "@/components/plat/typeScale";
import TermGradesChart, { type TermPoint } from "@/components/plat/TermGradesChart";
import { GradeBadge, LoadTag } from "@/components/plat/Grade";
import { professorDepartment } from "@/components/plat/ProfessorShelf";
import { useNoteVisit } from "@/components/plat/useRecent";
import {
  courseHref, loadIndex, loadProfessors, loadSubject, professorHref, professorSlug, ratingTone, termName, termOrder,
  typicalGrade, type PlatIndex, type ProfessorRecord, type SubjectFile,
} from "@/lib/plat";

/** How many past terms show before "Show all". */
const TERMS_SHOWN = 10;

interface TermRow {
  term: string;
  code: string;
  gpa: number | null;
  aRate: number;
}

export default function ProfessorPage({ params }: { params: Promise<{ name: string }> }) {
  const { name: slug } = use(params);
  const [profs, setProfs] = useState<ProfessorRecord[] | null>(null);
  const [index, setIndex] = useState<PlatIndex | null>(null);
  const [files, setFiles] = useState<Record<string, SubjectFile>>({});
  const [allTerms, setAllTerms] = useState(false);

  useEffect(() => {
    loadProfessors().then((f) => setProfs(f.professors)).catch(() => setProfs([]));
  }, []);
  useEffect(() => { loadIndex().then(setIndex).catch(() => {}); }, []);

  const prof = useMemo(
    () => profs?.find((p) => professorSlug(p.n) === slug) ?? null,
    [profs, slug],
  );

  useNoteVisit(prof ? { kind: "professor", key: prof.n, label: prof.n, href: professorHref(prof.n) } : null);

  // The subjects they have taught in, whose files hold each term's grades.
  const subjects = useMemo(
    () => (prof ? [...new Set(prof.c.map(([code]) => code.slice(0, code.lastIndexOf(" "))))] : []),
    [prof],
  );
  const subjectKey = subjects.join(",");
  useEffect(() => {
    if (!subjectKey) return;
    let live = true;
    Promise.all(subjectKey.split(",").map((s) => loadSubject(s).then((f) => [s, f] as const).catch(() => null)))
      .then((pairs) => {
        if (!live) return;
        setFiles(Object.fromEntries(pairs.filter((p): p is readonly [string, SubjectFile] => p !== null)));
      });
    return () => { live = false; };
  }, [subjectKey]);

  const titleOf = useMemo(() => {
    const m = new Map(index?.courses.map((c) => [c.k, c.t]) ?? []);
    return (code: string) => m.get(code) ?? "";
  }, [index]);

  /** Every published term they taught, across every course, newest first. */
  const terms = useMemo((): TermRow[] => {
    if (!prof) return [];
    const names = new Set([prof.n, ...(prof.a ?? [])]);
    const out: TermRow[] = [];
    for (const [code] of prof.c) {
      const detail = files[code.slice(0, code.lastIndexOf(" "))]?.courses[code];
      if (!detail?.hist) continue;
      const mine = new Set(detail.profs.map((p, i) => (names.has(p.i) ? i : -1)).filter((i) => i >= 0));
      for (const h of detail.hist) if (mine.has(h[1])) out.push({ term: h[0], code, gpa: h[2], aRate: h[3] });
    }
    return out.sort((a, b) => termOrder(b.term) - termOrder(a.term) || a.code.localeCompare(b.code));
  }, [prof, files]);

  const points = useMemo((): TermPoint[] => terms
    .filter((t) => t.gpa != null)
    .map((t) => ({ term: t.term, series: t.code, gpa: t.gpa as number, aRate: t.aRate })), [terms]);
  const highlight = useMemo(() => {
    const count = new Map<string, number>();
    for (const p of points) count.set(p.series, (count.get(p.series) ?? 0) + 1);
    return [...count.keys()].sort((a, b) => (count.get(b) ?? 0) - (count.get(a) ?? 0)).slice(0, 3);
  }, [points]);

  const teachingNow = useMemo(() => prof?.c.filter((c) => c[3] === 1) ?? [], [prof]);
  const previously = useMemo(() => prof?.c.filter((c) => c[3] !== 1) ?? [], [prof]);

  if (profs && !prof) {
    return (
      <PlatShell>
        <div className="mx-auto max-w-2xl px-4 py-24 text-center">
          <h1 className={PAGE_TITLE}>No instructor by that name</h1>
          <p className="mt-2 text-sm text-gray-500">
            They may not appear in UCSD&apos;s published grade distributions.
          </p>
          <Link href="/" className="mt-6 inline-block text-sm font-semibold underline">
            Back to search
          </Link>
        </div>
      </PlatShell>
    );
  }

  const verdict = typicalGrade(prof?.gpa, prof?.terms);
  const dept = prof ? professorDepartment(prof) : null;
  const shownTerms = allTerms ? terms : terms.slice(0, TERMS_SHOWN);

  return (
    <PlatShell>
      <div className={`mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 ${PAGE_PAD}`}>
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
          <Link href="/courses" className="hover:underline">Courses</Link>
          {dept && (
            <>
              <ChevronRight className="h-3 w-3" aria-hidden />
              <Link href={`/courses/${dept.id}`} className="hover:underline">{dept.name}</Link>
            </>
          )}
          <ChevronRight className="h-3 w-3" aria-hidden />
          <span className="text-gray-700 dark:text-gray-200">{prof?.n ?? "Professor"}</span>
        </nav>

        {!prof ? (
          <p className="py-24 text-center text-sm text-gray-500">Loading…</p>
        ) : (
          <>
            <header className="mt-5 flex items-start gap-5">
              <GradeBadge gpa={prof.gpa} terms={prof.terms} size="lg" />
              <div className="min-w-0 flex-1">
                <h1 className={PAGE_TITLE}>{prof.n}</h1>
                {prof.a?.length ? (
                  <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                    also listed as {prof.a.join(", ")}
                  </p>
                ) : null}
                <p className="mt-2 max-w-3xl text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                  {verdict
                    ? `Students typically earn a ${verdict.letter} in their classes, across ${prof.terms} graded ${prof.terms === 1 ? "term" : "terms"} and ${prof.c.length} ${prof.c.length === 1 ? "course" : "courses"}.`
                    : "No published grade distribution for this instructor yet."}
                  {prof.cur === 1 && " They are teaching this term."}
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-gray-600 dark:text-gray-300">
                  {prof.q != null && prof.q > 0 && (
                    <span className={`inline-flex items-center gap-1 font-semibold ${ratingTone(prof.q)}`}>
                      <Star className="h-3.5 w-3.5 fill-current" />
                      {prof.q.toFixed(1)} / 5
                      {prof.nr ? <span className="font-normal text-gray-500 dark:text-gray-400">({prof.nr} ratings)</span> : null}
                    </span>
                  )}
                  <LoadTag difficulty={prof.d} />
                  {prof.w != null && prof.w > 0 && <span>{prof.w}% would take again</span>}
                  {prof.id && (
                    <a
                      href={`https://www.ratemyprofessors.com/professor/${prof.id}`}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1 hover:underline"
                    >
                      Reviews on RateMyProfessors <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
            </header>

            <div className={`${PAGE_GAP} grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-14`}>
              <div className="min-w-0 space-y-12 lg:col-span-7">
                {teachingNow.length > 0 && (
                  <CourseList title="Teaching this term" rows={teachingNow} titleOf={titleOf} />
                )}
                {previously.length > 0 && (
                  <CourseList
                    title={teachingNow.length ? "Previously taught" : "Courses taught"}
                    rows={previously}
                    titleOf={titleOf}
                  />
                )}
              </div>

              <aside className="min-w-0 space-y-6 lg:col-span-5">
                {points.length > 1 && (
                  <section className="rounded-2xl border border-gray-200 p-5 dark:border-white/10">
                    <h2 className={SECTION_TITLE}>Grades by term</h2>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Each dot is one class&rsquo;s average for one term, coloured by course.
                    </p>
                    <div className="mt-3">
                      <TermGradesChart points={points} highlight={highlight} otherLabel="Other courses" title={`${prof.n}'s class averages by term`} />
                    </div>
                  </section>
                )}

                {terms.length > 0 && (
                  <section className="rounded-2xl border border-gray-200 p-5 dark:border-white/10">
                    <h2 className={SECTION_TITLE}>Every term</h2>
                    <table className="mt-3 w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-gray-500 dark:text-gray-400">
                          <th scope="col" className="pb-2 font-medium">Term</th>
                          <th scope="col" className="pb-2 font-medium">Course</th>
                          <th scope="col" className="pb-2 text-right font-medium">Average</th>
                          <th scope="col" className="pb-2 text-right font-medium">A&rsquo;s</th>
                        </tr>
                      </thead>
                      <tbody>
                        {shownTerms.map((t, i) => (
                          <tr key={`${t.term}-${t.code}-${i}`} className="border-t border-gray-100 dark:border-white/5">
                            <td className="py-2 pr-2 whitespace-nowrap">{termName(t.term)}</td>
                            <td className="py-2 pr-2">
                              <Link href={courseHref(t.code)} className="font-mono text-xs font-bold text-[#182B49] hover:underline dark:text-[#FFCD00]">{t.code}</Link>
                            </td>
                            <td className="py-2 text-right tabular-nums">
                              {t.gpa != null ? (
                                <span className="inline-flex items-center justify-end gap-2">
                                  <GradeBadge gpa={t.gpa} terms={2} size="xs" />
                                  {t.gpa.toFixed(2)}
                                </span>
                              ) : <span className="text-gray-500 dark:text-gray-400">no GPA</span>}
                            </td>
                            <td className="py-2 pl-2 text-right tabular-nums">{Math.round(t.aRate)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {terms.length > TERMS_SHOWN && (
                      <button type="button" onClick={() => setAllTerms((v) => !v)} className="mt-3 text-xs font-semibold text-[#182B49] hover:underline dark:text-[#FFCD00]">
                        {allTerms ? "Show fewer" : `Show all ${terms.length} terms`}
                      </button>
                    )}
                  </section>
                )}
              </aside>
            </div>
          </>
        )}
      </div>
    </PlatShell>
  );
}

function CourseList({
  title, rows, titleOf,
}: {
  title: string;
  rows: ProfessorRecord["c"];
  titleOf: (code: string) => string;
}) {
  return (
    <section>
      <h2 className={`mb-3 ${SECTION_TITLE}`}>
        {title} <span className="ml-1 font-normal text-gray-500 dark:text-gray-400">{rows.length}</span>
      </h2>
      <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-white/10">
        {rows.map(([code, gpa, terms, , aRate]) => (
          <Link
            key={code}
            href={courseHref(code)}
            className="group flex items-center gap-3 border-b border-gray-100 px-3 py-3 last:border-0 transition hover:bg-gray-50 dark:border-white/5 dark:hover:bg-white/5"
          >
            <GradeBadge gpa={gpa} terms={terms} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-mono text-xs font-bold text-[#182B49] dark:text-[#FFCD00]">{code}</span>
                <span className="min-w-0 truncate text-sm font-medium group-hover:underline">{titleOf(code)}</span>
              </span>
              <span className="block text-xs text-gray-500 dark:text-gray-400">
                {terms > 0 ? `${terms} graded term${terms === 1 ? "" : "s"}` : "no grade history"}
                {aRate ? ` · ${aRate.toFixed(0)}% A` : ""}
              </span>
            </span>
            {gpa != null && gpa > 0 && (
              <span className="shrink-0 text-xs tabular-nums text-gray-500 dark:text-gray-400">
                {gpa.toFixed(2)}
              </span>
            )}
          </Link>
        ))}
      </div>
    </section>
  );
}
