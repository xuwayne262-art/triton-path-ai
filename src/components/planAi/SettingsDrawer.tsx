"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { DayOfWeek } from "@/components/triton/types";
import type { GEFile } from "@/lib/plat";
import { collegeName } from "@/lib/plat";
import { PREFERENCE_LABEL, defaultSettings, type Settings } from "@/lib/planAi/conversation";
import { targetOptions, type PlanContext } from "@/lib/planAi/terms";
import type { Preference, RequirementRef } from "@/lib/planAi/types";
import { DISCIPLINE_NAMES, programSubjects, programsIn } from "@/lib/planAi/warren";
import { clockLabel } from "@/lib/planAi/vocabulary";

/**
 * Every setting Plan with AI is working with, editable in one place. The
 * chips show the four that matter most; the rest live here. Changing them
 * asks nothing of the model, and the next draft uses them.
 */

const FIELD = "mt-1 h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#0f6e7a] dark:border-white/15 dark:bg-gray-900 dark:focus-visible:ring-[#5fd0dc]";
const DAYS: DayOfWeek[] = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const STARTS = [8, 9, 10, 11, 12, 13, 14].map((h) => h * 60);
const ENDS = [12, 13, 14, 15, 16, 17, 18, 19, 20, 21].map((h) => h * 60);
const PREFS: Preference[] = ["fewer_days", "fewer_gaps", "later_start", "earlier_finish"];

export type SettingsField = "target" | "units" | "time" | "goal" | null;

