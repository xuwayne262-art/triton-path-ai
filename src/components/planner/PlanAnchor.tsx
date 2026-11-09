"use client";

import { useId, useState } from "react";
import { Loader2 } from "lucide-react";
import { currentAcademicYear, planStartFor, planYearNow } from "@/lib/history/planLayer";
import type { PlanYear } from "@/lib/plan/record";

const YEAR_LABELS: Record<number, string> = {
  1: "Year 1 (Freshman)", 2: "Year 2 (Sophomore)", 3: "Year 3 (Junior)", 4: "Year 4 (Senior)", 5: "After Year 4",
};

/**
 * Asks the one fact the 4-year plan needs to place real quarters: which plan
 * year the academic year under way is. Nothing is guessed: until the student
 * answers, the history is listed by quarter instead of placed in the grid.
 * A year the plan itself already suggests (this term's courses sit in it) is
 * offered first, still for the student to confirm.
 */
export default function PlanAnchor({
  planStart, suggested, today, onSave, darkMode,
}: {
  planStart: number | null;
  /** The year the plan puts this term in, when its courses are placed there. */
  suggested: PlanYear | null;
  today: string;
  onSave: (planStart: number) => Promise<string | null>;
  darkMode: boolean;
}) {
  const id = useId();
  const ay = currentAcademicYear(today);
  const label = `${ay}–${String(ay + 1).slice(2)}`;
  const now = planStart == null ? null : planYearNow(planStart, today);
  const [editing, setEditing] = useState(planStart == null);
  const [choice, setChoice] = useState<string>(now ? String(Math.min(now, 5)) : suggested ? String(suggested) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function save() {
    const year = Number(choice);
    if (!year) return;
    setBusy(true);
    setError(null);
    const err = await onSave(planStartFor(year, ay));
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    setDone(true);
    setEditing(false);
  }

  if (!editing && planStart != null) {
    return (
      <p className={`text-xs ${darkMode ? "text-gray-300" : "text-gray-600"}`}>
        <span role="status">
          {done ? "Placed. " : ""}
          {label} is {now && now >= 1 && now <= 4 ? `Year ${now}` : now && now > 4 ? "after Year 4" : "before Year 1"} in this plan, so your
          Academic History shows in its real quarters.
        </span>{" "}
        <button
          type="button"
          onClick={() => { setEditing(true); setDone(false); }}
          className="font-semibold underline underline-offset-2 hover:no-underline"
        >
          Change
        </button>
      </p>
    );
  }

  return (
    <section
      aria-labelledby={`${id}-title`}
      className={`rounded-xl border p-4 ${darkMode ? "border-gray-700 bg-gray-800" : "border-gray-200 bg-white"}`}
    >
      <h2 id={`${id}-title`} className={`text-sm font-semibold ${darkMode ? "text-white" : "text-gray-900"}`}>
        Place your Academic History in this plan
      </h2>
      <p className={`mt-1 text-xs leading-relaxed ${darkMode ? "text-gray-300" : "text-gray-600"}`}>
        The plan&rsquo;s years have no dates. Say which year {label} is, and each course you&rsquo;ve taken shows in the
        quarter you took it. Until then they&rsquo;re listed by quarter below.
      </p>
      <form
        className="mt-3 flex flex-wrap items-center gap-2"
        onSubmit={(e) => { e.preventDefault(); void save(); }}
      >
        <label htmlFor={`${id}-year`} className={`text-sm ${darkMode ? "text-gray-200" : "text-gray-700"}`}>
          {label} is
        </label>
        <select
          id={`${id}-year`}
          value={choice}
          onChange={(e) => setChoice(e.target.value)}
          className={`rounded-lg border px-3 py-1.5 text-sm ${darkMode ? "border-gray-600 bg-gray-700 text-white" : "border-gray-200 bg-white"}`}
        >
          <option value="">Choose a year</option>
          {[1, 2, 3, 4, 5].map((y) => (
            <option key={y} value={y}>
              {YEAR_LABELS[y]}{suggested === y && !now ? " (where your plan has this term)" : ""}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={!choice || busy}
          className="inline-flex items-center gap-2 rounded-lg bg-[#182B49] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-[#FFCD00] dark:text-[#182B49]"
        >
          {busy && <Loader2 aria-hidden className="h-4 w-4 animate-spin" />}
          Place my courses
        </button>
        {planStart != null && (
          <button
            type="button"
            onClick={() => { setEditing(false); setError(null); }}
            className={`text-sm underline underline-offset-2 ${darkMode ? "text-gray-300" : "text-gray-600"}`}
          >
            Cancel
          </button>
        )}
      </form>
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-700 dark:text-red-300">{error}</p>
      )}
    </section>
  );
}
