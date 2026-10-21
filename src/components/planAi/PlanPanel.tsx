"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, List } from "lucide-react";
import WeekCalendar from "@/components/planner/WeekCalendar";
import { usePlanner } from "@/app/planner/PlannerProvider";
import type { DayOfWeek } from "@/components/triton/types";
import { loadIndex } from "@/lib/plat";
import { seatDay } from "@/lib/freshness";
import { minutesToLabel, type CalEvent } from "@/lib/sections";
import { clockLabel } from "@/lib/planAi/vocabulary";
import { minutes, tradeoffs, verified } from "@/lib/planAi/explain";
import { targetWords, unitsLabel, type Settings } from "@/lib/planAi/conversation";
import type { Proposal } from "@/lib/planAi/types";

/**
 * The live plan beside the conversation: the same plan the Planner shows,
 * with the draft being looked at laid over it — new sections outlined,
 * courses it would remove or re-section faded — and the facts a student
 * weighs a week by. On a phone it opens as a day-by-day agenda, with the
 * existing calendar a tap away.
 */

const DAYS: DayOfWeek[] = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const DAY_NAMES: Record<DayOfWeek, string> = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday" };

function factsFromEvents(events: CalEvent[]) {
  const committed = events.filter((e) => !e.ghost);
  const days = DAYS.filter((d) => committed.some((e) => e.day === d));
  let gaps = 0;
  for (const d of days) {
    const today = committed.filter((e) => e.day === d).sort((a, b) => a.startMin - b.startMin);
    let end = today[0].endMin;
    for (const e of today.slice(1)) {
      if (e.startMin > end) gaps += e.startMin - end;
      end = Math.max(end, e.endMin);
    }
  }
  return {
    days,
    earliest: committed.length ? Math.min(...committed.map((e) => e.startMin)) : null,
    latest: committed.length ? Math.max(...committed.map((e) => e.endMin)) : null,
    gaps,
  };
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-semibold tabular-nums text-[#182B49] dark:text-white">{value}</dd>
    </div>
  );
}

