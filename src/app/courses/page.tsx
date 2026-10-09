"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import PlatShell from "@/components/plat/PlatShell";
import PageHeader from "@/components/plat/PageHeader";
import { LABEL, PAGE_GAP, PAGE_PAD } from "@/components/plat/typeScale";
import { loadIndex, type PlatIndex } from "@/lib/plat";
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

  useEffect(() => { loadIndex().then(setData).catch(() => {}); }, []);

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

  const totalDepts = schools.reduce((n, g) => n + g.depts.length, 0) + colleges.length;

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
              <span className="sr-only">Filter departments</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Biology, CSE, Literature…"
                className="h-9 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-[#182B49] dark:border-white/10 dark:bg-white/5 dark:text-gray-100 dark:focus:border-[#FFCD00]"
              />
            </label>
          }
        />

        {needle && (
          <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
            {totalDepts} matching {totalDepts === 1 ? "listing" : "listings"}
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
                    href={`/courses/${dept.id}`}
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
                          <span className="text-[11px] text-gray-500">
                            +{dept.subjects.length - 8}
                          </span>
                        )}
                      </span>
                    </span>
                    <span className="shrink-0 text-right text-xs text-gray-500">
                      {data && <span className="block">{courses} courses</span>}
                      {offered > 0 && (
                        <span className="block text-emerald-600 dark:text-emerald-400">
                          {offered} this term
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
                and it sets your general-education and writing requirements — but colleges own no
                majors and no academic departments. The only courses they run are their own core
                sequences, listed together here.
              </p>
              <div className="mt-3">
                {colleges.map(({ college, courses, offered }) => (
                  <Link
                    key={college.id}
                    href={`/courses/${college.id}`}
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
                    <span className="shrink-0 text-right text-xs text-gray-500">
                      {data && <span className="block">{courses} courses</span>}
                      {offered > 0 && (
                        <span className="block text-emerald-600 dark:text-emerald-400">
                          {offered} this term
                        </span>
                      )}
                    </span>
                  </Link>
                ))}
              </div>
              <Link
                href="/ge"
                className="mt-4 inline-block text-xs font-semibold text-[#182B49] hover:underline dark:text-[#FFCD00]"
              >
                Find GE courses for your college →
              </Link>
            </section>
          )}
        </div>
      </div>
    </PlatShell>
  );
}
