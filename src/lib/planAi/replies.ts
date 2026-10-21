import type { PatchProblem } from "@/lib/plan/patch";
import type { SyncStatus } from "@/lib/plan/sync";
import type { FindResult, OptionsResult } from "./engine";
import { list, minutes } from "./explain";
import type { MoveConsequences } from "./consequences";
import { targetWords, unitsLabel, type Settings } from "./conversation";
import { shortClock } from "./vocabulary";
import type { PlanTarget } from "./types";
import { SENSITIVE_LABEL, type SensitiveReason } from "./privacy";

/**
 * What Plan with AI says, from templates: one to three short sentences
 * before the cards that carry the substance. Plain words, no dashes, and a
 * next step whenever the answer is "nothing fits".
 */

const DAY_NAMES: Record<string, string> = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday" };
const slotWords = (s: { year: number; quarter: string }) => `Year ${s.year} ${s.quarter}`;

/** The constraints in force, as a clause: " with nothing before 10 AM, with no prerequisites". */
export function constraintClause(s: Settings): string {
  const parts: string[] = [];
  if (s.earliestStart != null) parts.push(`with nothing before ${shortClock(s.earliestStart)}`);
  if (s.latestEnd != null) parts.push(`done by ${shortClock(s.latestEnd)}`);
  if (s.avoidDays.length) parts.push(`with ${dayWords(s.avoidDays)} free`);
  if (s.noPrerequisites) parts.push("with no prerequisites");
  if (s.prereqsMet) parts.push("that your record shows you can take");
  if (s.openSeats) parts.push("with open seats");
  return parts.length ? ` ${parts.join(", ")}` : "";
}

export function findReply(r: FindResult, what: string, s: Settings, target: PlanTarget): string {
  const where = targetWords(target);
  if (r.cards.length) {
    const fits = target.kind === "term" ? ` that fit your ${where} week` : ` for ${where}`;
    return `${r.cards.length === 1 ? "One" : `${r.cards.length}`} ${what} ${r.cards.length === 1 ? "course" : "courses"}${fits}${constraintClause(s)}.`;
  }
  if (!r.considered) return `I found no ${what} courses${constraintClause(s)} on ${target.kind === "term" ? `the ${where} schedule` : "UCSD's catalog"}.`;
  return `None of the ${r.considered} ${what} ${r.considered === 1 ? "course" : "courses"} I checked fit your ${where} week${constraintClause(s)}.`;
}

/** Why a candidate did not fit, for the misses under a "nothing fits" answer. */
export function missText(m: FindResult["misses"][number]): string {
  if (!m.why) return `${m.code} didn't fit.`;
  switch (m.why.kind) {
    case "clash": return `${m.code} clashes with ${list(m.why.with)}${m.why.finals ? ", including a final" : ""}.`;
    case "constraint": return `${m.code} has no section within your times or days.`;
    case "no-sections": return `${m.code} has no sections published.`;
  }
}

export function optionsReply(r: OptionsResult, s: Settings, target: PlanTarget, mode: "build" | "improve"): string {
  const where = targetWords(target);
  if (r.proposals.length) {
    const draft = r.proposals[0];
    const lead = mode === "build"
      ? `Here's a ${draft.after.units}-unit ${where} draft${constraintClause(s)}.`
      : draft.ops.length
        ? `Here's how your ${where} week could change${constraintClause(s)}.`
        : `Your ${where} week already fits what you asked for.`;
    const more = r.proposals.length === 1
      ? r.considered > 0 && mode === "build" ? " It's the only combination that fits." : ""
      : ` ${r.proposals.length === 2 ? "One alternative" : "Two alternatives"} below ${r.proposals.length === 2 ? "trades" : "trade"} something off.`;
    return `${lead}${more}`;
  }
  const units = mode === "build" ? ` in ${unitsLabel(s.units)}` : "";
  if (r.outcome.exhaustive) return `No combination fits${units}${constraintClause(s)}. I checked every one.`;
  return `I couldn't find a combination${units}${constraintClause(s)} before stopping, after checking ${r.outcome.explored.toLocaleString()}.`;
}