export default function PlanPanel({
  settings, preview, ghosts, fading, phone,
}: {
  settings: Settings | null;
  preview: Proposal | null;
  ghosts: CalEvent[];
  fading: Set<string>;
  phone: boolean;
}) {
  const { events, darkMode, selectedCourses, plannedCourses, totalUnits, conflictCodes, termName } = usePlanner();
  const [view, setView] = useState<"calendar" | "agenda" | null>(null);
  const [seatsAsOf, setSeatsAsOf] = useState<string | null>(null);
  useEffect(() => { loadIndex().then((d) => setSeatsAsOf(d.meta.seatsAsOf ?? null)).catch(() => {}); }, []);

  const target = settings?.target ?? null;
  const isTerm = !target || target.kind === "term";
  const shown = view ?? (phone || !isTerm ? "agenda" : "calendar");
  const now = useMemo(() => factsFromEvents(events), [events]);
  const slotCourses = target?.kind === "plan" ? plannedCourses.filter((p) => p.year === target.slot.year && p.quarter === target.slot.quarter) : [];

  // What the summary describes: the previewed draft when there is one, else the plan as it is.
  const facts = preview
    ? { units: preview.after.units, days: preview.after.days, earliest: preview.after.earliest, latest: preview.after.latest, gaps: preview.after.gapMinutes, conflicts: preview.after.conflicts, unscheduled: preview.after.unscheduled }
    : isTerm
      ? { units: totalUnits, ...now, conflicts: conflictCodes.size, unscheduled: [] as string[] }
      : { units: slotCourses.reduce((n, p) => n + p.course.units, 0), days: [], earliest: null, latest: null, gaps: 0, conflicts: 0, unscheduled: slotCourses.map((p) => p.course.code) };
  const checks = preview?.checks ?? [];
  const problems = checks.filter((c) => c.status === "fail").length;
  const verifiedCount = checks.filter(verified).length;
  const notChecked = checks.length - problems - verifiedCount;
  const trade = preview ? tradeoffs(preview) : [];

  const agenda = useMemo(() => {
    const all = [...events.filter((e) => !e.ghost), ...ghosts];
    return DAYS.map((day) => ({
      day,
      items: all.filter((e) => e.day === day).sort((a, b) => a.startMin - b.startMin || a.code.localeCompare(b.code)),
    })).filter((d) => d.items.length);
  }, [events, ghosts]);
  const timeless = selectedCourses.filter((s) => !events.some((e) => e.code === s.course.code && !e.ghost)).map((s) => s.course.code);

  return (
    <section aria-labelledby="plan-panel-title" className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pb-3 pt-4">
        <div className="min-w-0">
          <h2 id="plan-panel-title" className="text-sm font-semibold text-[#182B49] dark:text-white">
            {target ? targetWords(target) : termName || "This term"}
            <span className="ml-2 text-xs font-normal text-gray-600 dark:text-gray-400">{preview ? `with ${preview.title.toLowerCase()} previewed` : "as saved"}</span>
          </h2>
        </div>
        {isTerm && (
          <div role="tablist" aria-label="Plan view" className="flex rounded-lg bg-gray-100 p-0.5 dark:bg-white/5">
            {([["calendar", "Calendar", CalendarDays], ["agenda", "Agenda", List]] as const).map(([id, label, Icon]) => (
              <button key={id} type="button" role="tab" aria-selected={shown === id} onClick={() => setView(id)}
                className={`inline-flex min-h-8 items-center gap-1 rounded-md px-2.5 text-xs font-semibold transition ${
                  shown === id ? "bg-white text-[#182B49] shadow-sm dark:bg-white/15 dark:text-white" : "text-gray-600 hover:text-gray-900 dark:text-gray-300"
                }`}>
                <Icon aria-hidden className="h-3.5 w-3.5" />{label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-gray-200 bg-white p-4 sm:grid-cols-4 dark:border-white/10 dark:bg-gray-800">
          <Fact label="Units" value={`${facts.units}${settings && (settings.units.min != null || settings.units.max != null) ? ` of ${unitsLabel(settings.units).replace(" units", "")}` : ""}`} />
          <Fact label="Days" value={facts.days.length ? `${facts.days.length} · ${facts.days.join(" ")}` : isTerm ? "None yet" : "Not published"} />
          <Fact label="First to last" value={facts.earliest != null && facts.latest != null ? `${clockLabel(facts.earliest).replace(":00", "")}–${clockLabel(facts.latest).replace(":00", "")}` : "No times"} />
          <Fact label="Clashes" value={facts.conflicts ? `${facts.conflicts}` : isTerm ? "None" : "Not checked"} />
          {(preview || facts.gaps > 0) && (
            <div className="col-span-2 text-xs text-gray-700 sm:col-span-4 dark:text-gray-300">
              {facts.gaps > 0 && <span>{minutes(facts.gaps)} of gaps between classes a week. </span>}
              {preview && checks.length > 0 && (
                <span>{verifiedCount} checked, {notChecked} not checked{problems ? `, ${problems} ${problems === 1 ? "problem" : "problems"}` : ""}. </span>
              )}
              {trade.map((t) => <span key={t}>{t}. </span>)}
            </div>
          )}
          {facts.unscheduled.length > 0 && (
            <p className="col-span-2 flex gap-1.5 text-xs text-amber-800 sm:col-span-4 dark:text-amber-200">
              <AlertTriangle aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Times not checked for {facts.unscheduled.join(", ")}{isTerm ? ": no sections chosen" : ": schedule not published"}.
            </p>
          )}
          {isTerm && seatsAsOf && (
            <p className="col-span-2 text-[11px] text-gray-600 sm:col-span-4 dark:text-gray-400">Seat counts come from UCSD&rsquo;s Class Planner, some as old as {seatDay(seatsAsOf)}. They aren&rsquo;t live.</p>
          )}
        </dl>

        <div className="mt-4">
          {isTerm && shown === "calendar" ? (
            <WeekCalendar
              events={events}
              ghosts={ghosts}
              fading={fading}
              darkMode={darkMode}
              compact={phone}
              emptyHint="Your week appears here. Ask for a draft, or add a course, and it shows up as an outline before anything is saved."
            />
          ) : isTerm ? (
            <div className="space-y-4">
              {agenda.length === 0 && <p className="text-sm text-gray-600 dark:text-gray-400">Nothing scheduled yet. Drafts appear here before anything is saved.</p>}
              {agenda.map(({ day, items }) => (
                <div key={day}>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">{DAY_NAMES[day]}</h3>
                  <ul className="mt-1.5 divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white dark:divide-white/10 dark:border-white/10 dark:bg-gray-800">
                    {items.map((e) => {
                      const draft = e.ghost === "preview";
                      const going = !draft && fading.has(e.code);
                      return (
                        <li key={e.key} className={`flex items-baseline gap-3 px-3 py-2 text-sm ${going ? "opacity-60" : ""}`}>
                          <span className="w-28 shrink-0 tabular-nums text-xs text-gray-700 dark:text-gray-300">{minutesToLabel(e.startMin)}–{minutesToLabel(e.endMin)}</span>
                          <span className="min-w-0 flex-1">
                            <span className={`font-semibold ${going ? "line-through" : ""}`}>{e.code}</span>
                            <span className="text-xs text-gray-600 dark:text-gray-400"> · {e.kindLabel} {e.sectionCode ?? ""}{e.where ? ` · ${e.where}` : ""}</span>
                          </span>
                          {draft && <span className="shrink-0 rounded-full bg-[#0f6e7a]/10 px-2 py-0.5 text-[11px] font-semibold text-[#0f6e7a] dark:bg-[#5fd0dc]/15 dark:text-[#5fd0dc]">Draft</span>}
                          {going && <span className="shrink-0 text-[11px] font-semibold text-gray-700 dark:text-gray-300">Changing</span>}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
              {timeless.length > 0 && <p className="text-xs text-gray-600 dark:text-gray-400">No times yet: {timeless.join(", ")}. Choose sections on This term.</p>}
            </div>
          ) : (
            <div>
              <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white dark:divide-white/10 dark:border-white/10 dark:bg-gray-800">
                {slotCourses.map((p) => (
                  <li key={p.courseId} className="flex justify-between gap-3 px-3 py-2 text-sm">
                    <span><span className="font-semibold">{p.course.code}</span> <span className="text-xs text-gray-600 dark:text-gray-400">{p.course.title}</span></span>
                    <span className="text-xs tabular-nums text-gray-700 dark:text-gray-300">{p.course.units} units</span>
                  </li>
                ))}
                {(preview?.adds ?? []).map((a) => (
                  <li key={`draft-${a.code}`} className="flex justify-between gap-3 px-3 py-2 text-sm">
                    <span><span className="font-semibold">{a.code}</span> <span className="text-xs text-gray-600 dark:text-gray-400">{a.title}</span></span>
                    <span className="shrink-0 rounded-full bg-[#0f6e7a]/10 px-2 py-0.5 text-[11px] font-semibold text-[#0f6e7a] dark:bg-[#5fd0dc]/15 dark:text-[#5fd0dc]">Draft · {a.units} units</span>
                  </li>
                ))}
                {!slotCourses.length && !preview?.adds.length && <li className="px-3 py-3 text-sm text-gray-600 dark:text-gray-400">Nothing planned for this quarter yet.</li>}
              </ul>
              <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">Sections for this quarter aren&rsquo;t published, so there&rsquo;s no calendar and times aren&rsquo;t checked.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
