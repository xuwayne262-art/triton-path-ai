import type { SectionTuple } from "@/lib/plat";
import { CANCELLED, ENROLLED, LIMIT, SECTION_ID, CODE, TYPE, WAITLIST, isOneOff } from "@/lib/sections";

/**
 * One course's seats at one moment, the way a student thinks of them: how
 * many are in it, how many it holds, how many are waiting.
 *
 * A lecture's count already includes everyone in its discussions — Class
 * Planner reports CSE 11's lecture A00 as 428 enrolled and its three
 * discussions as 143, 141 and 144 — so adding every section together would
 * count each student twice. Lectures are what is summed when a course has
 * them; a course with none (a lab, a seminar) sums what it does have.
 */
export interface SeatCount {
  enrolled: number;
  capacity: number;
  waitlist: number;
}

interface Part {
  lecture: boolean;
  enrolled: number | null | undefined;
  capacity: number | null | undefined;
  waitlist: number | null | undefined;
}

function tally(parts: Part[]): SeatCount | null {
  const counted = parts.some((p) => p.lecture) ? parts.filter((p) => p.lecture) : parts;
  const known = counted.filter((p) => typeof p.capacity === "number" && p.capacity > 0);
  if (!known.length) return null;
  return known.reduce<SeatCount>(
    (sum, p) => ({
      enrolled: sum.enrolled + Math.max(0, p.enrolled ?? 0),
      capacity: sum.capacity + Math.max(0, p.capacity ?? 0),
      waitlist: sum.waitlist + Math.max(0, p.waitlist ?? 0),
    }),
    { enrolled: 0, capacity: 0, waitlist: 0 },
  );
}

/** The fields of a Class Planner section this reads. */
export interface PlannerSection {
  section_id?: string | null;
  instruction_type_name?: string | null;
  capacity?: number | null;
  enrolled?: number | null;
  waitlist_enrolled?: number | null;
  status?: string | null;
}

/** Seats from Class Planner's own section list. Cancelled sections are not seats. */
export function tallyPlannerSections(sections: PlannerSection[]): SeatCount | null {
  const seen = new Set<string>();
  const parts: Part[] = [];
  for (const s of sections) {
    if (/cancel/i.test(String(s.status ?? ""))) continue;
    const id = s.section_id ?? "";
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    parts.push({
      lecture: s.instruction_type_name === "lecture",
      enrolled: s.enrolled,
      capacity: s.capacity,
      waitlist: s.waitlist_enrolled,
    });
  }
  return tally(parts);
}

/** One row per section that can hold seats: no finals, nothing cancelled, each section once. */
function seatRows(sec: SectionTuple[]): SectionTuple[] {
  const seen = new Set<string>();
  const out: SectionTuple[] = [];
  for (const s of sec) {
    if (isOneOff(s) || s[CANCELLED] === 1) continue;
    const id = s[SECTION_ID] || `${s[CODE]}|${s[TYPE]}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(s);
  }
  return out;
}

/**
 * Seats from the dataset's section rows. A section meeting in two weekly
 * patterns arrives as two rows carrying the same numbers, so each is counted
 * once; finals and midterms are not sections anyone enrols in.
 */
export function tallySectionRows(sec: SectionTuple[]): SeatCount | null {
  return tally(seatRows(sec).map((s) => ({
    lecture: s[TYPE] === "LE",
    enrolled: s[ENROLLED],
    capacity: s[LIMIT],
    waitlist: s[WAITLIST],
  })));
}

/**
 * The rows tallySectionRows adds up — the lectures when a course has them,
 * every section otherwise, each with a published capacity — so the total can
 * be dated by exactly the counts it is made of.
 */
export function talliedRows(sec: SectionTuple[]): SectionTuple[] {
  const rows = seatRows(sec);
  const counted = rows.some((s) => s[TYPE] === "LE") ? rows.filter((s) => s[TYPE] === "LE") : rows;
  return counted.filter((s) => typeof s[LIMIT] === "number" && (s[LIMIT] as number) > 0);
}
