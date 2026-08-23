"use client";

import { Star, User } from "lucide-react";
import { GradeBadge } from "./Grade";
import {
  professorHref, type CourseRow, type ProfessorRecord, type SearchHit,
} from "@/lib/plat";

export interface Combined {
  profs: { prof: ProfessorRecord; score: number }[];
  courses: SearchHit[];
}

/**
 * One dropdown, two clearly separated kinds of result.
 *
 * Searching a professor used to return a bare list of course titles with the
 * instructor's name nowhere on screen, so it read as if the search had matched
 * something arbitrary. Professors are now their own labelled group, and a course
 * that matched because of who teaches it says so.
 */
export default function SearchResults({
  results,
  query,
  active,
  onHover,
  onPick,
}: {
  results: Combined;
  query: string;
  /** Index into the flattened professor-then-course list. */
  active: number;
  onHover: (i: number) => void;
  onPick: (href: string) => void;
}) {
  const { profs, courses } = results;
  const total = profs.length + courses.length;

  if (total === 0) {
    return (
      <div className="px-4 py-6 text-center">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Nothing matched “{query}”
        </p>
        <p className="mt-1 text-xs text-gray-400">
          Try a course code like CSE 11, a subject, or an instructor&apos;s surname.
        </p>
      </div>
    );
  }

  const q = query.trim().toLowerCase();

  return (
    <>
      {profs.length > 0 && (
        <>
          <Header>Professors</Header>
          {profs.map(({ prof }, i) => (
            <button
              key={prof.n}
              type="button"
              onMouseEnter={() => onHover(i)}
              onClick={() => onPick(professorHref(prof.n))}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition ${
                i === active ? "bg-gray-100 dark:bg-white/10" : ""
              }`}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 dark:bg-white/10">
                <User className="h-4 w-4 text-gray-500 dark:text-gray-300" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{prof.n}</span>
                <span className="flex flex-wrap items-center gap-x-2 text-xs text-gray-500 dark:text-gray-400">
                  <span>
                    {prof.c.length} {prof.c.length === 1 ? "course" : "courses"}
                  </span>
                  {prof.cur === 1 && (
                    <span className="font-medium text-emerald-600 dark:text-emerald-400">
                      teaching now
                    </span>
                  )}
                  {prof.q != null && prof.q > 0 && (
                    <span className="inline-flex items-center gap-0.5 font-semibold text-amber-600 dark:text-amber-400">
                      <Star className="h-3 w-3 fill-current" />
                      {prof.q.toFixed(1)}
                    </span>
                  )}
                </span>
              </span>
              {prof.gpa != null && (
                <GradeBadge gpa={prof.gpa} terms={prof.terms} size="sm" />
              )}
            </button>
          ))}
        </>
      )}

      {courses.length > 0 && (
        <>
          <Header>Courses</Header>
          {courses.map(({ row }, j) => {
            const i = profs.length + j;
            // Say plainly why this course matched, when it was not the title.
            const viaProf =
              row.p && row.p.toLowerCase().includes(q) ? row.p : null;
            return (
              <button
                key={row.k}
                type="button"
                onMouseEnter={() => onHover(i)}
                onClick={() => onPick(courseLink(row))}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition ${
                  i === active ? "bg-gray-100 dark:bg-white/10" : ""
                }`}
              >
                <GradeBadge gpa={row.g} terms={row.r} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{row.t}</span>
                  <span className="flex flex-wrap items-center gap-x-2 text-xs text-gray-500 dark:text-gray-400">
                    <span className="font-mono">{row.k}</span>
                    {viaProf && (
                      <span className="text-indigo-600 dark:text-indigo-400">
                        taught by {viaProf}
                      </span>
                    )}
                  </span>
                </span>
              </button>
            );
          })}
        </>
      )}
    </>
  );
}

function Header({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wide text-gray-400">
      {children}
    </p>
  );
}

function courseLink(row: CourseRow) {
  const i = row.k.lastIndexOf(" ");
  return `/course/${encodeURIComponent(row.k.slice(0, i))}/${encodeURIComponent(row.k.slice(i + 1))}`;
}
