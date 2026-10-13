"use client";

import { Star, User } from "lucide-react";
import { GradeBadge } from "./Grade";
import {
  professorHref, ratingTone, type CourseRow, type ProfessorRecord, type SearchHit,
} from "@/lib/plat";

export interface Combined {
  profs: { prof: ProfessorRecord; score: number }[];
  courses: SearchHit[];
}

/** Where each result leads, professors first — the order the arrow keys walk. */
export function resultHrefs(results: Combined): string[] {
  return [...results.profs.map((p) => professorHref(p.prof.n)), ...results.courses.map(({ row }) => courseLink(row))];
}

/** The DOM id of the i-th result, for aria-activedescendant. */
export const optionId = (prefix: string, i: number) => `${prefix}-opt-${i}`;

/**
 * One listbox, two clearly separated kinds of result, each a group with its
 * own label so a screen reader hears "Professors" and "Courses" as it moves.
 *
 * Searching a professor used to return a bare list of course titles with the
 * instructor's name nowhere on screen, so it read as if the search had matched
 * something arbitrary. Professors are now their own labelled group, and a course
 * that matched because of who teaches it says so.
 *
 * Results are options, not buttons: focus stays in the search box, and the
 * box points at the active one (aria-activedescendant), as a combobox should.
 */
export default function SearchResults({
  results,
  query,
  active,
  onHover,
  onPick,
  idPrefix,
}: {
  results: Combined;
  query: string;
  /** Index into the flattened professor-then-course list. */
  active: number;
  onHover: (i: number) => void;
  onPick: (href: string) => void;
  idPrefix: string;
}) {
  const { profs, courses } = results;
  const total = profs.length + courses.length;

  if (total === 0) {
    return (
      <div className="px-4 py-6 text-center">
        <p className="text-sm text-gray-700 dark:text-gray-300">Nothing matched “{query}”</p>
        <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
          Try a course code like CSE 11, a subject, or an instructor&apos;s surname.
        </p>
      </div>
    );
  }

  const q = query.trim().toLowerCase();
  const option = (i: number, href: string, label: string, children: React.ReactNode) => (
    <div
      key={href}
      id={optionId(idPrefix, i)}
      role="option"
      aria-selected={i === active}
      aria-label={label}
      onMouseEnter={() => onHover(i)}
      // Keeps focus in the box, so the click is the only thing that happens.
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => onPick(href)}
      className={`flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-left transition ${
        i === active ? "bg-gray-100 ring-1 ring-inset ring-[#182B49]/30 dark:bg-white/10 dark:ring-[#FFCD00]/40" : ""
      }`}
    >
      {children}
    </div>
  );

  return (
    <>
      {profs.length > 0 && (
        <div role="group" aria-labelledby={`${idPrefix}-profs`}>
          <Header id={`${idPrefix}-profs`}>Professors</Header>
          {profs.map(({ prof }, i) => option(
            i,
            professorHref(prof.n),
            `${prof.n}, professor${prof.cur === 1 ? ", teaching this term" : ""}${prof.q ? `, RateMyProfessors ${prof.q.toFixed(1)}` : ""}`,
            <>
              <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 dark:bg-white/10">
                <User className="h-4 w-4 text-gray-600 dark:text-gray-300" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{prof.n}</span>
                <span className="flex flex-wrap items-center gap-x-2 text-xs text-gray-600 dark:text-gray-400">
                  <span>{prof.c.length} {prof.c.length === 1 ? "course" : "courses"}</span>
                  {prof.a?.length ? <span>also {prof.a.slice(0, 2).join(", ")}</span> : null}
                  {prof.cur === 1 && <span className="font-medium text-emerald-700 dark:text-emerald-400">teaching now</span>}
                  {prof.q != null && prof.q > 0 && (
                    <span className={`inline-flex items-center gap-0.5 font-semibold ${ratingTone(prof.q)}`}>
                      <Star aria-hidden className="h-3 w-3 fill-current" />
                      {prof.q.toFixed(1)}
                    </span>
                  )}
                </span>
              </span>
              {prof.gpa != null && <GradeBadge gpa={prof.gpa} terms={prof.terms} size="sm" />}
            </>,
          ))}
        </div>
      )}

      {courses.length > 0 && (
        <div role="group" aria-labelledby={`${idPrefix}-courses`}>
          <Header id={`${idPrefix}-courses`}>Courses</Header>
          {courses.map(({ row }, j) => {
            const i = profs.length + j;
            // Say plainly why this course matched, when it was not the title.
            const viaProf = row.p && row.p.toLowerCase().includes(q) ? row.p : null;
            return option(
              i,
              courseLink(row),
              `${row.k}, ${row.t}${viaProf ? `, taught by ${viaProf}` : ""}`,
              <>
                <GradeBadge gpa={row.g} terms={row.r} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{row.t}</span>
                  <span className="flex flex-wrap items-center gap-x-2 text-xs text-gray-600 dark:text-gray-400">
                    <span className="font-mono">{row.k}</span>
                    {viaProf && <span className="text-indigo-700 dark:text-indigo-400">taught by {viaProf}</span>}
                    {!row.o && <span>not offered this term</span>}
                  </span>
                </span>
              </>,
            );
          })}
        </div>
      )}
    </>
  );
}

function Header({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <p id={id} className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wide text-gray-600 dark:text-gray-400">
      {children}
    </p>
  );
}

function courseLink(row: CourseRow) {
  const i = row.k.lastIndexOf(" ");
  return `/course/${encodeURIComponent(row.k.slice(0, i))}/${encodeURIComponent(row.k.slice(i + 1))}`;
}
