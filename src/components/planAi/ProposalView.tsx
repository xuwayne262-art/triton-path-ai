"use client";

import { ChevronDown, Eye } from "lucide-react";
import { factsLines, minutes, reasonText, tradeoffs, verified } from "@/lib/planAi/explain";
import { goalRefLabel, type Settings } from "@/lib/planAi/conversation";
import type { Proposal } from "@/lib/planAi/types";
import CheckList from "./CheckList";

/**
 * One option: what it does to the plan, as a diff — what it adds with
 * sections and times, removes, re-sections and keeps — and what that buys.
 * The button names exactly what happens: "Choose this option" for a draft
 * that only adds, "Apply changes" when something on the plan changes.
 */

export default function ProposalView({
  proposal, index, settings, stale, previewing, busy, onApply, onUpdate, onPreview,
}: {
  proposal: Proposal;
  index: number;
  settings: Settings | null;
  stale: boolean;
  previewing: boolean;
  busy: boolean;
  onApply: () => void;
  onUpdate: () => void;
  onPreview: () => void;
}) {
  const p = proposal;
  const changes = p.removes.length > 0 || p.resections.length > 0;
  const unknowns = p.checks.filter((c) => c.status === "unknown" || (c.status === "pass" && !verified(c))).length;
  const problems = p.checks.filter((c) => c.status === "fail").length;
  const ctx = {
    units: settings?.units,
    earliest: settings?.earliestStart,
    latest: settings?.latestEnd,
    avoid: settings?.avoidDays,
    goal: settings?.goal ? goalRefLabel(settings.goal) : undefined,
  };
  const trade = tradeoffs(p);
  // A 4-year plan quarter has no times at all; the message above the options says so once.
  const plan = p.target.kind === "plan";
  return (
    <article
      aria-label={`Option ${index + 1}: ${p.title}`}
      className={`rounded-xl border bg-white p-4 transition-shadow motion-reduce:transition-none dark:bg-gray-800 ${
        previewing ? "border-[#0f6e7a] shadow-sm ring-1 ring-[#0f6e7a]/40 dark:border-[#5fd0dc] dark:ring-[#5fd0dc]/40" : "border-gray-200 dark:border-white/10"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">Option {index + 1}</p>
          <h3 className="text-sm font-semibold text-[#182B49] dark:text-white">{p.title}</h3>
        </div>
        {stale ? (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">Out of date</span>
        ) : (
          <span className="rounded-full bg-[#0f6e7a]/10 px-2 py-0.5 text-[11px] font-semibold text-[#0f6e7a] dark:bg-[#5fd0dc]/15 dark:text-[#5fd0dc]">Draft · not saved</span>
        )}
      </div>

      <p className="mt-2 text-xs tabular-nums text-gray-700 dark:text-gray-300">
        {factsLines(plan ? { ...p.after, unscheduled: [] } : p.after).join(" · ")}
        {p.after.days.length > 0 && p.after.gapMinutes > 0 ? ` · ${minutes(p.after.gapMinutes)} of gaps a week` : ""}
      </p>

      <dl className="mt-3 space-y-1.5 text-xs">
        {p.adds.length > 0 && (
          <div>
            <dt className="font-semibold text-gray-800 dark:text-gray-100">Adds</dt>
            {p.adds.map((a) => (
              <dd key={a.code} className="ml-0 text-gray-700 dark:text-gray-300">
                <span className="font-medium">{a.code}</span>
                {a.meetings.length ? ` · ${a.meetings.map((m) => `${m.label} ${m.when}`).join("; ")}` : plan ? ` · ${a.title}` : " · sections not chosen"}
              </dd>
            ))}
          </div>
        )}
        {p.removes.length > 0 && (
          <div><dt className="inline font-semibold text-gray-800 dark:text-gray-100">Removes </dt><dd className="inline text-gray-700 dark:text-gray-300">{p.removes.join(", ")}</dd></div>
        )}
        {p.resections.length > 0 && (
          <div><dt className="inline font-semibold text-gray-800 dark:text-gray-100">Changes sections for </dt><dd className="inline text-gray-700 dark:text-gray-300">{p.resections.join(", ")}</dd></div>
        )}
        {p.keep.length > 0 && (
          <div><dt className="inline text-gray-600 dark:text-gray-400">Keeps </dt><dd className="inline text-gray-600 dark:text-gray-400">{p.keep.join(", ")}</dd></div>
        )}
      </dl>

      {(p.reasons.length > 0 || trade.length > 0) && (
        <ul className="mt-3 list-disc space-y-0.5 pl-4 text-xs text-gray-700 dark:text-gray-300">
          {p.reasons.slice(0, 3).map((r) => <li key={r}>{reasonText(r, p, ctx)}</li>)}
          {trade.map((t) => <li key={t}>{t}, compared with now.</li>)}
        </ul>
      )}

      <details className="group mt-3">
        <summary className="inline-flex min-h-8 cursor-pointer list-none items-center gap-1 rounded text-xs font-semibold text-[#0f6e7a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f6e7a] dark:text-[#5fd0dc] [&::-webkit-details-marker]:hidden">
          Details{problems ? ` · ${problems} ${problems === 1 ? "problem" : "problems"}` : ""}{unknowns ? ` · ${unknowns} not checked` : ""}
          <ChevronDown aria-hidden className="h-3.5 w-3.5 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
        </summary>
        <div className="mt-2 border-t border-gray-100 pt-2 dark:border-white/10">
          <CheckList checks={p.checks} sources={p.sources} />
        </div>
      </details>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {stale ? (
          <button type="button" onClick={onUpdate} disabled={busy}
            className="inline-flex min-h-9 items-center rounded-lg border border-gray-300 px-3 text-xs font-semibold text-gray-800 transition hover:bg-gray-50 disabled:opacity-50 dark:border-white/20 dark:text-gray-100 dark:hover:bg-white/5">
            Update suggestion
          </button>
        ) : (
          <button type="button" onClick={onApply} disabled={busy || p.ops.length === 0}
            className="inline-flex min-h-9 items-center rounded-lg bg-[#182B49] px-3 text-xs font-semibold text-white transition hover:bg-[#243f66] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#182B49] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#FFCD00] dark:text-[#182B49] dark:hover:bg-[#FFD740] dark:focus-visible:outline-[#FFCD00]">
            {p.ops.length === 0 ? "Nothing to change" : changes ? "Apply changes" : "Choose this option"}
          </button>
        )}
        {!stale && (
          <button type="button" onClick={onPreview} aria-pressed={previewing}
            className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-white/10">
            <Eye aria-hidden className="h-3.5 w-3.5" />
            {previewing ? "Shown in plan" : "Show in plan"}
          </button>
        )}
      </div>
    </article>
  );
}
