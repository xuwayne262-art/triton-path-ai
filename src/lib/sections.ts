/**
 * Sections — the unit you actually enrol in.
 *
 * A course is an abstraction; WebReg enrols you in "CSE 11 A00 lecture plus A01
 * discussion". The catalog index carries one flattened meeting time per course,
 * which is enough to draw a rough week but cannot answer "which discussion do I
 * take?". Everything here works from the real per-section rows published in
 * /data/plat/subject/*.json.
 *
 * The one rule that shapes all of it: a discussion belongs to a particular
 * lecture. UCSD encodes that in the code — A01 belongs to lecture A00 — so
 * sections are grouped into lecture families rather than offered as a flat list.
 */

import {
  SECTION_TYPES, prettyTime, seatState, splitDays, timeToMinutes,
  type SectionTuple,
} from "./plat";
import type { CourseRole } from "./plannerBridge";
import type { DayOfWeek } from "@/components/triton/types";

// ── Tuple field names ────────────────────────────────────────────────────────
// The wire format is a positional tuple to keep the JSON small; naming the
// indices once stops every call site from re-deriving what s[7] means.

export const CODE = 0, TYPE = 1, DAYS = 2, START = 3, END = 4;
export const BUILDING = 5, ROOM = 6, INSTRUCTOR = 7;
export const AVAIL = 8, LIMIT = 9, CANCELLED = 10;

const DAY_FROM_TOKEN: Record<string, DayOfWeek> = {
  M: "Mon", Tu: "Tue", W: "Wed", Th: "Thu", F: "Fri",
};

export interface Meeting {
  day: DayOfWeek;
  startMin: number;
  endMin: number;
}

/** Exams are announcements, not something you choose between. */
export const isExam = (s: SectionTuple) => s[TYPE] === "FI" || s[TYPE] === "MI";
export const isCancelled = (s: SectionTuple) => s[CANCELLED] === 1;

/** A section you can actually pick. */
export const isChoosable = (s: SectionTuple) => !isExam(s) && !isCancelled(s);

/** "A00" and "A51" are both in family A. */
export const familyOf = (code: string) => (/^[A-Z]/.test(code) ? code[0] : code);

const isLecture = (s: SectionTuple) => s[TYPE] === "LE" || s[TYPE] === "SE";

// ── Formatting ───────────────────────────────────────────────────────────────

export const typeLabel = (type: string) => SECTION_TYPES[type] ?? type;

/** "Center Hall 214", or "" when the room is unpublished. */
export const sectionWhere = (s: SectionTuple) =>
  [s[BUILDING], s[ROOM]].filter(Boolean).join(" ");

/** "TuTh · 9:30 AM – 10:50 AM" */
export function sectionWhen(s: SectionTuple): string {
  if (!s[START]) return "Time TBA";
  const days = splitDays(s[DAYS]).join("");
  const when = `${prettyTime(s[START])} – ${prettyTime(s[END])}`;
  return days ? `${days} · ${when}` : when;
}

/** "Lecture A00" */
export const sectionLabel = (s: SectionTuple) => `${typeLabel(s[TYPE])} ${s[CODE]}`;

export const sectionSeats = (s: SectionTuple) => seatState(s[AVAIL], s[LIMIT]);

// ── Meetings ─────────────────────────────────────────────────────────────────

/** Every weekday slot one section occupies. Empty when the time is TBA. */
export function sectionMeetings(s: SectionTuple): Meeting[] {
  const startMin = timeToMinutes(s[START]);
  const endMin = timeToMinutes(s[END]);
  if (startMin == null || endMin == null || endMin <= startMin) return [];
  return splitDays(s[DAYS])
    .map((token) => DAY_FROM_TOKEN[token])
    .filter((day): day is DayOfWeek => Boolean(day))
    .map((day) => ({ day, startMin, endMin }));
}

export const meetingsOverlap = (a: Meeting, b: Meeting) =>
  a.day === b.day && a.startMin < b.endMin && b.startMin < a.endMin;