/** Why a change could not be saved as it stood. */
export function problemText(p: PatchProblem, termName: string): string {
  const term = termName || "this term";
  switch (p.code) {
    case "UNKNOWN_COURSE": return `${p.course} isn't in UCSD's catalog.`;
    case "NOT_OFFERED": return `${p.course} isn't on the ${term} schedule.`;
    case "TERM_CHANGED": return `The schedule moved on to a new term, so ${p.course} can't be placed with its old sections.`;
    case "ALREADY_SCHEDULED": return `${p.course} is already on ${term}.`;
    case "NOT_SCHEDULED": return `${p.course} isn't on ${term} any more.`;
    case "SECTIONS_CHANGED": return `${p.course}'s sections were changed after this suggestion.`;
    case "INVALID_SECTIONS": return `${p.course}'s sections no longer match the schedule.`;
    case "SECTIONS_UNKNOWN": return `${p.course}'s sections couldn't be checked.`;
    case "ALREADY_PLANNED": return `${p.course} is already in your 4-year plan.`;
    case "NOT_PLANNED": return `${p.course} isn't in that quarter of your plan any more.`;
    case "SCHEDULE_FULL": return `${term} has as many courses as the planner holds.`;
    case "PLAN_FULL": return "Your 4-year plan has as many courses as the planner holds.";
  }
}

/** Why a change could not reach the account, by the sync's status. */
export function syncProblem(status: SyncStatus): string {
  switch (status) {
    case "offline": return "Your plan can't reach your account right now, so nothing was saved. Check your connection and try again.";
    case "signed-out": return "You've been signed out, so nothing was saved. Sign in again and retry.";
    case "unavailable": return "Saving plans to your account isn't set up on this deployment, so nothing was saved.";
    case "error": return "Your plan couldn't be saved to your account just now. Nothing changed.";
    default: return "Your plan isn't in step with your account yet. Try again in a moment.";
  }
}

export function sensitiveReply(reasons: SensitiveReason[]): string {
  const what = list([...new Set(reasons.map((r) => SENSITIVE_LABEL[r]))]);
  return `I didn't send that to the AI service because it looks like it includes ${what}. Your saved Academic History is already used here without leaving UCSDPlans. Try asking without personal details.`;
}

/** The answer to "what changes if I move…". */
export function moveReply(m: MoveConsequences): string {
  const where = slotWords(m.to);
  const parts: string[] = [];
  for (const d of m.dependents) {
    parts.push(`${d.code} in ${slotWords(d.slot)} ${d.required ? "needs" : "lists"} ${m.code} as a prerequisite, so it would no longer come first.`);
  }
  for (const p of m.prerequisitesAfter) parts.push(`${m.code} lists ${p.code}, which your plan puts in ${slotWords(p.slot)}.`);
  const offered = m.pastTerms.length
    ? `It was taught in ${list(m.pastTerms.slice(0, 2).map(termWords))}. The ${m.to.quarter} schedule isn't published yet.`
    : `The grade archive shows no ${m.to.quarter} offering, and the schedule isn't published yet.`;
  if (!parts.length) return `Moving ${m.code} to ${where} keeps your plan's known prerequisites in order. ${offered}`;
  return `${parts.join(" ")} ${offered}`;
}

function termWords(t: string): string {
  const seasons: Record<string, string> = { FA: "Fall", WI: "Winter", SP: "Spring" };
  return seasons[t.slice(0, 2)] ? `${seasons[t.slice(0, 2)]} 20${t.slice(2)}` : t;
}

/** "Mon, Wed" as words. */
export const dayWords = (days: string[]) => list(days.map((d) => DAY_NAMES[d] ?? d));

export const gapWords = minutes;
