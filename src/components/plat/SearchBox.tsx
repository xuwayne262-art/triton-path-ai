"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import SearchResults, { type Combined } from "./SearchResults";
import {
  loadIndex, loadProfessors, professorHref, searchCourses, searchProfessors,
  type CourseRow, type ProfessorRecord,
} from "@/lib/plat";

/**
 * Navbar search across both courses and instructors. Arrow keys walk the
 * combined list, professors first.
 */
export default function SearchBox({ className = "" }: { className?: string }) {
  const router = useRouter();
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [profs, setProfs] = useState<ProfessorRecord[]>([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadIndex().then((d) => setCourses(d.courses)).catch(() => {});
    loadProfessors().then((d) => setProfs(d.professors)).catch(() => {});
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const results = useMemo<Combined>(
    () => ({
      profs: searchProfessors(profs, q, 4),
      courses: searchCourses(courses, q, 6),
    }),
    [courses, profs, q],
  );

  const flat = useMemo(
    () => [
      ...results.profs.map((p) => professorHref(p.prof.n)),
      ...results.courses.map(({ row }) => {
        const i = row.k.lastIndexOf(" ");
        return `/course/${encodeURIComponent(row.k.slice(0, i))}/${encodeURIComponent(row.k.slice(i + 1))}`;
      }),
    ],
    [results],
  );

  const [activeFor, setActiveFor] = useState(q);
  if (activeFor !== q) { setActiveFor(q); setActive(0); }

  const go = (href: string | undefined) => {
    if (!href) return;
    setOpen(false);
    setQ("");
    router.push(href);
  };

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
      <input
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, flat.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
          else if (e.key === "Enter") { e.preventDefault(); go(flat[active]); }
          else if (e.key === "Escape") setOpen(false);
        }}
        placeholder="Search courses and professors"
        className="w-full rounded-full border border-gray-200 bg-gray-50 py-2 pl-9 pr-4 text-sm outline-none transition
                   placeholder:text-gray-400 focus:border-[#182B49] focus:bg-white
                   dark:border-white/10 dark:bg-white/5 dark:text-gray-100 dark:focus:border-[#FFCD00] dark:focus:bg-white/10"
      />

      {open && q.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-[26rem] overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 shadow-xl dark:border-white/10 dark:bg-[#101a2b]">
          <SearchResults
            results={results}
            query={q}
            active={active}
            onHover={setActive}
            onPick={go}
          />
        </div>
      )}
    </div>
  );
}
