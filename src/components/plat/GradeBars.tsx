"use client";

import type { ProfRecord } from "@/lib/plat";

const LETTER_COLORS: Record<string, string> = {
  A: "#16a34a",
  B: "#65a30d",
  C: "#d97706",
  D: "#ea580c",
  F: "#dc2626",
  W: "#64748b",
  P: "#0891b2",
  NP: "#7c3aed",
};

type Slice = { key: string; pct: number };

function slices(p: ProfRecord): Slice[] {
  return (["A", "B", "C", "D", "F", "W", "P", "NP"] as const)
    .map((k) => ({ key: k, pct: p[k] ?? 0 }))
    .filter((s) => s.pct > 0);
}

/**
 * The grade distribution for one instructor, as a stacked bar plus a labeled
 * column chart. Percentages come straight from UCSD's published distributions.
 */
export default function GradeBars({ prof, compact = false }: { prof: ProfRecord; compact?: boolean }) {
  const data = slices(prof);
  const total = data.reduce((a, s) => a + s.pct, 0);

  if (!total) {
    return (
      <p className="rounded-lg bg-gray-50 px-3 py-4 text-center text-xs text-gray-400 dark:bg-white/5">
        No published grade distribution for this instructor yet.
      </p>
    );
  }

  if (compact) {
    return (
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-white/10">
        {data.map((s) => (
          <span
            key={s.key}
            title={`${s.key}: ${s.pct.toFixed(1)}%`}
            style={{ width: `${(s.pct / total) * 100}%`, background: LETTER_COLORS[s.key] }}
          />
        ))}
      </div>
    );
  }

  const max = Math.max(...data.map((s) => s.pct));

  return (
    <div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-white/10">
        {data.map((s) => (
          <span
            key={s.key}
            title={`${s.key}: ${s.pct.toFixed(1)}%`}
            style={{ width: `${(s.pct / total) * 100}%`, background: LETTER_COLORS[s.key] }}
          />
        ))}
      </div>

      <div className="mt-4 flex items-end gap-2 sm:gap-3">
        {data.map((s) => (
          <div key={s.key} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <span className="text-[11px] font-semibold tabular-nums text-gray-600 dark:text-gray-300">
              {s.pct.toFixed(1)}%
            </span>
            <span
              className="w-full rounded-t"
              style={{
                height: `${Math.max(4, (s.pct / max) * 96)}px`,
                background: LETTER_COLORS[s.key],
              }}
            />
            <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400">{s.key}</span>
          </div>
        ))}
      </div>

      <p className="mt-3 text-[11px] text-gray-400">
        {prof.n > 0
          ? `Aggregated over ${prof.n} graded term${prof.n === 1 ? "" : "s"}${prof.y ? `, most recently 20${prof.y}` : ""}.`
          : "Single-term sample."}
      </p>
    </div>
  );
}
