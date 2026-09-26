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
// Appended when the schedule moved to UCSD's Class Planner. Older cached files
// have no value at these positions, so every reader treats them as optional.
export const WAITLIST = 11, ENROLLED = 12, SECTION_ID = 13, PACKAGE_IDS = 14;
export const BUILDING_CODE = 17, STATUS = 18, TOPIC = 19;

/**
 * What a section of a topics course teaches — "Unsupervised Learning" for one
 * CSE 190 lecture, "How the Web Tracks You" for another — or "" for an ordinary
 * course, where every section teaches the same thing.
 */
export const sectionTopic = (s: SectionTuple): string => (typeof s[TOPIC] === "string" ? s[TOPIC] : "");

/**
 * How many people are already queued for a section, or null when this term's
 * data predates the field. Zero and "unknown" are different answers: "0
 * waitlisted" tells a student the queue is empty, and guessing that for a file
 * that never carried the number would be a claim we cannot make.
 */
export const sectionWaitlist = (s: SectionTuple): number | null =>
  typeof s[WAITLIST] === "number" ? s[WAITLIST] : null;

/**
 * The URL that opens this exact section on TSS, built from the course's module
 * and this section's enrolment package. Returns "" when either is missing —
 * TSS answers a malformed route with an error page, so no link beats a broken
 * one for a student mid-enrolment.
 */
export function sectionTssUrl(s: SectionTuple, courseTssUrl: string | null): string {
  const pkg = Array.isArray(s[PACKAGE_IDS]) ? s[PACKAGE_IDS] : [];
  if (!courseTssUrl || pkg.length !== 1) return courseTssUrl ?? "";
  // Same route, this section's package swapped in for the course default.
  return courseTssUrl.replace(/\/(\d+)\/(\d{4})\/(\d+)\/\?$/, `/${pkg[0]}/$2/$3/?`);
}

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
/** Pinned to one date: the days column holds "2026-10-19" instead of "MWF". */
export const isDated = (s: SectionTuple) => /^\d{4}-\d{2}-\d{2}$/.test(s[DAYS] ?? "");
/** A final, a midterm or any other single occasion — never a weekly slot. */
export const isOneOff = (s: SectionTuple) => isExam(s) || isDated(s);
export const isCancelled = (s: SectionTuple) => s[CANCELLED] === 1;

/** A section you can actually pick. */
export const isChoosable = (s: SectionTuple) => !isOneOff(s) && !isCancelled(s);

/**
 * Full, but still taking a waitlist. Class Planner's `waitlist_only`, which the
 * data build once misread as "cancelled" and hid — taking CSE 11 with it.
 */
export const isWaitlistOnly = (s: SectionTuple) => s[STATUS] === "waitlist_only";

/** "A00" and "A51" are both in family A. */
export const familyOf = (code: string) => (/^[A-Z]/.test(code) ? code[0] : code);

const isLecture = (s: SectionTuple) => s[TYPE] === "LE" || s[TYPE] === "SE";

/**
 * The section a family hangs off. TSS numbers it 000 — "001-000-LE" becomes
 * "A00" — whatever its type: CAT 124's families are a practicum (A00) with a
 * seminar under it (A01), so going by type alone filed the seminar as the
 * lecture and the practicum as a choice to make under it.
 */
const isParent = (s: SectionTuple) => /^[A-Z]00$/.test(s[CODE]) || /^\d+-000-/.test(s[CODE]);

// ── Formatting ───────────────────────────────────────────────────────────────

export const typeLabel = (type: string) => SECTION_TYPES[type] ?? type;

/** "Final Exam", "Midterm", or "One-time meeting" for any other dated row. */
export const oneOffLabel = (s: SectionTuple) =>
  isExam(s) ? typeLabel(s[TYPE]) : "One-time meeting";

/** The room as TSS prints it — "CENTR 214" — or "" when unpublished. */
export const sectionRoom = (s: SectionTuple) => s[ROOM] ?? "";

/**
 * The building code a section meets in, for the map: "CENTR". Rows published
 * before codes were recorded fall back to the room's own prefix, which is the
 * same code ("CENTR 214").
 */
