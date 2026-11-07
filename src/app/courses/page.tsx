"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import PlatShell from "@/components/plat/PlatShell";
import PageHeader from "@/components/plat/PageHeader";
import DiscoverLink from "@/components/plat/DiscoverLink";
import { LABEL, PAGE_GAP, PAGE_PAD } from "@/components/plat/typeScale";
import QuarterPicker from "@/components/plat/QuarterPicker";
import { useTerm } from "@/components/plat/useTerm";
import { type PlatIndex } from "@/lib/plat";
import { loadIndexFor } from "@/lib/termData";
import { withTerm } from "@/lib/terms";
import {
  COLLEGE_UNITS, DEPARTMENTS, SCHOOLS,
  type Department,
} from "@/data/ucsdStructure";

interface DeptStat {
  dept: Department;
  courses: number;
  offered: number;
}

/**
 * Browse by school and department, the way UC San Diego is actually organised.
 * This page used to list all 189 course prefixes as if each were a department,
 * which split Biology into six entries and buried the real structure.
 */
export default function CoursesPage() {
  const [data, setData] = useState<PlatIndex | null>(null);
  const [q, setQ] = useState("");

  const term = useTerm()?.term ?? null;
  useEffect(() => {
    if (!term) return;
    let live = true;
    setData(null);
    loadIndexFor(term).then((d) => { if (live) setData(d); }).catch(() => {});
    return () => { live = false; };
  }, [term]);

  /**
   * Subjects UCSD's schedule lists that no department or college here groups:
   * every one stays findable, in a list of its own, rather than disappearing
   * because the directory does not know where it belongs.
   */
  const ungrouped = useMemo(() => {
    const grouped = new Set([...DEPARTMENTS.flatMap((d) => d.subjects), ...COLLEGE_UNITS.flatMap((c) => c.subjects)]);
    return (data?.subjects ?? []).filter((s) => !grouped.has(s.code) && s.offered > 0);
  }, [data]);

  /** Course counts rolled up from subject codes to the owning department. */
  const stats = useMemo(() => {
    const bySubject = new Map<string, { n: number; offered: number }>();
    data?.subjects.forEach((s) => bySubject.set(s.code, { n: s.n, offered: s.offered }));

    const out = new Map<string, DeptStat>();
    for (const dept of DEPARTMENTS) {
      let courses = 0, offered = 0;
      for (const code of dept.subjects) {
        const hit = bySubject.get(code);
        if (hit) { courses += hit.n; offered += hit.offered; }
      }
      out.set(dept.id, { dept, courses, offered });
    }
    return out;
  }, [data]);

  /** Colleges roll up the same way, off their own core-sequence prefixes. */
  const collegeStats = useMemo(() => {
    const bySubject = new Map<string, { n: number; offered: number }>();
    data?.subjects.forEach((s) => bySubject.set(s.code, { n: s.n, offered: s.offered }));

    return COLLEGE_UNITS.map((college) => {
      let courses = 0, offered = 0;
      for (const code of college.subjects) {
        const hit = bySubject.get(code);
        if (hit) { courses += hit.n; offered += hit.offered; }
      }
      return { college, courses, offered };
    });
  }, [data]);

  /** Prefix -> its full programme name, so "writing" reaches MCWP and WCWP. */
  const subjectNames = useMemo(() => {
    const m = new Map<string, string>();
    data?.subjects.forEach((s) => { if (s.name && s.name !== s.code) m.set(s.code, s.name.toLowerCase()); });
    return m;
  }, [data]);

  const needle = q.trim().toLowerCase();
  const matches = (d: { name: string; subjects: string[] }) =>
    !needle ||
    d.name.toLowerCase().includes(needle) ||
    d.subjects.some(
      (s) => s.toLowerCase().includes(needle) || (subjectNames.get(s)?.includes(needle) ?? false),
    );

  const colleges = useMemo(
    () => collegeStats.filter((c) => matches(c.college)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [collegeStats, needle, subjectNames],
  );

  const schools = useMemo(
    () =>
      SCHOOLS.map((school) => ({
        school,
        depts: DEPARTMENTS
          .filter((d) => d.schoolId === school.id && matches(d))
          .map((d) => stats.get(d.id)!)
          .filter(Boolean)
          .sort((a, b) => b.offered - a.offered || a.dept.name.localeCompare(b.dept.name)),
      })).filter((g) => g.depts.length > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stats, needle, subjectNames],
  );

  // Subjects no department claims are filtered the same way, by code and by
  // name, and counted with the rest: typing "CINE" used to hide CINE's own
  // link and report two other matches.
  const others = ungrouped.filter((s) => !needle || s.code.toLowerCase().includes(needle) || (s.name ?? "").toLowerCase().includes(needle));
  const totalDepts = schools.reduce((n, g) => n + g.depts.length, 0) + colleges.length + others.length;

  return (
    <PlatShell>
      <div className={`mx-auto max-w-4xl px-4 sm:px-6 ${PAGE_PAD}`}>
        {/* The filter is the page's one control, so it sits on the title's line. */}
        <PageHeader
          title="Courses"
          description={
            `${DEPARTMENTS.length} departments in ${SCHOOLS.length} schools and divisions, plus the ${COLLEGE_UNITS.length} colleges`
            + (data ? ` · ${data.meta.catalogCourses.toLocaleString()} courses, ${data.meta.offered.toLocaleString()} on the ${data.meta.termName} schedule` : "")
          }
          actions={
            <label className="relative block w-full sm:w-72">
              <span className="sr-only">Filter this list of departments, colleges and subjects</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Filter this list: Biology, CSE…"
                className="h-9 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-[#182B49] dark:border-white/10 dark:bg-white/5 dark:text-gray-100 dark:focus:border-[#FFCD00]"
              />
            </label>
          }
        />

        <QuarterPicker className="mt-4" />
        <DiscoverLink className="mt-5 inline-flex items-center text-sm font-semibold text-[#182B49] underline underline-offset-4 dark:text-[#FFCD00]" />

        {needle && (
          <p role="status" className="mt-4 text-xs text-gray-600 dark:text-gray-400">
            {totalDepts
              ? `${totalDepts} matching ${totalDepts === 1 ? "department, college or subject" : "departments, colleges and subjects"}`
              : `No department, college or subject matches “${q.trim()}”. To find a course, use the search at the top.`}
          </p>
        )}

        <div className={`${PAGE_GAP} space-y-12`}>
          {schools.map(({ school, depts }) => (
            <section key={school.id}>
              <h2 className={LABEL}>
                {school.name}
              </h2>
              <div className="mt-3">
                {depts.map(({ dept, courses, offered }) => (
                  <Link
                    key={dept.id}
                    href={withTerm(`/courses/${dept.id}`, term)}
                    className="group flex items-start gap-3 border-b border-gray-100 px-2 py-4 transition hover:bg-gray-50 dark:border-white/5 dark:hover:bg-white/5"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold group-hover:underline">
                        {dept.name}
                      </span>
                      <span className="mt-1.5 flex flex-wrap gap-1">
                        {dept.subjects.slice(0, 8).map((code) => (
                          <span
                            key={code}
                            className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-gray-600 dark:bg-white/10 dark:text-gray-300"
                          >
                            {code}
                          </span>
                        ))}
                        {dept.subjects.length > 8 && (
                          <span className="text-[11px] text-gray-500 dark:text-gray-400">
                            +{dept.subjects.length - 8}
                          </span>
                        )}
                      </span>
                    </span>
                    <span className="shrink-0 text-right text-xs text-gray-500 dark:text-gray-400">
                      {data && <span className="block">{courses} courses</span>}
                      {offered > 0 && (
                        <span className="block text-emerald-700 dark:text-emerald-400">
                          {offered} offered
                        </span>
                      )}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          ))}
          {/* Every college-owned course lives here rather than being scattered
              through the schools — a college runs nothing but its own core and
              writing sequence, so one section holds all of them. */}
          {colleges.length > 0 && (
            <section>
              <h2 className={LABEL}>The eight colleges</h2>
              <p className="mt-1.5 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                Colleges are a separate thing from departments. Every undergraduate belongs to one,
                and it sets your general-education and writing requirements, but colleges own no
                majors and no academic departments. The only courses they run are their own core
                sequences, listed together here.
              </p>
              <div className="mt-3">
                {colleges.map(({ college, courses, offered }) => (
                  <Link
                    key={college.id}
                    href={withTerm(`/courses/${college.id}`, term)}
                    className="group flex items-start gap-3 border-b border-gray-100 px-2 py-4 transition hover:bg-gray-50 dark:border-white/5 dark:hover:bg-white/5"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold group-hover:underline">
                        {college.name}
                      </span>
                      <span className="mt-1.5 flex flex-wrap gap-1">
                        {college.subjects.map((code) => (
                          <span
                            key={code}
                            className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-gray-600 dark:bg-white/10 dark:text-gray-300"
                          >
                            {code}
                          </span>
                        ))}
                      </span>
                    </span>
                    <span className="shrink-0 text-right text-xs text-gray-500 dark:text-gray-400">
                      {data && <span className="block">{courses} courses</span>}
                      {offered > 0 && (
                        <span className="block text-emerald-700 dark:text-emerald-400">
                          {offered} offered
                        </span>
                      )}
                    </span>
                  </Link>
                ))}
              </div>
              <Link
                href={withTerm("/ge", term)}
                className="mt-4 inline-block text-xs font-semibold text-[#182B49] hover:underline dark:text-[#FFCD00]"
              >
                Find GE courses for your college →
              </Link>
            </section>
          )}
          {others.length > 0 && (
            <section>
              <h2 className={LABEL}>Other subjects on the {data?.meta.termName} schedule</h2>
              <p className="mt-1.5 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                UCSD lists these subjects for {data?.meta.termName}; this directory does not group them under a department.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {others.map((s) => (
                  <Link
                    key={s.code}
                    href={withTerm(`/courses/${s.code}`, term)}
                    className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs transition hover:border-[#182B49] dark:border-white/10 dark:hover:border-[#FFCD00]"
                  >
                    <span className="font-mono font-semibold">{s.code}</span>
                    {s.name && s.name !== s.code && <span className="ml-1.5 text-gray-600 dark:text-gray-400">{s.name}</span>}
                    <span className="ml-1.5 text-emerald-700 dark:text-emerald-400">{s.offered}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </PlatShell>
  );
}
