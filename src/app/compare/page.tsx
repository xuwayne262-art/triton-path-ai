"use client";

import { Suspense, useEffect, useId, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, X } from "lucide-react";
import PlatShell from "@/components/plat/PlatShell";
import PageHeader from "@/components/plat/PageHeader";
import PrereqText from "@/components/plat/PrereqText";
import { GradeBadge, RmpRating } from "@/components/plat/Grade";
import { finalsText } from "@/components/plat/SectionPicker";
import { PAGE_PAD } from "@/components/plat/typeScale";
import {
  courseHref, geLabel, loadIndex, loadProfessors, loadSubject, prereqKnown, professorFor, termName, universityRequirement,
  type CourseDetail, type CourseRow, type PlatIndex, type ProfessorRecord, type SubjectFile,
} from "@/lib/plat";
import { groupSections, sectionWhen, sectionWhere, typeLabel, INSTRUCTOR } from "@/lib/sections";
import { finalOverview } from "@/lib/sectionChoice";
import { unitsLabel } from "@/lib/units";
import { MAX_COMPARE, compareHref, normalizeCode, parseCompare, rememberCompare, withCode, withoutCode } from "@/lib/compare";

/**
 * Two or three courses side by side, on the facts a choice rests on: units,
 * this term's actual meetings, finals, prerequisites, which requirement lists
 * name them, and how much grade history there is. Each row is one kind of
 * fact, so a student reads across. There is deliberately no overall score:
 * the facts measure different things, and adding them up would invent one.
 *
 * Desktop shows columns; a phone stacks one card per course with the same
 * headings. Every action is a button or link, so the page works by keyboard.
 */
export default function ComparePage() {
  return (
    <Suspense fallback={<PlatShell><div className={`mx-auto max-w-6xl px-4 ${PAGE_PAD}`} aria-busy="true" /></PlatShell>}>
      <Compare />
    </Suspense>
  );
}

interface Loaded {
  code: string;
  row: CourseRow | undefined;
  detail: CourseDetail | undefined;
  failed: boolean;
}

