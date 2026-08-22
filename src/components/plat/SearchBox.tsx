"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { GradeBadge } from "./Grade";
import { courseHref, loadIndex, searchCourses, type CourseRow } from "@/lib/plat";

/**
 * The navbar search. Matches course codes, titles and the instructor teaching
 * this term, and jumps straight to the course page on Enter.
 */
export default function SearchBox({ className = "" }: { className?: string }) {
  const router = useRouter();
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadIndex().then((d) => setCourses(d.courses)).catch(() => {});
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const hits = useMemo(() => searchCourses(courses, q, 8), [courses, q]);

  // The highlight belongs to the current query; reset it as the query changes.
  const [activeFor, setActiveFor] = useState(q);
  if (activeFor !== q) {
    setActiveFor(q);
    setActive(0);
  }

  function go(row: CourseRow | undefined) {
    if (!row) return;
    setOpen(false);
    setQ("");
    router.push(courseHref(row.k));
  }

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
      <input
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, hits.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
          else if (e.key === "Enter") { e.preventDefault(); go(hits[active]?.row); }
          else if (e.key === "Escape") setOpen(false);
        }}
        placeholder="Search courses and professors"
        className="w-full rounded-full border border-gray-200 bg-gray-50 py-2 pl-9 pr-4 text-sm outline-none transition
                   placeholder:text-gray-400 focus:border-[#182B49] focus:bg-white
                   dark:border-white/10 dark:bg-white/5 dark:text-gray-100 dark:focus:border-[#FFCD00] dark:focus:bg-white/10"
      />

      {open && q.trim().length >= 2 && (
        <ul className="absolute left-0 right-0 top-full z-50 mt-2 max-h-96 list-none overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 shadow-xl dark:border-white/10 dark:bg-gray-900">
          {hits.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-gray-400">
              Nothing matched “{q}”
            </li>
          )}
          {hits.map(({ row }, i) => (
            <li key={row.k}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => go(row)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition ${
                  i === active ? "bg-gray-100 dark:bg-white/10" : ""
                }`}
              >
                <GradeBadge gpa={row.g} terms={row.r} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{row.t}</span>
                  <span className="block font-mono text-xs text-gray-500 dark:text-gray-400">{row.k}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