export function sectionBuildingCode(s: SectionTuple): string {
  const code = s[BUILDING_CODE];
  if (typeof code === "string") return code;
  const m = /^([A-Z0-9][A-Z0-9-]*) /.exec(sectionRoom(s));
  return m ? m[1] : "";
}

/**
 * Where a section meets, in the form a student will find on a door: the room
 * ("CENTR 214"), else the building, else "". It used to glue both together —
 * "Center Hall CENTR 214" — saying the building twice.
 */
export const sectionWhere = (s: SectionTuple) => sectionRoom(s) || s[BUILDING] || "";

/** "TuTh · 9:30 AM – 10:50 AM" */
export function sectionWhen(s: SectionTuple): string {
  if (!s[START]) return "Time TBA";
  const days = splitDays(s[DAYS]).join("");
  const when = `${prettyTime(s[START])} – ${prettyTime(s[END])}`;
  return days ? `${days} · ${when}` : when;
}

/**
 * "1:00–1:50p", "11:00a–12:20p" — a time range narrow enough for a chip.
 * The meridiem is written once when both ends share it.
 */
export function compactRange(start: string, end: string): string {
  const parse = (t: string) => /^(\d{1,2}:\d{2})\s*([ap])$/i.exec((t ?? "").trim());
  const a = parse(start);
  const b = parse(end);
  if (!a) return "TBA";
  if (!b) return `${a[1]}${a[2].toLowerCase()}`;
  const am = a[2].toLowerCase();
  const bm = b[2].toLowerCase();
  return am === bm ? `${a[1]}–${b[1]}${bm}` : `${a[1]}${am}–${b[1]}${bm}`;
}

/** "W 1:00–1:50p" */
export function shortWhen(s: SectionTuple): string {
  if (!s[START]) return "Time TBA";
  const days = splitDays(s[DAYS]).join("");
  const when = compactRange(s[START], s[END]);
  return days ? `${days} ${when}` : when;
}

/** "Lecture A00" */
export const sectionLabel = (s: SectionTuple) => `${typeLabel(s[TYPE])} ${s[CODE]}`;

export const sectionSeats = (s: SectionTuple) => seatState(s[AVAIL], s[LIMIT]);

// ── Meetings ─────────────────────────────────────────────────────────────────

/** Every weekday slot one row occupies. Empty when the time is TBA. */
export function sectionMeetings(s: SectionTuple): Meeting[] {
  if (isDated(s)) return [];
  const startMin = timeToMinutes(s[START]);
  const endMin = timeToMinutes(s[END]);
  if (startMin == null || endMin == null || endMin <= startMin) return [];
  return splitDays(s[DAYS])
    .map((token) => DAY_FROM_TOKEN[token])
    .filter((day): day is DayOfWeek => Boolean(day))
    .map((day) => ({ day, startMin, endMin }));
}

/** Every weekly slot of a section that meets in more than one pattern. */
export const meetingsOfRows = (rows: SectionTuple[]): Meeting[] => rows.flatMap(sectionMeetings);

export const meetingsOverlap = (a: Meeting, b: Meeting) =>
  a.day === b.day && a.startMin < b.endMin && b.startMin < a.endMin;

export const clashesWith = (meetings: Meeting[], busy: Meeting[]) =>
  meetings.some((m) => busy.some((b) => meetingsOverlap(m, b)));

// ── Lecture families ─────────────────────────────────────────────────────────

export interface SectionPart {
  type: string;
  label: string;
  /** One representative row per section code, in the order published. */
  sections: SectionTuple[];
  /**
   * Every row of each code. A lab that meets Tuesday in one room and Thursday
   * in another is ONE section published as two rows; offering them as two
   * options — or drawing only the first — misstates it.
   */
  rows: Record<string, SectionTuple[]>;
}

