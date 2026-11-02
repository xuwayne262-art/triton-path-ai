/**
 * Everything in this term's plan that needs a decision, as a list a screen
 * reader, a keyboard and a colour-blind student can all use. The calendar
 * shows clashes as red outlines on overlapping blocks; that is the only place
 * they were, and two overlapping blocks are easy to miss on a phone.
 *
 * Nothing here changes the plan. Each issue names the courses involved, so the
 * page can offer to open their sections; the student decides.
 */

import { minutesToLabel, type CalEvent } from "@/lib/sections";
import { dayLabel, timeToMinutes, type SectionTuple } from "@/lib/plat";

export type PlanIssue =
  /** Two chosen meetings of different courses overlap. */
  | { kind: "overlap"; days: string[]; from: number; to: number; a: Meeting; b: Meeting }
  /** Two exams at the same time. */
  | { kind: "exam"; date: string; a: { code: string; label: string }; b: { code: string; label: string }; window: string }
  /** A course whose lecture, or a required discussion/lab under it, is not chosen yet. */
  | { kind: "incomplete"; code: string; missing: string[]; started: boolean }
  /** A course with no published meeting time, so it is not checked against the week. */
  | { kind: "unknown"; code: string; why: "tba" | "unpublished" | "failed" };

export interface Meeting {
  code: string;
  /** "Lecture A00" */
  label: string;
}

const FULL_DAY: Record<string, string> = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" };

const ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
/** ["Tue"] -> "Tuesday"; ["Tue", "Thu"] -> "Tuesdays and Thursdays". */
function dayList(days: string[]): string {
  const names = days.map((d) => FULL_DAY[d] ?? d);
  if (names.length === 1) return names[0];
  const plural = names.map((n) => `${n}s`);
  return `${plural.slice(0, -1).join(", ")} and ${plural[plural.length - 1]}`;
}

/** One sentence per issue, the same words on screen and to a screen reader. */
export function issueText(i: PlanIssue): string {
  switch (i.kind) {
    case "overlap":
      return `${i.a.code} ${i.a.label} and ${i.b.code} ${i.b.label} overlap on ${dayList(i.days)}, ${minutesToLabel(i.from)} to ${minutesToLabel(i.to)}.`;
    case "exam":
      return `${i.a.code} ${i.a.label} and ${i.b.code} ${i.b.label} are both on ${dayLabel(i.date)}, ${i.window}.`;
    case "incomplete":
      return i.started
        ? `${i.code} still needs a ${i.missing.join(" and a ")}.`
        : `${i.code} has no lecture chosen, so its times aren't on the week or checked for clashes.`;
    case "unknown":
      return i.why === "failed"
        ? `${i.code}'s sections didn't load, so it isn't checked for clashes.`
        : i.why === "unpublished"
          ? `${i.code} has no sections on this term's schedule, so it can't be placed or checked.`
          : `${i.code} meets at a time UCSD lists as TBA, so it isn't checked for clashes.`;
  }
}

/** The courses an issue is about, for "change sections" actions. */
export const issueCourses = (i: PlanIssue): string[] =>
  i.kind === "overlap" ? [i.a.code, i.b.code] : i.kind === "exam" ? [i.a.code, i.b.code] : [i.code];

/** Overlaps between committed meetings of different courses; days with the same window are one issue. */
export function overlapIssues(events: CalEvent[]): PlanIssue[] {
  const mine = events.filter((e) => !e.ghost);
  const out = new Map<string, Extract<PlanIssue, { kind: "overlap" }>>();
  for (let x = 0; x < mine.length; x++) {
    for (let y = x + 1; y < mine.length; y++) {
      const a = mine[x];
      const b = mine[y];
      if (a.code === b.code || a.day !== b.day) continue;
      const from = Math.max(a.startMin, b.startMin);
      const to = Math.min(a.endMin, b.endMin);
      if (from >= to) continue;
      const [p, q] = a.code < b.code ? [a, b] : [b, a];
      const key = `${p.code}|${p.sectionCode}|${q.code}|${q.sectionCode}|${from}|${to}`;
      const seen = out.get(key);
      if (seen) { if (!seen.days.includes(a.day)) seen.days.push(a.day); continue; }
      out.set(key, {
        kind: "overlap", days: [a.day], from, to,
        a: { code: p.code, label: `${p.kindLabel} ${p.sectionCode ?? ""}`.trim() },
        b: { code: q.code, label: `${q.kindLabel} ${q.sectionCode ?? ""}`.trim() },
      });
    }
  }
  const first = (d: string[]) => Math.min(...d.map((x) => ORDER.indexOf(x)));
  return [...out.values()]
    .map((i) => ({ ...i, days: [...i.days].sort((x, y) => ORDER.indexOf(x) - ORDER.indexOf(y)) }))
    .sort((m, n) => first(m.days) - first(n.days) || m.from - n.from);
}

/** Exams of different courses on the same date whose times overlap. */
export function examIssues(exams: { code: string; row: SectionTuple; label: string }[]): PlanIssue[] {
  const out: PlanIssue[] = [];
  for (let x = 0; x < exams.length; x++) {
    for (let y = x + 1; y < exams.length; y++) {
      const a = exams[x];
      const b = exams[y];
      if (a.code === b.code || a.row[2] !== b.row[2]) continue;
      const as = timeToMinutes(a.row[3]), ae = timeToMinutes(a.row[4]);
      const bs = timeToMinutes(b.row[3]), be = timeToMinutes(b.row[4]);
      if (as == null || ae == null || bs == null || be == null || !(as < be && bs < ae)) continue;
      out.push({
        kind: "exam", date: a.row[2],
        a: { code: a.code, label: a.label }, b: { code: b.code, label: b.label },
        window: `${minutesToLabel(Math.max(as, bs))} to ${minutesToLabel(Math.min(ae, be))}`,
      });
    }
  }
  return out;
}
