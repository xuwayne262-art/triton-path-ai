/**
 * What a section choice on a course page amounts to: which final comes with
 * it, which sections it still needs, which TSS package books exactly it, and
 * how to carry it in a link.
 *
 * The rule underneath all of it is lib/sections.ts's: a final belongs to the
 * section it shares a TSS section id with — always the lecture (or whatever
 * parent heads the family) in this term's data. So a course's finals are only
 * "the course's final" when every lecture has the same one. 110 Fall 2026
 * courses give different lectures different finals (BILD 4's lecture A sits
 * its final on Mon, Dec 7 and lecture B on Thu, Dec 10), and the course page
 * used to print the first lecture's date as if it were everyone's.
 */

import { type SectionTuple } from "./plat";
import {
  CODE, DAYS, END, PACKAGE_IDS, START, TYPE,
  findFamily, isOneOff, oneOffsFor, rowsFor, sectionSeats, typeLabel,
  type LectureFamily, type SectionPart, type SectionSelection,
} from "./sections";

const isFinal = (s: SectionTuple) => s[TYPE] === "FI";
const finalKey = (s: SectionTuple) => `${s[DAYS]}|${s[START]}|${s[END]}`;

/** Every row a lecture family is made of: its lecture, then every option under it. */
const familyRows = (f: LectureFamily): SectionTuple[] => [
  ...f.lectureRows,
  ...f.parts.flatMap((p) => Object.values(p.rows).flat()),
];

/** The one-off dates — final, midterms — that come with a lecture family, whichever options are picked under it. */
export function familyExams(sec: SectionTuple[], family: LectureFamily): SectionTuple[] {
  return oneOffsFor(sec, family.lectureRows.length ? family.lectureRows : familyRows(family));
}

export type FinalOverview =
  /** The schedule lists no final for any section. Not "no final": just none listed. */
  | { kind: "none" }
  /** Every lecture sits the same final, so it is the course's. */
  | { kind: "same"; finals: SectionTuple[] }
  /** Lectures sit different finals, or some list none: it depends on the lecture chosen. */
  | { kind: "varies"; byFamily: { key: string; finals: SectionTuple[] }[] };

/** Whether a course's final can be named before a lecture is chosen. */
export function finalOverview(sec: SectionTuple[], families: LectureFamily[]): FinalOverview {
  if (!families.length) {
    const finals = dedupe(sec.filter((s) => isOneOff(s) && isFinal(s)));
    return finals.length ? { kind: "same", finals } : { kind: "none" };
  }
  const byFamily = families.map((f) => ({ key: f.key, finals: familyExams(sec, f).filter(isFinal) }));
  if (!byFamily.some((f) => f.finals.length)) return { kind: "none" };
  const signature = (finals: SectionTuple[]) => finals.map(finalKey).sort().join(";");
  const first = signature(byFamily[0].finals);
  return byFamily.every((f) => signature(f.finals) === first)
    ? { kind: "same", finals: byFamily[0].finals }
    : { kind: "varies", byFamily };
}