export interface LectureFamily {
  key: string;
  /** The lecture's first row, for labels, seats and instructor. */
  lecture: SectionTuple | null;
  /** All of the lecture's weekly rows — 63 lectures this term meet in two patterns. */
  lectureRows: SectionTuple[];
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
      const lecture = rows.find(isParent) ?? rows.find(isLecture) ?? null;
      // Rows sharing the lecture's code and type are more of the lecture.
      const lectureRows = lecture
        ? rows.filter((r) => r[CODE] === lecture[CODE] && r[TYPE] === lecture[TYPE])
        : [];
      const byType = new Map<string, SectionPart>();
      for (const r of rows) {
        if (lectureRows.includes(r)) continue;
        let part = byType.get(r[TYPE]);
        if (!part) {
          part = { type: r[TYPE], label: typeLabel(r[TYPE]), sections: [], rows: {} };
          byType.set(r[TYPE], part);
        }
        if (!part.rows[r[CODE]]) {
          part.rows[r[CODE]] = [];
          part.sections.push(r);
        }
        part.rows[r[CODE]].push(r);
      }
      return { key, lecture, lectureRows, parts: [...byType.values()] };
    });
}

/** Every row behind one section code of a part, or just the row itself. */
export const rowsFor = (part: SectionPart, code: string): SectionTuple[] => part.rows[code] ?? [];

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