/** Mounted only while open, so each opening starts from the settings in force. */
export default function SettingsDrawer({
  field, settings, targets, ge, college, scheduled, onClose, onSave,
}: {
  field: SettingsField;
  settings: Settings;
  targets: PlanContext;
  ge: GEFile | null;
  college: string | null;
  scheduled: string[];
  onClose: () => void;
  onSave: (s: Settings) => void;
}) {
  const [draft, setDraft] = useState(settings);
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    opener.current = document.activeElement;
    const t = window.setTimeout(() => {
      const el = panel.current?.querySelector<HTMLElement>(`[data-field="${field ?? "target"}"]`) ?? panel.current?.querySelector<HTMLElement>("select, input, button");
      el?.focus();
    }, 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key !== "Tab" || !panel.current) return;
      // A modal keeps focus inside it: Tab past the last control wraps to the first.
      const items = [...panel.current.querySelectorAll<HTMLElement>("button, select, input, a[href]")].filter((el) => !el.hasAttribute("disabled"));
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKey);
      (opener.current as HTMLElement | null)?.focus?.();
    };
  }, [field, onClose]);

  const options = targetOptions(targets);
  const goalValue = JSON.stringify(draft.goal);
  const goalOptions: { group: string; items: { label: string; ref: RequirementRef | null }[] }[] = [
    { group: "", items: [{ label: "No requirement", ref: null }, { label: "Major courses", ref: { kind: "major" } }] },
    { group: "University requirements", items: [
      { label: "Diversity, Equity & Inclusion (DEI)", ref: { kind: "university", list: "campus:DEI" } },
      { label: "American History & Institutions (AHI)", ref: { kind: "university", list: "campus:AHI" } },
    ] },
  ];
  if (college === "warren") {
    for (const d of ["humanities", "social", "science"] as const) {
      goalOptions.push({
        group: `Warren PofC · ${DISCIPLINE_NAMES[d]}`,
        items: programsIn(d).filter((p) => programSubjects(p).length).map((p) => ({ label: p.name, ref: { kind: "warren_pofc", discipline: d, program: p.id } })),
      });
    }
  } else if (college) {
    goalOptions.push({
      group: `${collegeName(college)} GE requirements`,
      items: (ge?.areas ?? []).filter((a) => a.college === college).map((a) => ({ label: a.area, ref: { kind: "college_ge", college, area: a.key, words: null } })),
    });
  }
  // A goal set in the conversation that the menu does not list stays selectable as it is.
  const listed = goalOptions.some((g) => g.items.some((i) => JSON.stringify(i.ref) === goalValue));

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30 motion-safe:animate-in motion-safe:fade-in" onClick={onClose}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="plan-settings-title"
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-md flex-col bg-white shadow-xl dark:bg-gray-800"
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-white/10">
          <h2 id="plan-settings-title" className="text-sm font-semibold">Plan settings</h2>
          <button type="button" onClick={onClose} aria-label="Close settings" className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10"><X className="h-4 w-4" /></button>
        </div>
        <form
          className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5"
          onSubmit={(e) => { e.preventDefault(); onSave(draft); onClose(); }}
          id="plan-settings-form"
        >
          <label className="block text-xs font-semibold">Quarter
            <select data-field="target" className={FIELD} value={options.findIndex((o) => o.label === draft.target.label)}
              onChange={(e) => setDraft({ ...draft, target: options[Number(e.target.value)] })}>
              {options.map((o, i) => <option key={o.label} value={i}>{o.kind === "term" ? `${o.label} (sections)` : o.label}</option>)}
            </select>
          </label>

          <fieldset className="grid grid-cols-2 gap-3">
            <legend className="mb-1 text-xs font-semibold">Units for the quarter</legend>
            <label className="text-xs">At least
              <input data-field="units" type="number" min={0} max={30} inputMode="numeric" className={FIELD} value={draft.units.min ?? ""}
                onChange={(e) => setDraft({ ...draft, units: { ...draft.units, min: e.target.value === "" ? null : Number(e.target.value) } })} />
            </label>
            <label className="text-xs">At most
              <input type="number" min={0} max={30} inputMode="numeric" className={FIELD} value={draft.units.max ?? ""}
                onChange={(e) => setDraft({ ...draft, units: { ...draft.units, max: e.target.value === "" ? null : Number(e.target.value) } })} />
            </label>
          </fieldset>

          <fieldset className="grid grid-cols-2 gap-3">
            <legend className="mb-1 text-xs font-semibold">Times</legend>
            <label className="text-xs">Nothing before
              <select data-field="time" className={FIELD} value={draft.earliestStart ?? ""} onChange={(e) => setDraft({ ...draft, earliestStart: e.target.value === "" ? null : Number(e.target.value) })}>
                <option value="">Any time</option>
                {STARTS.map((m) => <option key={m} value={m}>{clockLabel(m)}</option>)}
              </select>
            </label>
            <label className="text-xs">Done by
              <select className={FIELD} value={draft.latestEnd ?? ""} onChange={(e) => setDraft({ ...draft, latestEnd: e.target.value === "" ? null : Number(e.target.value) })}>
                <option value="">Any time</option>
                {ENDS.map((m) => <option key={m} value={m}>{clockLabel(m)}</option>)}
              </select>
            </label>
          </fieldset>

          <fieldset>
            <legend className="text-xs font-semibold">Days with no classes</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {DAYS.map((d) => (
                <label key={d} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-gray-300 px-3 text-xs dark:border-white/15">
                  <input type="checkbox" checked={draft.avoidDays.includes(d)} onChange={(e) => setDraft({ ...draft, avoidDays: e.target.checked ? [...draft.avoidDays, d] : draft.avoidDays.filter((x) => x !== d) })} />
                  {d}
                </label>
              ))}
            </div>
          </fieldset>

          <label className="block text-xs font-semibold">Requirement goal
            <select data-field="goal" className={FIELD} value={goalValue} onChange={(e) => setDraft({ ...draft, goal: JSON.parse(e.target.value) as RequirementRef | null })}>
              {!listed && <option value={goalValue}>{goalValue === "null" ? "No requirement" : "As asked in the conversation"}</option>}
              {goalOptions.map((g) => g.group
                ? <optgroup key={g.group} label={g.group}>{g.items.map((i) => <option key={JSON.stringify(i.ref)} value={JSON.stringify(i.ref)}>{i.label}</option>)}</optgroup>
                : g.items.map((i) => <option key={JSON.stringify(i.ref)} value={JSON.stringify(i.ref)}>{i.label}</option>))}
            </select>
            <span className="mt-1 block text-[11px] font-normal text-gray-600 dark:text-gray-400">College GE lists are compiled by students. Warren programs follow Warren&rsquo;s rule; Warren Advising confirms them.</span>
          </label>

          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold">Only show courses</legend>
            {([
              ["noPrerequisites", "With no prerequisites listed by UCSD"],
              ["prereqsMet", "Whose prerequisites my Academic History shows"],
              ["openSeats", "With open seats in the last count"],
            ] as const).map(([key, label]) => (
              <label key={key} className="flex min-h-8 items-center gap-2 text-xs">
                <input type="checkbox" checked={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.checked })} />
                {label}
              </label>
            ))}
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold">Prefer</legend>
            {PREFS.map((p) => (
              <label key={p} className="flex min-h-8 items-center gap-2 text-xs">
                <input type="checkbox" checked={draft.preferences.includes(p)} onChange={(e) => setDraft({ ...draft, preferences: e.target.checked ? [...draft.preferences, p] : draft.preferences.filter((x) => x !== p) })} />
                {PREFERENCE_LABEL[p]}
              </label>
            ))}
          </fieldset>

          {scheduled.length > 0 && (
            <fieldset className="space-y-2">
              <legend className="text-xs font-semibold">Keep exactly as they are</legend>
              {scheduled.map((code) => (
                <label key={code} className="flex min-h-8 items-center gap-2 text-xs">
                  <input type="checkbox" checked={draft.keep.includes(code)} onChange={(e) => setDraft({ ...draft, keep: e.target.checked ? [...draft.keep, code] : draft.keep.filter((x) => x !== code) })} />
                  {code}
                </label>
              ))}
            </fieldset>
          )}
        </form>
        <div className="flex items-center justify-between gap-3 border-t border-gray-200 px-5 py-4 dark:border-white/10">
          <button type="button" onClick={() => setDraft({ ...defaultSettings(draft.target), target: draft.target })} className="min-h-10 text-xs font-semibold text-gray-700 underline underline-offset-2 dark:text-gray-300">Reset</button>
          <button type="submit" form="plan-settings-form" className="inline-flex min-h-10 items-center rounded-lg bg-[#182B49] px-4 text-sm font-semibold text-white hover:bg-[#243f66] dark:bg-[#FFCD00] dark:text-[#182B49]">Use these settings</button>
        </div>
      </div>
    </div>
  );
}
