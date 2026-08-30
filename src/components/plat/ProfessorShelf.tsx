"use client";

import Link from "next/link";
import { Star } from "lucide-react";
import { GradeBadge } from "./Grade";
import { professorHref, type ProfessorRecord } from "@/lib/plat";
import { departmentForSubject } from "@/data/ucsdStructure";

/** The department a professor mostly teaches in, weighted by terms taught. */
export function professorDepartment(prof: ProfessorRecord) {
  const weight = new Map<string, { id: string; name: string; n: number }>();
  for (const [code, , terms] of prof.c) {
    const dept = departmentForSubject(code.slice(0, code.lastIndexOf(" ")));
    if (!dept) continue;
    const hit = weight.get(dept.id);
    if (hit) hit.n += Math.max(terms, 1);
    else weight.set(dept.id, { id: dept.id, name: dept.name, n: Math.max(terms, 1) });
  }
  return [...weight.values()].sort((a, b) => b.n - a.n)[0] ?? null;
}

/**
 * A row per professor rather than per course. The shelf used to list courses
 * under a "best-rated professors" heading, which answered a question nobody
 * asked: a course row cannot tell you whether the person teaching it is the
 * reason it is on the shelf.
 */
export default function ProfessorRow({ prof }: { prof: ProfessorRecord }) {
  const dept = professorDepartment(prof);
  const teaching = prof.c.filter((c) => c[3]).length;

  return (
    <Link
      href={professorHref(prof.n)}
      className="group flex items-center gap-3.5 border-b border-gray-100 px-3 py-3 transition hover:bg-gray-50 dark:border-white/5 dark:hover:bg-white/5"
    >
      <span className="flex w-11 shrink-0 flex-col items-center gap-0.5">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-100 text-lg font-black tabular-nums text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300">
          {prof.q?.toFixed(1)}
        </span>
        <span className="flex items-center gap-0.5 text-[10px] font-semibold text-gray-400">
          <Star className="h-2.5 w-2.5 fill-current" />
          {prof.nr}
        </span>
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium group-hover:underline">{prof.n}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-gray-500 dark:text-gray-400">
          {dept && <span>{dept.name}</span>}
          {teaching > 0 && (
            <>
              {dept && <Dot />}
              <span className="text-emerald-600 dark:text-emerald-400">
                {teaching} {teaching === 1 ? "course" : "courses"} this term
              </span>
            </>
          )}
        </span>
      </span>

      <span className="hidden shrink-0 flex-col items-end gap-0.5 sm:flex">
        <GradeBadge gpa={prof.gpa} terms={prof.terms} size="sm" />
        <span className="text-[10px] text-gray-400">they give</span>
      </span>
    </Link>
  );
}

const Dot = () => <span className="text-gray-300 dark:text-gray-600">·</span>;
