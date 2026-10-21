"use client";

import { AlertTriangle, CheckCircle2, CircleHelp, XCircle } from "lucide-react";
import { BASIS_WORD, STATUS_WORD, checkText, verified } from "@/lib/planAi/explain";
import type { Check, SourceRef } from "@/lib/planAi/types";
import { dayLabel } from "@/lib/plat";

/**
 * Checks as a list: an icon, the status in words, the claim, and whose word
 * it rests on. Colour repeats the status; it never carries it alone. Only a
 * pass on UCSD's own data or the student's own record is green — a rule
 * UCSDPlans applied or a student-compiled list reads as "not verified".
 */

/** A requirement claim from a rule or a student list: neither confirmed nor a warning. */
const qualified = (c: Check) => c.code === "REQ_RULE" || c.code === "REQ_COMMUNITY_LIST";

export function StatusIcon({ check, className = "h-3.5 w-3.5" }: { check: Check; className?: string }) {
  if (check.status === "fail") return <XCircle aria-hidden className={`${className} shrink-0 text-red-700 dark:text-red-400`} />;
  if (verified(check)) return <CheckCircle2 aria-hidden className={`${className} shrink-0 text-green-700 dark:text-green-400`} />;
  if (check.status === "pass" || qualified(check)) return <CircleHelp aria-hidden className={`${className} shrink-0 text-slate-600 dark:text-slate-400`} />;
  return <AlertTriangle aria-hidden className={`${className} shrink-0 text-amber-700 dark:text-amber-300`} />;
}

/** What a check's status is called, adjusted so an unverified pass never reads as verified. */
export const statusWord = (c: Check) => ((c.status === "pass" && !verified(c)) || qualified(c) ? "Not verified" : STATUS_WORD[c.status]);

export default function CheckList({ checks, sources }: { checks: Check[]; sources?: SourceRef[] }) {
  const seen = new Set<string>();
  const unique = checks.filter((c) => {
    const key = `${c.code}|${c.course ?? ""}|${JSON.stringify(c.detail ?? {})}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return (
    <div className="space-y-2">
      <ul className="space-y-1.5">
        {unique.map((c, i) => (
          <li key={i} className="flex gap-2 text-xs leading-relaxed text-gray-700 dark:text-gray-300">
            <StatusIcon check={c} className="mt-0.5 h-3.5 w-3.5" />
            <span>
              <span className="font-semibold">{statusWord(c)}.</span> {checkText(c)}{" "}
              <span className="text-gray-600 dark:text-gray-400">({BASIS_WORD[c.basis]})</span>
            </span>
          </li>
        ))}
      </ul>
      {sources && sources.length > 0 && (
        <p className="text-[11px] leading-relaxed text-gray-600 dark:text-gray-400">
          Sources:{" "}
          {sources.map((s, i) => (
            <span key={s.id}>
              {i > 0 && "; "}
              {s.url ? <a href={s.url} target="_blank" rel="noreferrer noopener" className="underline underline-offset-2">{s.label}</a> : s.label}
              {s.asOf ? `, ${/^\d{4}-\d{2}-\d{2}$/.test(s.asOf) ? dayLabel(s.asOf, { weekday: false, year: true }) : new Date(s.asOf).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" })}` : ""}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