function Compare() {
  const router = useRouter();
  const search = useSearchParams();
  const [index, setIndex] = useState<PlatIndex | null>(null);
  const [indexFailed, setIndexFailed] = useState(false);
  const [files, setFiles] = useState<Record<string, SubjectFile | "failed">>({});
  const [profs, setProfs] = useState<ProfessorRecord[] | null>(null);
  const [adding, setAdding] = useState("");
  const [addError, setAddError] = useState("");
  const inputId = useId();

  useEffect(() => { loadIndex().then(setIndex).catch(() => setIndexFailed(true)); }, []);
  useEffect(() => { loadProfessors().then((f) => setProfs(f.professors)).catch(() => setProfs([])); }, []);

  const known = useMemo(() => new Set(index?.courses.map((c) => c.k) ?? []), [index]);
  const { codes, dropped } = useMemo(
    () => parseCompare(search.get("c"), index ? (c) => known.has(c) : () => true),
    [search, index, known],
  );

  const codeKey = codes.join(",");
  useEffect(() => { if (index) rememberCompare(codeKey ? codeKey.split(",") : []); }, [codeKey, index]);

  const subjects = useMemo(() => [...new Set(codes.map((c) => c.split(" ")[0]))], [codes]);
  useEffect(() => {
    let live = true;
    for (const s of subjects) {
      if (files[s]) continue;
      loadSubject(s)
        .then((f) => { if (live) setFiles((prev) => ({ ...prev, [s]: f })); })
        .catch(() => { if (live) setFiles((prev) => ({ ...prev, [s]: "failed" })); });
    }
    return () => { live = false; };
  }, [subjects, files]);

  const loaded: Loaded[] = codes.map((code) => {
    const file = files[code.split(" ")[0]];
    return {
      code,
      row: index?.courses.find((c) => c.k === code),
      detail: file && file !== "failed" ? file.courses[code] : undefined,
      failed: file === "failed",
    };
  });

  const go = (next: string[]) => router.push(compareHref(next));
  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const code = normalizeCode(adding);
    if (!code) { setAddError("Type a course code, like CSE 12."); return; }
    if (index && !known.has(code)) { setAddError(`${code} isn't in UCSD's catalog.`); return; }
    setAddError("");
    setAdding("");
    go(withCode(codes, code));
  };

  return (
    <PlatShell>
      <div className={`mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 ${PAGE_PAD}`}>
        <PageHeader
          title="Compare courses"
          description="Up to three courses on the facts a choice rests on. There is no overall score: these measure different things, and grades describe past classes, not workload."
        />

        <form onSubmit={add} className="mt-6 flex flex-wrap items-start gap-2">
          <label htmlFor={inputId} className="sr-only">Add a course to compare</label>
          <input
            id={inputId}
            value={adding}
            onChange={(e) => { setAdding(e.target.value); setAddError(""); }}
            placeholder={codes.length >= MAX_COMPARE ? "Three at most: adding replaces the first" : "Add a course, like CSE 12"}
            aria-describedby={addError ? `${inputId}-err` : undefined}
            className="min-h-11 w-full max-w-xs rounded-lg border border-gray-300 bg-white px-3 text-base outline-none focus:border-[#182B49] focus-visible:ring-2 focus-visible:ring-[#182B49]/30 sm:text-sm dark:border-white/15 dark:bg-white/5"
          />
          <button type="submit" className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-[#182B49] px-4 text-sm font-semibold text-white hover:bg-[#1e3a63] dark:bg-[#FFCD00] dark:text-[#182B49]">
            <Plus className="h-4 w-4" aria-hidden /> Add
          </button>
          {codes.length > 0 && (
            <button type="button" onClick={() => go([])} className="min-h-11 rounded-lg px-3 text-sm font-semibold text-gray-700 underline underline-offset-2 dark:text-gray-300">
              Clear all
            </button>
          )}
          {addError && <p id={`${inputId}-err`} role="alert" className="basis-full text-sm text-red-700 dark:text-red-400">{addError}</p>}
        </form>

        {dropped.length > 0 && (
          <p role="status" className="mt-4 rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-950 dark:bg-amber-500/10 dark:text-amber-100">
            Left out, not in UCSD&rsquo;s catalog: {dropped.join(", ")}.
          </p>
        )}
        {indexFailed && (
          <p role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-900 dark:bg-red-500/10 dark:text-red-100">
            The course list didn&rsquo;t load, so codes can&rsquo;t be checked. <button type="button" className="font-semibold underline" onClick={() => window.location.reload()}>Try again</button>
          </p>
        )}

        {codes.length === 0 ? (
          <div className="mt-10 rounded-xl border border-dashed border-gray-300 px-4 py-12 text-center text-sm text-gray-600 dark:border-white/15 dark:text-gray-400">
            Nothing to compare yet. Add a course above, or use <span className="font-semibold">Compare</span> on any course page.
          </div>
        ) : (
          <div className={`mt-8 grid grid-cols-1 gap-4 ${codes.length === 2 ? "md:grid-cols-2" : codes.length === 3 ? "md:grid-cols-3" : ""}`}>
            {loaded.map((c) => (
              <CourseColumn
                key={c.code}
                course={c}
                termLabel={index?.meta.termName ?? "This term"}
                known={(code) => known.has(code)}
                profs={profs}
                onRemove={() => go(withoutCode(codes, c.code))}
              />
            ))}
          </div>
        )}
      </div>
    </PlatShell>
  );
}

const LABEL = "text-[11px] font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400";