export const clashesWith = (meetings: Meeting[], busy: Meeting[]) =>
  meetings.some((m) => busy.some((b) => meetingsOverlap(m, b)));

// ── Lecture families ─────────────────────────────────────────────────────────

export interface SectionPart {
  type: string;
  label: string;
  sections: SectionTuple[];
}

export interface LectureFamily {
  key: string;
  lecture: SectionTuple | null;
  /** Enrollable sub-sections grouped by type: DI, LA, … */
  parts: SectionPart[];
}

/** Split a course's sections into one entry per lecture family. */
export function groupSections(sec: SectionTuple[]): LectureFamily[] {
  const families = new Map<string, SectionTuple[]>();
  for (const s of sec) {
    if (!isChoosable(s)) continue;
    const key = familyOf(s[CODE]);
    if (!families.has(key)) families.set(key, []);
    families.get(key)!.push(s);
  }

  return [...families.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, rows]) => {
      const lecture = rows.find(isLecture) ?? null;
      const byType = new Map<string, SectionTuple[]>();
      for (const r of rows) {
        if (r === lecture) continue;
        if (!byType.has(r[TYPE])) byType.set(r[TYPE], []);
        byType.get(r[TYPE])!.push(r);
      }
      return {
        key,
        lecture,
        parts: [...byType.entries()].map(([type, sections]) => ({
          type,
          label: typeLabel(type),
          sections,
        })),
      };
    });
}

/** "Pick one lecture, one discussion and one lab." */
export function selectionRule(families: LectureFamily[]): string | null {
  const needed = new Set<string>();
  for (const f of families) {
    if (f.lecture) needed.add(typeLabel(f.lecture[TYPE]));
    for (const p of f.parts) needed.add(p.label);
  }
  const words = [...needed].map((w) => w.toLowerCase());
  if (!words.length) return null;
  if (words.length === 1) return `Pick one ${words[0]}.`;
  const last = words.pop();
  return `Pick one ${words.join(", one ")} and one ${last}.`;
}

// ── Selection ────────────────────────────────────────────────────────────────

export interface SectionSelection {
  /** Which lecture family, e.g. "A". */
  family: string;
  /** Chosen section code per sub-section type: { DI: "A01" }. */
  parts: Record<string, string>;
}

export const emptySelection = (family: string): SectionSelection => ({ family, parts: {} });

export const findFamily = (families: LectureFamily[], key: string | undefined) =>
  families.find((f) => f.key === key) ?? null;

/** The concrete section rows a selection resolves to. */
export function selectedSections(
  families: LectureFamily[],
  sel: SectionSelection | undefined,
): SectionTuple[] {
  const family = findFamily(families, sel?.family);
  if (!family || !sel) return [];
  const out: SectionTuple[] = [];
  if (family.lecture) out.push(family.lecture);
  for (const part of family.parts) {
    const code = sel.parts[part.type];
    const hit = part.sections.find((s) => s[CODE] === code);
    if (hit) out.push(hit);
  }
  return out;
}

/** True once every sub-section type in the chosen family has a pick. */
export function isComplete(
  families: LectureFamily[],
  sel: SectionSelection | undefined,
): boolean {
  const family = findFamily(families, sel?.family);
  if (!family || !sel) return false;
  return family.parts.every((p) => Boolean(sel.parts[p.type]));
}

/** What is still missing, for the nudge under a course card. */
export function missingParts(
  families: LectureFamily[],
  sel: SectionSelection | undefined,
): string[] {
  const family = findFamily(families, sel?.family);
  if (!family || !sel) return [];
  return family.parts.filter((p) => !sel.parts[p.type]).map((p) => p.label.toLowerCase());
}

// ── Auto-pick ────────────────────────────────────────────────────────────────

