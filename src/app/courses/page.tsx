"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import PlatShell from "@/components/plat/PlatShell";
import { loadIndex, type PlatIndex } from "@/lib/plat";

/**
 * A plain directory. The old version bolted an "all courses" results mode onto
 * this page, duplicating what search already does — browsing a department and
 * searching the catalog are different jobs and now live in different places.
 */
export default function CoursesPage() {
  const [data, setData] = useState<PlatIndex | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => { loadIndex().then(setData).catch(() => {}); }, []);

  const departments = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLowerCase();
    const list = needle
      ? data.subjects.filter((s) => s.code.toLowerCase().includes(needle) || s.name.toLowerCase().includes(needle))
      : data.subjects;
    return [...list].sort((a, b) => b.offered - a.offered || a.code.localeCompare(b.code));
  }, [data, q]);

  return (
    <PlatShell>
      <div className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-black tracking-tight">Departments</h1>

        <div className="relative mt-5">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="CSE, Cognitive Science, Literature…"
            className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-4 text-sm outline-none focus:border-[#182B49] dark:border-white/10 dark:bg-white/5 dark:text-gray-100"
          />
        </div>

        <div className="mt-6">
          {departments.map((s) => (
            <Link
              key={s.code}
              href={`/courses/${s.code}`}
              className="group flex items-baseline gap-3 border-b border-gray-100 px-2 py-3 transition hover:bg-gray-50 dark:border-white/5 dark:hover:bg-white/5"
            >
              <span className="w-16 shrink-0 font-mono text-sm font-bold text-[#182B49] dark:text-[#FFCD00]">
                {s.code}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm group-hover:underline">{s.name}</span>
              <span className="shrink-0 text-xs text-gray-400">
                {s.offered > 0 ? `${s.offered} this term` : `${s.n} courses`}
              </span>
            </Link>
          ))}
          {!departments.length && data && (
            <p className="py-16 text-center text-sm text-gray-400">No department matches “{q}”.</p>
          )}
        </div>
      </div>
    </PlatShell>
  );
}
