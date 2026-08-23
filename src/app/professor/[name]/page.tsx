"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ExternalLink, Star } from "lucide-react";
import PlatShell from "@/components/plat/PlatShell";
import { GradeBadge, LoadTag } from "@/components/plat/Grade";
import {
  courseHref, loadProfessors, professorSlug, typicalGrade,
  type ProfessorRecord,
} from "@/lib/plat";

export default function ProfessorPage({ params }: { params: Promise<{ name: string }> }) {
  const { name: slug } = use(params);
  const [profs, setProfs] = useState<ProfessorRecord[] | null>(null);

  useEffect(() => {
    loadProfessors().then((f) => setProfs(f.professors)).catch(() => setProfs([]));
  }, []);

  const prof = useMemo(
    () => profs?.find((p) => professorSlug(p.n) === slug) ?? null,
    [profs, slug],
  );

  const teachingNow = useMemo(() => prof?.c.filter((c) => c[3] === 1) ?? [], [prof]);
  const previously = useMemo(() => prof?.c.filter((c) => c[3] !== 1) ?? [], [prof]);

  if (profs && !prof) {
    return (
      <PlatShell>
        <div className="mx-auto max-w-2xl px-4 py-24 text-center">
          <h1 className="text-xl font-bold">No instructor by that name</h1>
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

  return (
    <PlatShell>
      <div className="mx-auto max-w-3xl px-4 py-8">
        <Link href="/" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:underline dark:text-gray-400">
          <ChevronLeft className="h-3.5 w-3.5" /> Search
        </Link>

        {!prof ? (
          <p className="py-24 text-center text-sm text-gray-400">Loading…</p>
        ) : (
          <>
            <header className="mt-4 flex items-start gap-5">
              <GradeBadge gpa={prof.gpa} terms={prof.terms} size="lg" />
              <div className="min-w-0 flex-1">
                <h1 className="text-2xl font-black leading-tight">{prof.n}</h1>
                {prof.a?.length ? (
                  <p className="mt-0.5 text-xs text-gray-400">
                    also listed as {prof.a.join(", ")}
                  </p>
                ) : null}
                <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                  {verdict
                    ? `Students typically earn a ${verdict.letter} in their classes, across ${prof.terms} graded ${prof.terms === 1 ? "term" : "terms"} and ${prof.c.length} ${prof.c.length === 1 ? "course" : "courses"}.`
                    : "No published grade distribution for this instructor yet."}
                  {prof.cur === 1 && " They are teaching this term."}
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                  {prof.q != null && prof.q > 0 && (
                    <span className="inline-flex items-center gap-1 font-semibold text-amber-600 dark:text-amber-400">
                      <Star className="h-3.5 w-3.5 fill-current" />
                      {prof.q.toFixed(1)} / 5
                      {prof.nr ? <span className="font-normal text-gray-400">({prof.nr} ratings)</span> : null}
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
                      RateMyProfessors <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
            </header>

            {teachingNow.length > 0 && (
              <CourseList title="Teaching this term" rows={teachingNow} />
            )}
            {previously.length > 0 && (
              <CourseList
                title={teachingNow.length ? "Previously taught" : "Courses taught"}
                rows={previously}
              />
            )}
          </>
        )}
      </div>
    </PlatShell>
  );
}

function CourseList({ title, rows }: { title: string; rows: ProfessorRecord["c"] }) {
  return (
    <section className="mt-8">
      <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">
        {title} <span className="ml-1 font-normal text-gray-400">{rows.length}</span>
      </h2>
      <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-white/10">
        {rows.map(([code, gpa, terms, , aRate]) => (
          <Link
            key={code}
            href={courseHref(code)}
            className="group flex items-center gap-3 border-b border-gray-100 px-3 py-2.5 last:border-0 transition hover:bg-gray-50 dark:border-white/5 dark:hover:bg-white/5"
          >
            <GradeBadge gpa={gpa} terms={terms} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block font-mono text-xs font-bold text-[#182B49] group-hover:underline dark:text-[#FFCD00]">
                {code}
              </span>
              <span className="block text-[11px] text-gray-500 dark:text-gray-400">
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
