"use client";

import { AlertTriangle, Check, CircleDashed, CircleHelp, Minus } from "lucide-react";
import type { HistoryChip as Chip } from "@/lib/history/planLayer";
import type { Standing } from "@/lib/history/attempts";

/**
 * One course from the saved Academic History, as the 4-year plan shows it.
 *
 * It is not a planned course and does not behave like one: it cannot be
 * dragged or removed here (the record is changed on the Academic History
 * page). Its standing is said in words and an icon, never by colour alone.
 */

const STYLE: Record<Standing, { icon: typeof Check; cls: string; short: (c: Chip) => string }> = {
  "completed": {
    icon: Check,
    cls: "border-emerald-700/40 bg-white text-gray-900 dark:border-emerald-400/40 dark:bg-gray-900/60 dark:text-gray-100",
    short: (c) => c.grade ?? "done",
  },
  "in-progress": {
    icon: CircleDashed,
    cls: "border-dashed border-sky-700/60 bg-white text-gray-900 dark:border-sky-300/60 dark:bg-gray-900/60 dark:text-gray-100",
    short: () => "in progress",
  },
  "missing-grade": {
    icon: CircleHelp,
    cls: "border-amber-700/50 bg-amber-50 text-amber-950 dark:border-amber-300/50 dark:bg-amber-500/10 dark:text-amber-100",
    short: () => "no grade yet",
  },
  "needs-review": {
    icon: AlertTriangle,
    cls: "border-amber-700/50 bg-amber-50 text-amber-950 dark:border-amber-300/50 dark:bg-amber-500/10 dark:text-amber-100",
    short: () => "check",
  },
  "no-credit": {
    icon: Minus,
    cls: "border-gray-400 bg-gray-50 text-gray-700 dark:border-gray-500 dark:bg-white/5 dark:text-gray-300",
    short: (c) => `${c.grade ?? "no credit"}, no credit`,
  },
  "withdrawn": {
    icon: Minus,
    cls: "border-gray-400 bg-gray-50 text-gray-700 dark:border-gray-500 dark:bg-white/5 dark:text-gray-300",
    short: () => "withdrawn",
  },
  "incomplete": {
    icon: CircleHelp,
    cls: "border-gray-400 bg-gray-50 text-gray-700 dark:border-gray-500 dark:bg-white/5 dark:text-gray-300",
    short: () => "incomplete",
  },
};

/** "ECON 110B, Short Run Macroeconomics. In progress, Fall 2026, 4 units." */
export function chipDescription(c: Chip): string {
  const parts = [
    `${c.label}${c.grade && c.standing !== "in-progress" ? ` (${c.grade})` : ""}`,
    c.termName,
    `${c.units} ${c.units === 1 ? "unit" : "units"}`,
  ];
  const notes = [
    c.src ? `Printed as ${c.src}.` : "",
    c.unmatched ? "Not in the current catalog." : "",
    c.repeated ? "Taken more than once; counted once." : "",
    c.plannedId ? "Also in your plan for this quarter." : "",
  ].filter(Boolean);
  return `${c.code}${c.title ? `, ${c.title}` : ""}. ${parts.join(", ")}.${notes.length ? ` ${notes.join(" ")}` : ""}`;
}

export default function HistoryChip({ chip }: { chip: Chip }) {
  const s = STYLE[chip.standing];
  const Icon = s.icon;
  const text = chipDescription(chip);
  return (
    <div
      role="listitem"
      title={text}
      aria-label={text}
      className={`flex items-center gap-1 rounded border px-1.5 py-1 text-[10px] leading-tight ${s.cls}`}
    >
      <Icon aria-hidden className="h-3 w-3 shrink-0" />
      <span className="font-semibold">{chip.code}</span>
      <span className="min-w-0 truncate opacity-80">· {s.short(chip)}</span>
    </div>
  );
}

/** The key to the chips, in words. */
export function HistoryLegend() {
  const items: Array<[Standing, string]> = [
    ["completed", "Completed (grade shown)"],
    ["in-progress", "In progress"],
    ["missing-grade", "No grade shown yet"],
    ["needs-review", "Needs a look"],
    ["no-credit", "No credit or withdrawn"],
  ];
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-600 dark:text-gray-300" aria-label="What the Academic History marks mean">
      {items.map(([standing, label]) => {
        const Icon = STYLE[standing].icon;
        return (
          <li key={standing} className="flex items-center gap-1">
            <Icon aria-hidden className="h-3 w-3" />
            {label}
          </li>
        );
      })}
      <li className="flex items-center gap-1">
        <span aria-hidden className="inline-block h-3 w-3 rounded bg-slate-200 dark:bg-white/20" />
        Planned (drag to move)
      </li>
    </ul>
  );
}
