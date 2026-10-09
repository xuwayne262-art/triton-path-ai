"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, ExternalLink, Star } from "lucide-react";
import PlatShell from "@/components/plat/PlatShell";
import CourseResults, { DEFAULT_FILTERS, type ResultFilters } from "@/components/plat/CourseResults";
import { GradeBadge } from "@/components/plat/Grade";
import { useNoteVisit } from "@/components/plat/useRecent";
import {
  loadIndex, loadProfessors, professorHref, ratingTone,
  type CourseRow, type PlatIndex, type ProfessorRecord,
} from "@/lib/plat";
import {
  collegeById, collegeForSubject, departmentById, departmentForSubject, schoolById,
} from "@/data/ucsdStructure";
import { freshNote, offeringsForSubjects } from "@/data/departmentOfferings";

/** How many professors show before "See all". */
const PROFS_SHOWN = 8;

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
  // Colleges are reachable by their id ("eighth") as well as by a prefix they
  // own ("CCE"), since the browse list links the former.
  const college = dept ? null : (collegeById(param) ?? collegeForSubject(param.toUpperCase()));
  // Held stable across renders so the memos below key off one array identity.
  const subjects = useMemo(
    () => dept?.subjects ?? college?.subjects ?? [param.toUpperCase()],
    [dept, college, param],
  );
  const title = dept?.name ?? college?.name ?? param.toUpperCase();
  const school = dept ? schoolById(dept.schoolId) : null;
  const pageId = dept?.id ?? college?.id ?? param;

  const [data, setData] = useState<PlatIndex | null>(null);
  const [profs, setProfs] = useState<ProfessorRecord[] | null>(null);
  const [showAllProfs, setShowAllProfs] = useState(false);
  const [filters, setFilters] = useState<ResultFilters>({ ...DEFAULT_FILTERS, sort: "code" });

  useEffect(() => { loadIndex().then(setData).catch(() => {}); }, []);
  useEffect(() => { loadProfessors().then((f) => setProfs(f.professors)).catch(() => setProfs([])); }, []);

  useNoteVisit({ kind: "department", key: pageId, label: title, href: `/courses/${pageId}` });

  const subjectSet = useMemo(() => new Set(subjects), [subjects]);
  const inDept = (code: string) => subjectSet.has(code.slice(0, code.lastIndexOf(" ")));
  const rows: CourseRow[] = useMemo(
    () => data?.courses.filter((c) => subjectSet.has(c.s)) ?? [],
    [data, subjectSet],
  );

  /**
   * Everyone who has taught here, one record per person — the professor index
   * already folds a schedule's "Geoff Voelker" into the archive's "Geoffrey M.
   * Voelker", which the chips this replaced listed twice. Teaching this term
   * first; within each group, the most-rated first, since that is the number
   * shown beside each name.
   */
  const faculty = useMemo(() => {
    if (!profs) return null;
    return profs
      .map((p) => {
        const here = p.c.filter(([code]) => inDept(code));
        return { p, here, now: here.filter((c) => c[3] === 1) };
      })
      .filter((x) => x.here.length > 0)
      .sort((a, b) =>
        Number(b.now.length > 0) - Number(a.now.length > 0)
        || (b.p.nr ?? 0) - (a.p.nr ?? 0)
        || a.p.n.localeCompare(b.p.n))
    // `inDept` reads `subjectSet`, which is what changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profs, subjectSet]);
  const teachingNow = faculty?.filter((f) => f.now.length > 0).length ?? 0;

  const listing = useMemo(() => offeringsForSubjects(subjects), [subjects]);
  const note = freshNote(listing?.note) ?? freshNote(listing?.label);

  const offered = rows.filter((r) => r.o).length;
  const visible = showAllProfs ? faculty ?? [] : (faculty ?? []).slice(0, PROFS_SHOWN);

  return (
    <PlatShell>
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
          <Link href="/courses" className="hover:underline">Courses</Link>
          <ChevronRight className="h-3 w-3" aria-hidden />
          <span className="text-gray-700 dark:text-gray-200">{title}</span>
        </nav>

        {school && (
          <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {school.name}
          </p>
        )}
        <h1 className="mt-1 text-3xl font-black tracking-tight">{title}</h1>

        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          {data ? `${offered} of ${rows.length} courses on the ${data.meta.termName} schedule` : "Loading courses…"}
          {faculty ? ` · ${teachingNow} ${teachingNow === 1 ? "professor" : "professors"} teaching this term` : ""}
        </p>

        {subjects.length > 1 && (
          <div className="mt-3 flex flex-wrap items-center gap-1">
            <span className="mr-1 text-xs text-gray-500 dark:text-gray-400">Course prefixes</span>
            {subjects.map((code) => (
              <span
                key={code}
                className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs font-semibold text-gray-700 dark:bg-white/10 dark:text-gray-200"
              >
                {code}
              </span>
            ))}
          </div>
        )}

        {/* Our schedule is a snapshot of a term the registrar was still
            assembling, so the department's own list is the tie-breaker. */}
        {listing && listing.url && (
          <a
            href={listing.url}
            target="_blank"
            rel="noreferrer"
            className="mt-5 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/60 p-3 transition hover:border-amber-300 hover:bg-amber-50 dark:border-amber-500/25 dark:bg-amber-500/5 dark:hover:bg-amber-500/10"
          >
            <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700 dark:text-amber-400" />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-amber-950 dark:text-amber-100">
                Course offerings published by {listing.department}
              </span>
              <span className="mt-0.5 block text-xs leading-relaxed text-amber-900 dark:text-amber-200/80">
                {note ?? "Tentative and subject to change — check here before you plan around a section."}
              </span>
            </span>
          </a>
        )}

        <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-12">
          <div className="min-w-0 lg:col-span-8">
            <CourseResults
              rows={rows}
              filters={filters}
              onChange={setFilters}
              termName={data?.meta.termName}
              emptyHint={data ? `No ${title} courses match these filters.` : "Loading…"}
            />
          </div>

          {/* ── The people, as their own directory ───────────────────────── */}
          <aside className="min-w-0 lg:col-span-4">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">Professors</h2>
              {faculty && <span className="text-xs text-gray-500 dark:text-gray-400">{faculty.length} on record</span>}
            </div>
            <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
              Teaching this term first, then everyone who has taught here; most-rated first.
            </p>
            <ul className="mt-3 overflow-hidden rounded-2xl border border-gray-200 dark:border-white/10">
              {faculty === null ? (
                <li className="py-10 text-center text-sm text-gray-500">Loading…</li>
              ) : faculty.length === 0 ? (
                <li className="py-10 text-center text-sm text-gray-500">No professors on record.</li>
              ) : visible.map(({ p, here, now }) => (
                <li key={p.n} className="border-b border-gray-100 last:border-0 dark:border-white/5">
                  <Link href={professorHref(p.n)} className="group flex items-center gap-3 px-3 py-2.5 transition hover:bg-gray-50 dark:hover:bg-white/5">
                    <GradeBadge gpa={p.gpa} terms={p.terms} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium group-hover:underline">{p.n}</span>
                      <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
                        {now.length > 0
                          ? <span className="text-emerald-700 dark:text-emerald-400">Now: {now.map((c) => c[0]).join(", ")}</span>
                          : `${here.length} ${here.length === 1 ? "course" : "courses"} taught here`}
                      </span>
                    </span>
                    {p.q != null && p.q > 0 ? (
                      <span className={`flex shrink-0 flex-col items-end text-xs font-semibold ${ratingTone(p.q)}`} title={`${p.nr ?? 0} RateMyProfessors ratings`}>
                        <span className="inline-flex items-center gap-0.5"><Star className="h-3 w-3 fill-current" />{p.q.toFixed(1)}</span>
                        <span className="font-normal text-gray-500 dark:text-gray-400">{p.nr ?? 0} ratings</span>
                      </span>
                    ) : (
                      <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">unrated</span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
            {faculty && faculty.length > PROFS_SHOWN && (
              <button
                type="button"
                onClick={() => setShowAllProfs((v) => !v)}
                className="mt-2 text-xs font-semibold text-[#182B49] hover:underline dark:text-[#FFCD00]"
              >
                {showAllProfs ? "Show fewer" : `See all ${faculty.length} professors`}
              </button>
            )}
          </aside>
        </div>
      </div>
    </PlatShell>
  );
}