/** The concrete section rows a selection resolves to — every meeting pattern of each. */
export function selectedSections(
  families: LectureFamily[],
  sel: SectionSelection | undefined,
): SectionTuple[] {
  const family = findFamily(families, sel?.family);
  if (!family || !sel) return [];
  const out: SectionTuple[] = [...family.lectureRows];
  for (const part of family.parts) {
    const code = sel.parts[part.type];
    if (code) out.push(...rowsFor(part, code));
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

/**
 * Whatever is not really a choice, made for the student: the only lecture on
 * offer, and any sub-section with a single option. Returns null when the
 * course has more than one lecture — that is a decision about someone's week,
 * and guessing it would put a class on their calendar they never picked.
 */
export function forcedSelection(families: LectureFamily[]): SectionSelection | null {
  if (families.length !== 1) return null;
  const [family] = families;
  const parts: Record<string, string> = {};
  for (const p of family.parts) {
    if (p.sections.length === 1) parts[p.type] = p.sections[0][CODE];
  }
  return { family: family.key, parts };
}

/**
 * The one-off dates that come with a selection: its final, midterms and any
 * other dated meeting, matched by the TSS section id they share with the
 * lecture or sub-section they belong to.
 */
export function oneOffsFor(sec: SectionTuple[], chosen: SectionTuple[]): SectionTuple[] {
  const ids = new Set(chosen.map((s) => s[SECTION_ID]).filter(Boolean));
  if (!ids.size) return [];
  const seen = new Set<string>();
  return sec
    .filter((s) => isOneOff(s) && ids.has(s[SECTION_ID]))
    .filter((s) => {
      // A section meeting in two rooms lists its final twice; one is enough.
      const key = `${s[TYPE]}|${s[DAYS]}|${s[START]}|${s[ROOM]}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => (a[DAYS] + a[START]).localeCompare(b[DAYS] + b[START]));
}

// ── Auto-pick ────────────────────────────────────────────────────────────────

/** Prefer a lecture with room in it; a full one means a waitlist. */
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
 * Families are tried in order of how much room their lecture has. Within a
 * family each sub-section type takes the first option, in UCSD's order, that
 * clears both the existing schedule and the picks made moments earlier in the
 * same pass. Seats do not decide a discussion: enrolling in the course places
 * you in one, so an emptier discussion is no better a pick than a fuller one.
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
    const lectureMeetings = meetingsOfRows(family.lectureRows);
    if (clashesWith(lectureMeetings, busy)) continue;
    taken.push(...lectureMeetings);

    const parts: Record<string, string> = {};
    let ok = true;

    for (const part of family.parts) {
      const candidate = part.sections
        .find((s) => {
          const m = meetingsOfRows(rowsFor(part, s[CODE]));
          // A section with no published time cannot clash with anything.
          return !clashesWith(m, busy) && !clashesWith(m, taken);
        });
      if (!candidate) { ok = false; break; }
      parts[part.type] = candidate[CODE];
      taken.push(...meetingsOfRows(rowsFor(part, candidate[CODE])));
    }

    if (ok) return { family: family.key, parts };
  }

  return null;
}

// ── Calendar events ──────────────────────────────────────────────────────────

/**
 * A block that is not a commitment: "preview" while a student hovers an option,
 * "option" for a choice still open that can be made by clicking it.
 */
export type GhostKind = "preview" | "option";

export interface CalEvent {
  key: string;
  /** "CSE 11" */
  code: string;
  title: string;
  /** "A01", or null for a course placed without section detail. */
  sectionCode: string | null;
  /** TSS section id, "E 00003991" — what UCSD's walking-route service is keyed on. */
  sectionId: string;
  /** "LE" | "DI" | … */
  kind: string;
  kindLabel: string;
  day: DayOfWeek;
  startMin: number;
  endMin: number;
  /** "CENTR 214" — the room, else the building, else "". */
  where: string;
  /** Building code for the map, "" when TBA or remote. */
  buildingCode: string;
  /** "Center Hall" */
  building: string;
  instructor: string;
  role: CourseRole;
  /** Set when this block overlaps another course on the same day. */
  conflict: boolean;
  /** Present on blocks that are not (yet) on the student's schedule. */
  ghost?: GhostKind;
  /** For an "option" ghost: what clicking it chooses. */
  choice?: { family: string; part: string | null; code: string };
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

/** One calendar block per weekly meeting of one section row. */
export function eventsForRow(
  src: { code: string; title: string; role: CourseRole },
  s: SectionTuple,
  extra: Partial<Pick<CalEvent, "ghost" | "choice">> = {},
): CalEvent[] {
  return sectionMeetings(s).map((m) => ({
    key: `${extra.ghost ?? "ev"}-${src.code}-${s[CODE]}-${m.day}-${m.startMin}-${sectionRoom(s)}`,
    code: src.code,
    title: src.title,
    sectionCode: s[CODE],
    sectionId: s[SECTION_ID] ?? "",
    kind: s[TYPE],
    kindLabel: typeLabel(s[TYPE]),
    day: m.day,
    startMin: m.startMin,
    endMin: m.endMin,
    where: sectionWhere(s),
    buildingCode: sectionBuildingCode(s),
    building: s[BUILDING] ?? "",
    instructor: s[INSTRUCTOR] ?? "",
    role: src.role,
    conflict: false,
    ...extra,
  }));
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
      for (const s of src.sections) events.push(...eventsForRow(src, s));
      continue;
    }

    for (const m of src.fallback ?? []) {
      events.push({
        key: `${src.code}-${m.day}-${m.startMin}`,
        code: src.code,
        title: src.title,
        sectionCode: null,
        sectionId: "",
        kind: "LE",
        kindLabel: "Catalog time",
        day: m.day,
        startMin: m.startMin,
        endMin: m.endMin,
        where: src.fallbackWhere ?? "",
        buildingCode: "",
        building: "",
        instructor: src.fallbackInstructor ?? "",
        role: src.role,
        conflict: false,
      });
    }
  }

  markConflicts(events);
  return events;
}

/** Flags every pair of committed blocks from different courses that overlap. */
function markConflicts(events: CalEvent[]) {
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
}

/** Every meeting currently committed to, for auto-pick to plan around. */
export const busyFrom = (events: CalEvent[]): Meeting[] =>
  events
    .filter((e) => !e.ghost)
    .map((e) => ({ day: e.day, startMin: e.startMin, endMin: e.endMin }));

/**
 * The courses a set of meetings would collide with, named — "MATH 20A" — so an
 * option can say what it clashes with instead of only that it does.
 */
export function clashingCourses(meetings: Meeting[], events: CalEvent[], self: string): string[] {
  const hit = new Set<string>();
  for (const e of events) {
    if (e.ghost || e.code === self) continue;
    if (meetings.some((m) => meetingsOverlap(m, e))) hit.add(e.code);
  }
  return [...hit];
}

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