/** Prefer sections with room in them; a full section is a choice you cannot make. */
function rank(s: SectionTuple): number {
  const seats = sectionSeats(s);
  if (!seats.known) return 1;          // unpublished — probably fine
  if (seats.full) return -1;           // last resort
  return seats.open;
}

/**
 * Picks a whole family that fits around what is already on the calendar —
 * the "find me sections that work" button.
 *
 * Families are tried in order of how much room their lecture has, and within a
 * family each sub-section type takes the emptiest option that clears both the
 * existing schedule and the picks made moments earlier in the same pass.
 * Returns null when nothing fits, which is a real answer: the course cannot be
 * added this term without moving something else.
 */
export function autoPick(sec: SectionTuple[], busy: Meeting[]): SectionSelection | null {
  const families = groupSections(sec);

  const ordered = [...families].sort(
    (a, b) => (b.lecture ? rank(b.lecture) : 0) - (a.lecture ? rank(a.lecture) : 0),
  );

  for (const family of ordered) {
    const taken: Meeting[] = [];
    if (family.lecture) {
      const lectureMeetings = sectionMeetings(family.lecture);
      if (clashesWith(lectureMeetings, busy)) continue;
      taken.push(...lectureMeetings);
    }

    const parts: Record<string, string> = {};
    let ok = true;

    for (const part of family.parts) {
      const candidate = [...part.sections]
        .sort((a, b) => rank(b) - rank(a))
        .find((s) => {
          const m = sectionMeetings(s);
          // A section with no published time cannot clash with anything.
          return !clashesWith(m, busy) && !clashesWith(m, taken);
        });
      if (!candidate) { ok = false; break; }
      parts[part.type] = candidate[CODE];
      taken.push(...sectionMeetings(candidate));
    }

    if (ok) return { family: family.key, parts };
  }

  return null;
}

// ── Calendar events ──────────────────────────────────────────────────────────

export interface CalEvent {
  key: string;
  /** "CSE 11" */
  code: string;
  title: string;
  /** "A01", or null for a course placed without section detail. */
  sectionCode: string | null;
  /** "LE" | "DI" | … */
  kind: string;
  kindLabel: string;
  day: DayOfWeek;
  startMin: number;
  endMin: number;
  where: string;
  instructor: string;
  role: CourseRole;
  /** Set when this block overlaps another course on the same day. */
  conflict: boolean;
}

export interface EventSource {
  code: string;
  title: string;
  role: CourseRole;
  /** Resolved section rows, when the course has them. */
  sections: SectionTuple[];
  /** Fallback meetings from the catalog index, used when sections are unknown. */
  fallback?: Meeting[];
  fallbackWhere?: string;
  fallbackInstructor?: string;
}

/**
 * Flattens what the student has chosen into blocks the calendar can draw, and
 * marks the ones that collide. Conflicts are computed here, on real meetings,
 * rather than on the course's single flattened time — two courses can share a
 * nominal slot and still not clash once you know which discussion each is.
 */
export function buildEvents(sources: EventSource[]): CalEvent[] {
  const events: CalEvent[] = [];

  for (const src of sources) {
    if (src.sections.length) {
      for (const s of src.sections) {
        for (const m of sectionMeetings(s)) {
          events.push({
            key: `${src.code}-${s[CODE]}-${m.day}-${m.startMin}`,
            code: src.code,
            title: src.title,
            sectionCode: s[CODE],
            kind: s[TYPE],
            kindLabel: typeLabel(s[TYPE]),
            day: m.day,
            startMin: m.startMin,
            endMin: m.endMin,
            where: sectionWhere(s),
            instructor: s[INSTRUCTOR] ?? "",
            role: src.role,
            conflict: false,
          });
        }
      }
      continue;
    }

    for (const m of src.fallback ?? []) {
      events.push({
        key: `${src.code}-${m.day}-${m.startMin}`,
        code: src.code,
        title: src.title,
        sectionCode: null,
        kind: "LE",
        kindLabel: "Meeting",
        day: m.day,
        startMin: m.startMin,
        endMin: m.endMin,
        where: src.fallbackWhere ?? "",
        instructor: src.fallbackInstructor ?? "",
        role: src.role,
        conflict: false,
      });
    }
  }

  for (let i = 0; i < events.length; i++) {
    for (let j = i + 1; j < events.length; j++) {
      const a = events[i];
      const b = events[j];
      // Two blocks of the same course are the same commitment shown twice, not
      // a clash the student has to resolve.
      if (a.code === b.code) continue;
      if (meetingsOverlap(a, b)) {
        a.conflict = true;
        b.conflict = true;
      }
    }
  }

  return events;
}