function CourseColumn({ course, termLabel, known, profs, onRemove }: {
  course: Loaded;
  termLabel: string;
  known: (code: string) => boolean;
  profs: ProfessorRecord[] | null;
  onRemove: () => void;
}) {
  const { code, detail, row, failed } = course;
  const families = useMemo(() => groupSections(detail?.sec ?? []), [detail]);
  const overview = useMemo(() => finalOverview(detail?.sec ?? [], families), [detail, families]);
  const hist = detail?.hist ?? [];
  const span = hist.length ? `${termName(hist[hist.length - 1][0])} – ${termName(hist[0][0])}` : "";
  const reqs = detail?.ge ?? [];

  return (
    <article aria-labelledby={`cmp-${code.replace(/\W/g, "")}`} className="flex flex-col rounded-2xl border border-gray-200 p-4 dark:border-white/10">
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 id={`cmp-${code.replace(/\W/g, "")}`} className="font-mono text-sm font-bold text-[#182B49] dark:text-[#FFCD00]">
            <Link href={courseHref(code)} className="hover:underline">{code}</Link>
          </h2>
          <p className="mt-0.5 text-sm font-medium">{detail?.t ?? row?.t ?? (failed ? "" : "Loading…")}</p>
        </div>
        <button type="button" onClick={onRemove} aria-label={`Remove ${code} from the comparison`} className="shrink-0 rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-white/10 dark:hover:text-white">
          <X className="h-4 w-4" aria-hidden />
        </button>
      </header>

      {failed ? (
        <p role="alert" className="mt-4 text-sm text-red-800 dark:text-red-300">This course&rsquo;s details didn&rsquo;t load. <button type="button" className="font-semibold underline" onClick={() => window.location.reload()}>Try again</button></p>
      ) : !detail ? (
        <div className="mt-4 h-64 animate-pulse rounded-xl bg-gray-100 motion-reduce:animate-none dark:bg-white/5" aria-busy="true" />
      ) : (
        <dl className="mt-4 space-y-4 text-sm">
          <div>
            <dt className={LABEL}>Units</dt>
            <dd>{unitsLabel(detail.u, detail.t)}</dd>
          </div>
          <div>
            <dt className={LABEL}>{termLabel} meetings</dt>
            <dd>
              {!detail.offered || !families.length ? "Not on this term's schedule." : (
                <ul className="space-y-1">
                  {families.map((f) => (
                    <li key={f.key}>
                      <span className="font-medium">{f.lecture ? `${typeLabel(f.lecture[1])} ${f.key}` : `Section ${f.key}`}</span>
                      <span className="text-gray-700 dark:text-gray-300">
                        {f.lecture ? ` · ${[sectionWhen(f.lecture), sectionWhere(f.lecture)].filter(Boolean).join(" · ")}` : ""}
                        {f.lecture?.[INSTRUCTOR] ? ` · ${f.lecture[INSTRUCTOR]}` : ""}
                      </span>
                      {f.parts.length > 0 && (
                        <span className="block text-xs text-gray-600 dark:text-gray-400">
                          plus {f.parts.map((p) => `a ${p.label.toLowerCase()} (${Object.keys(p.rows).length} ${Object.keys(p.rows).length === 1 ? "option" : "options"})`).join(" and ")}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </dd>
          </div>
          <div>
            <dt className={LABEL}>Final exam</dt>
            <dd>
              {overview.kind === "none" ? "None listed on the schedule." : overview.kind === "same"
                ? finalsText(overview.finals, overview.rooms)
                : "Depends on the lecture: " + overview.byFamily.map((f) => `${f.key}: ${f.finals.length ? finalsText(f.finals) : "none listed"}`).join("; ")}
            </dd>
          </div>
          <div>
            <dt className={LABEL}>Prerequisites</dt>
            <dd className="text-gray-800 dark:text-gray-200">
              {detail.pre ? <PrereqText text={detail.pre} known={known} />
                : row && !prereqKnown(row) ? "Not on record. Check with the department."
                : "None listed."}
            </dd>
          </div>
          <div>
            <dt className={LABEL}>Requirement lists</dt>
            <dd>
              {reqs.length ? (
                <ul className="space-y-0.5">
                  {reqs.map((g) => (
                    <li key={g}>
                      {geLabel(g)}
                      <span className="text-xs text-gray-600 dark:text-gray-400">{universityRequirement(g) ? " · UCSD's list" : " · student-compiled list, may count"}</span>
                    </li>
                  ))}
                </ul>
              ) : "Not on any requirement list UCSDPlans has."}
            </dd>
          </div>
          <div>
            <dt className={LABEL}>Grade history</dt>
            <dd className="flex items-center gap-2">
              {detail.gpa != null && detail.gpa > 0 ? (
                <>
                  <GradeBadge gpa={detail.gpa} terms={detail.terms} size="xs" />
                  <span>{detail.gpa.toFixed(2)} average over {detail.terms} graded {detail.terms === 1 ? "term" : "terms"}{span ? `, ${span}` : ""}</span>
                </>
              ) : "No published grade history."}
            </dd>
          </div>
          {detail.profs.some((p) => p.cur === 1) && (
            <div>
              <dt className={LABEL}>Teaching {termLabel}</dt>
              <dd>
                <ul className="space-y-0.5">
                  {detail.profs.filter((p) => p.cur === 1).map((p) => {
                    const profile = profs ? professorFor(profs, p.i) : null;
                    return (
                      <li key={p.i} className="flex flex-wrap items-center gap-x-1.5">
                        <span>{p.i}</span>
                        {profile?.q ? <RmpRating q={profile.q} n={profile.nr} name={p.i} /> : <span className="text-xs text-gray-600 dark:text-gray-400">{profs ? "no RMP rating" : ""}</span>}
                        {profile?.nr ? <span className="text-xs text-gray-600 dark:text-gray-400">({profile.nr} ratings, across all their courses)</span> : null}
                      </li>
                    );
                  })}
                </ul>
              </dd>
            </div>
          )}
        </dl>
      )}
    </article>
  );
}