/** One row per date and time: a final held in two rooms is listed twice by the schedule. */
function dedupe(rows: SectionTuple[]): SectionTuple[] {
  const seen = new Set<string>();
  return rows.filter((s) => {
    const k = finalKey(s);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export interface ChosenPart {
  part: SectionPart;
  code: string;
  /** Every weekly row of the chosen section. */
  rows: SectionTuple[];
}

export interface ChoiceSummary {
  family: LectureFamily;
  chosen: ChosenPart[];
  /** Kinds still to pick, in the schedule's words: "lab", "discussion". */
  missing: string[];
  complete: boolean;
  /** The final and any midterms for exactly this choice — never another lecture's. */
  exams: SectionTuple[];
  /** Chosen sections, the lecture included, that had no open seat when last counted. */
  full: SectionTuple[];
}

/** What a selection resolves to, or null when it names no lecture of this course. */
export function summarizeChoice(
  sec: SectionTuple[],
  families: LectureFamily[],
  sel: SectionSelection | undefined,
): ChoiceSummary | null {
  const family = findFamily(families, sel?.family);
  if (!family || !sel) return null;
  const chosen: ChosenPart[] = [];
  const missing: string[] = [];
  for (const part of family.parts) {
    const code = sel.parts[part.type];
    const rows = code ? rowsFor(part, code) : [];
    if (rows.length) chosen.push({ part, code, rows });
    else missing.push(part.label.toLowerCase());
  }
  const rows = [...family.lectureRows, ...chosen.flatMap((c) => c.rows)];
  const firstOfEach = [family.lecture, ...chosen.map((c) => c.rows[0])].filter((s): s is SectionTuple => Boolean(s));
  return {
    family,
    chosen,
    missing,
    complete: missing.length === 0,
    exams: oneOffsFor(sec, rows),
    full: firstOfEach.filter((s) => sectionSeats(s).full),
  };
}

/**
 * The TSS enrolment package that is exactly this choice, or null when the
 * data cannot name a single one.
 *
 * TSS books a package — a lecture with the sections under it — and each
 * section lists the packages it belongs to. The package is the one every
 * chosen section shares. Taking a lab's own list alone used to fall back to
 * the course's default package whenever the lab belonged to more than one:
 * BILD 4's "Book A + A07" opened another lab's package.
 */
export function choicePackage(summary: ChoiceSummary): string | null {
  if (!summary.complete) return null;
  const lists = [summary.family.lecture, ...summary.chosen.map((c) => c.rows[0])]
    .filter((s): s is SectionTuple => Boolean(s))
    .map((s) => (Array.isArray(s[PACKAGE_IDS]) ? s[PACKAGE_IDS] : []))
    .filter((ids) => ids.length > 0);
  if (!lists.length) return null;
  const shared = lists.reduce((acc, ids) => acc.filter((id) => ids.includes(id)));
  return shared.length === 1 ? shared[0] : null;
}

/** The course's TSS route ends ".../<package>/<year>/<period>/?". */
const TSS_TAIL = /\/(\d+)\/(\d{4})\/(\d+)\/\?$/;

/** The course's TSS link with a package swapped in, or "" when the link is not in the shape TSS uses. */
export function packageUrl(courseTss: string | null, pkg: string): string {
  if (!courseTss || !/^\d+$/.test(pkg) || !TSS_TAIL.test(courseTss)) return "";
  return courseTss.replace(TSS_TAIL, `/${pkg}/$2/$3/?`);
}

/** "Lecture B + Lab B03": a choice in the words the page uses for it; "" when it names no lecture. */
export function choiceText(families: LectureFamily[], sel: SectionSelection): string {
  const family = findFamily(families, sel.family);
  if (!family) return "";
  const head = `${family.lecture ? typeLabel(family.lecture[TYPE]) : "Section"} ${family.key}`;
  const parts = family.parts
    .map((p) => (sel.parts[p.type] ? `${p.label} ${sel.parts[p.type]}` : null))
    .filter(Boolean);
  return [head, ...parts].join(" + ");
}

// ── In a link ───────────────────────────────────────────────────────────────
// A choice rides in the URL as `pick=B,LA:B03` — the lecture, then each
// option as type:code — so a reload, a shared link or a round trip through
// sign-in comes back to the same choice. It is read against the course's own
// sections: anything that does not name one of them is dropped, never guessed.

const FAMILY = /^[A-Z0-9]{1,4}$/;
const PART = /^([A-Z]{2}):([A-Z0-9-]{1,12})$/;

export function encodeChoice(sel: SectionSelection): string {
  const parts = Object.entries(sel.parts)
    .filter(([, code]) => code)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([type, code]) => `${type}:${code}`);
  return [sel.family, ...parts].join(",");
}

/** A `pick` value back to a selection of this course, or null when it names no lecture of it. */
export function decodeChoice(raw: string | null | undefined, families: LectureFamily[]): SectionSelection | null {
  if (!raw || raw.length > 120) return null;
  const [familyKey, ...rest] = raw.split(",").map((t) => t.trim());
  if (!FAMILY.test(familyKey ?? "")) return null;
  const family = findFamily(families, familyKey);
  if (!family) return null;
  const parts: Record<string, string> = {};
  for (const token of rest) {
    const m = PART.exec(token);
    if (!m) continue;
    const part = family.parts.find((p) => p.type === m[1]);
    if (part && part.sections.some((s) => s[CODE] === m[2])) parts[m[1]] = m[2];
  }
  return { family: family.key, parts };
}