/** Every meeting currently committed to, for auto-pick to plan around. */
export const busyFrom = (events: CalEvent[]): Meeting[] =>
  events.map((e) => ({ day: e.day, startMin: e.startMin, endMin: e.endMin }));

// ── Day layout ───────────────────────────────────────────────────────────────

export interface PlacedEvent extends CalEvent {
  /** Which column within its overlap cluster. */
  lane: number;
  /** How many columns that cluster needs. */
  lanes: number;
}

/**
 * Packs a day's blocks into side-by-side columns.
 *
 * Absolutely-positioned blocks spanning the full column width meant a discussion
 * that overlapped a lecture simply hid underneath it — the conflict existed, was
 * flagged in the list, and was invisible in the one view meant to show it.
 */
export function layoutDay(dayEvents: CalEvent[]): PlacedEvent[] {
  const sorted = [...dayEvents].sort(
    (a, b) => a.startMin - b.startMin || a.endMin - b.endMin || a.key.localeCompare(b.key),
  );

  const placed: PlacedEvent[] = [];
  let cluster: PlacedEvent[] = [];
  let clusterEnd = -1;

  const flush = () => {
    const lanes = cluster.reduce((n, e) => Math.max(n, e.lane + 1), 0);
    for (const e of cluster) e.lanes = lanes;
    cluster = [];
  };

  for (const event of sorted) {
    // A gap means nothing after this point can overlap anything before it.
    if (event.startMin >= clusterEnd) flush();

    const laneEnds: number[] = [];
    for (const e of cluster) {
      laneEnds[e.lane] = Math.max(laneEnds[e.lane] ?? 0, e.endMin);
    }
    let lane = 0;
    while (laneEnds[lane] != null && laneEnds[lane] > event.startMin) lane++;

    const p: PlacedEvent = { ...event, lane, lanes: 1 };
    cluster.push(p);
    placed.push(p);
    clusterEnd = Math.max(clusterEnd, event.endMin);
  }
  flush();

  return placed;
}

/** The academic day the grid always shows, whatever is on it. */
export const DAY_START = 8 * 60;
export const DAY_END = 18 * 60;

/**
 * The window the grid needs to draw, in minutes past midnight.
 *
 * A fixed 8am–10pm grid spends a third of its height on hours nobody has class
 * in, but snapping tightly to the events was worse: one 11am lecture produced a
 * two-hour sliver that read as a broken calendar rather than a week. So the
 * ordinary academic day is always drawn, and the window only ever grows — for
 * an 8am lab or an evening lecture.
 */
export function dayWindow(events: CalEvent[]): { startMin: number; endMin: number } {
  let lo = DAY_START;
  let hi = DAY_END;
  for (const e of events) {
    lo = Math.min(lo, e.startMin);
    hi = Math.max(hi, e.endMin);
  }
  return {
    startMin: Math.max(0, Math.floor(lo / 60) * 60),
    endMin: Math.min(24 * 60, Math.ceil(hi / 60) * 60),
  };
}

/** 570 -> "9:30 AM" */
export function minutesToLabel(min: number): string {
  const h24 = Math.floor(min / 60);
  const m = min % 60;
  const suffix = h24 >= 12 ? "PM" : "AM";
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return m === 0 ? `${h} ${suffix}` : `${h}:${String(m).padStart(2, "0")} ${suffix}`;
}
