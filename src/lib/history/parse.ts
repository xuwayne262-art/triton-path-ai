/**
 * Reads a UC San Diego Academic History that a student has pasted in.
 *
 * WHY PASTE, AND WHY HERE
 * The record a student needs is already on screen on TritonLink. Asking them to
 * download it as a PDF, find the file, and drag it back is three steps that
 * exist only to get the text off that page — and every one of them can fail on
 * a phone. Select-all and paste skips all three, and the text that arrives is
 * the page's own, not a PDF extractor's guess at it.
 *
 * Nothing here touches the network. A student's transcript is the most
 * sensitive thing this site will ever hold, so the parse runs in their browser
 * and only the structured result is ever sent anywhere — never the raw paste,
 * which carries their name and PID.
 *
 * WHAT IT REFUSES TO DO
 * It never invents a row. A line that looks like coursework but will not parse
 * is reported as a warning, with the line, so the student can see what was
 * skipped and fix it by hand. Silently dropping a course understates their
 * progress, and silently guessing at one overstates it; both are worse than
 * saying "this line, I could not read".
 */

// ── Wire types ───────────────────────────────────────────────────────────────

export type GradeStatus = "graded" | "pass" | "fail" | "withdrawn" | "progress" | "other";

export interface HistoryCourse {
  /** "CSE 11" */
  code: string;
  subject: string;
  number: string;
  title: string;
  units: number;
  /** As printed: "A-", "P", "IP", "W". null when the term is still open. */
  grade: string | null;
  /** Grade points UCSD printed for the row, when it printed any. */
  points: number | null;
  status: GradeStatus;
}

export interface HistoryTerm {
  /** "FA25" */
  code: string;
  /** "Fall Quarter 2025", as printed. */
  label: string;
  courses: HistoryCourse[];
}

export interface TransferCourse {
  /** The UCSD course this was granted as, when one is named. */
  code: string | null;
  title: string;
  units: number;
  /** "Grossmont College", "AP", "IB". */
  from: string;
  /** "LD" / "UD", when printed. */
  level: string | null;
  /** UCSD equivalents beyond the first, for rows that list several. */
  equivalents: string[];
}

export interface ParsedHistory {
  college: string | null;
  majors: string[];
  minors: string[];
  terms: HistoryTerm[];
  transfer: TransferCourse[];
  /** Lines that looked like data and did not parse. Shown, never swallowed. */
  warnings: string[];
  /** Totals the parser computed itself — not read off the page. */
  totals: {
    courses: number;
    unitsEarned: number;
    unitsInProgress: number;
    transferUnits: number;
    gpa: number | null;
  };
}

// ── Term codes ───────────────────────────────────────────────────────────────

const SEASON: Record<string, string> = {
  fall: "FA", winter: "WI", spring: "SP",
};

/**
 * "Fall Quarter 2025" -> "FA25". Summer sessions keep their session number,
 * because Summer I and Summer II are different terms with different deadlines
 * and collapsing them to one "SU" loses a distinction the planner needs.
 */
export function termCode(label: string): string | null {
  const text = String(label || "").trim();

  const summer = /\bsum(?:mer)?\s*(?:ses(?:sion)?)?\s*(I{1,3}|[123])?\b[^0-9]*(\d{4})/i.exec(text);
  if (summer) {
    const roman: Record<string, string> = { I: "1", II: "2", III: "3", "1": "1", "2": "2", "3": "3" };
    const n = roman[(summer[1] || "I").toUpperCase()] ?? "1";
    return `S${n}${summer[2].slice(2)}`;
  }

  const main = /\b(fall|winter|spring)\b[^0-9]*(\d{4})/i.exec(text);
  if (main) return SEASON[main[1].toLowerCase()] + main[2].slice(2);

  return null;
}

/** Chronological key, so terms sort by real time rather than alphabetically. */
const SEASON_ORDER: Record<string, number> = { WI: 0, SP: 1, S1: 2, S2: 3, S3: 4, FA: 5 };
export function termOrder(code: string): number {
  const m = /^([A-Z][A-Z0-9])(\d{2})$/.exec(String(code || "").toUpperCase());
  if (!m || SEASON_ORDER[m[1]] == null) return Number.MAX_SAFE_INTEGER;
  return (2000 + Number(m[2])) * 10 + SEASON_ORDER[m[1]];
}

// ── Grades ───────────────────────────────────────────────────────────────────

const POINTS: Record<string, number> = {
  "A+": 4, A: 4, "A-": 3.7,
  "B+": 3.3, B: 3, "B-": 2.7,
  "C+": 2.3, C: 2, "C-": 1.7,
  "D+": 1.3, D: 1, "D-": 0.7,
  F: 0,
};

/** Grades that count toward GPA. P/NP, W and IP deliberately do not. */
export const isGraded = (grade: string | null): boolean =>
  grade != null && Object.prototype.hasOwnProperty.call(POINTS, grade);

export function gradeStatus(grade: string | null): GradeStatus {
  if (!grade) return "progress";
  const g = grade.toUpperCase();
  if (isGraded(g)) return g === "F" ? "fail" : "graded";
  if (g === "P" || g === "S") return "pass";
  if (g === "NP" || g === "U") return "fail";
  if (g === "W") return "withdrawn";
  if (g === "IP" || g === "I") return "progress";
  return "other";
}

/** Units a course actually contributes to a degree. */
const earnsUnits = (s: GradeStatus) => s === "graded" || s === "pass";

// ── Line shapes ──────────────────────────────────────────────────────────────

/**
 * A term header. TritonLink prints "Term: Fall Quarter 2025", but a select-all
 * copy sometimes loses the label and leaves the bare term name on its own line,
 * so both are accepted.
 */
const TERM_LINE = /^(?:term\s*:\s*)?((?:fall|winter|spring|sum(?:mer)?)[^,\n]*?\b(?:qtr|quarter|ses(?:sion)?\s*I{0,3})?\s*\d{4})\s*$/i;

/**
 * One coursework row:  SUBJ NUM  Title  Units  [Grade]  [Points]
 *
 * Units and points may carry one OR two decimals — a 7.5-unit course prints as
 * "7.5" on some records, and demanding two digits drops the whole row. Points
 * are optional because an in-progress term prints none.
 */
const COURSE_LINE =
  /^([A-Z]{2,4})\s+([0-9]{1,3}[A-Z]{0,3})\s+(.+?)\s+(\d+(?:\.\d{1,2})?)(?:\s+(A[+-]?|B[+-]?|C[+-]?|D[+-]?|F|P|NP|IP|I|W|S|U))?(?:\s+(\d+(?:\.\d{1,2})?))?\s*$/;

/**
 * A row that opens with a subject code and has numbers on the end but does not
 * match COURSE_LINE — almost certainly coursework the parser should have read.
 * Used only to decide what deserves a warning, so a footer never triggers one.
 */
const LOOKS_LIKE_COURSE = /^[A-Z]{2,4}\s+[0-9]{1,3}[A-Z]{0,3}\s+\S.*\d/;

/**
 * The transfer-credit spine: "<source> <units> [grade] <term> <LD|UD> [equiv]".
 *
 * A transfer row is recognised on this run, never on the subject token. Keying
 * it to a literal "AP" or "IB" cannot work: a community-college row starts with
 * the college's name, so it would not begin a row at all and its units would be
 * swallowed into whichever AP row came before it.
 */
const TRANSFER_SPINE =
  /^(.*?)\s*\b(\d{1,3}(?:\.\d{1,2})?)(?:\s+([A-Z]{1,2}[+-]?))?\s+((?:FA|WI|SP|SU|SS|S[123])\d{2})\s+(LD|UD)\b\s*(.*)$/;

/** "SUBJ NUM Title" — exam rows use codes like CA4 and DIPL, not just "1A". */
const TRANSFER_HEAD = /^([A-Z]{2,6})\s+([A-Z0-9]{1,6})\s+(\S.*)$/;

/** A continuation line is ONLY course codes — that is what keeps prose out. */
const TRANSFER_CONT = /^[A-Z]{2,4}\s+\d{1,3}[A-Z]{0,3}(?:[\s,]+[A-Z]{2,4}\s+\d{1,3}[A-Z]{0,3})*$/;

/**
 * Roman numerals are the one token shape indistinguishable from a subject code,
 * which is how "Calculus II 6.00" once yielded a course called "II 6". No UCSD
 * subject is a bare Roman numeral, so excluding them costs nothing.
 */
const ROMAN = /^(?:I{1,3}|IV|V|VI{1,3}|IX|X)$/;

/**
 * The colon is required, not decoration. Without it "College Board 8.00 P SP24
 * LD MATH 20A" — the source line of an AP transfer row — reads as a college
 * declaration, which both mislabels the student's college and eats the transfer
 * credit, because the row never reaches the spine test below.
 */
const PROGRAM_LINE = /^(majors?|minors?|college)\s*:\s*(.+)$/i;

/**
 * A title that contains another "SUBJ NUM ... units" run means two printed rows
 * were joined into one line, which a PDF extractor does when a column overflows.
 * The row would otherwise parse as a single course with a nonsense title and the
 * second course would vanish, so it is reported rather than accepted.
 */
const MERGED_ROWS = /\d+\.\d{2}\s+(?:[A-DF][+-]?|P|NP|IP|W|S|U)?\s*\d*\.?\d*\s*[A-Z]{2,4}\s+\d{1,3}[A-Z]{0,3}\s/;

/** Lines that are page furniture, never data. */
const NOISE =
  /^(?:academic history|unofficial|official|this is not|page \d|printed|name\s*:|pid\s*:|student id|gpa|units?\b.*:|total|cumulative|term (?:gpa|units)|transfer credit|degree|level\b|\s*$)/i;

// ── Parse ────────────────────────────────────────────────────────────────────

/** Splits "Computer Science; Mathematics" or "A and B" into separate programs. */
function splitPrograms(value: string): string[] {
  return String(value || "")
    .split(/\s*(?:;|,| and |\/|\|)\s*/i)
    .map((s) => s.replace(/\s*\((?:major|minor|pending|declared)\)\s*$/i, "").trim())
    .filter((s) => s.length > 1 && !/^n\/?a$/i.test(s));
}

const num = (s: string | undefined) => {
  const n = parseFloat(String(s ?? ""));
  return Number.isFinite(n) ? n : 0;
};

export function parseAcademicHistory(raw: string): ParsedHistory {
  const lines = String(raw || "")
    .replace(/\r\n?/g, "\n")
    // A PDF extractor pads columns with runs of spaces and non-breaking spaces;
    // collapsing them first lets one set of patterns read both sources.
    .replace(/ /g, " ")
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim());

  const out: ParsedHistory = {
    college: null, majors: [], minors: [], terms: [], transfer: [], warnings: [],
    totals: { courses: 0, unitsEarned: 0, unitsInProgress: 0, transferUnits: 0, gpa: null },
  };

  const byTerm = new Map<string, HistoryTerm>();
  let current: HistoryTerm | null = null;
  /** The transfer row being assembled, if the last head line started one. */
  let pendingHead: { code: string; title: string } | null = null;
  let lastTransfer: TransferCourse | null = null;

  for (const line of lines) {
    if (!line) continue;

    // ── programs ──
    const program = PROGRAM_LINE.exec(line);
    if (program) {
      const kind = program[1].toLowerCase();
      const values = splitPrograms(program[2]);
      if (kind.startsWith("college")) out.college = values[0] ?? out.college;
      else if (kind.startsWith("major")) out.majors.push(...values);
      else out.minors.push(...values);
      continue;
    }

    // ── term header ──
    const term = TERM_LINE.exec(line);
    if (term) {
      const code = termCode(term[1]);
      if (code) {
        current = byTerm.get(code) ?? { code, label: term[1].trim(), courses: [] };
        byTerm.set(code, current);
        pendingHead = null;
        lastTransfer = null;
        continue;
      }
    }

    // ── transfer credit ──
    // Tried before COURSE_LINE: a spine carries a term code where a course row
    // carries a grade, and only the spine ends in LD/UD.
    const spine = TRANSFER_SPINE.exec(line);
    if (spine) {
      const [, from, units, , , level, tail] = spine;
      const equivalents = tail.trim() ? [tail.trim()] : [];
      const row: TransferCourse = {
        code: pendingHead ? pendingHead.code : null,
        title: pendingHead ? pendingHead.title : from.trim(),
        units: num(units),
        from: from.trim() || (pendingHead ? "Transfer" : "Transfer"),
        level: level || null,
        equivalents,
      };
      out.transfer.push(row);
      lastTransfer = row;
      pendingHead = null;
      continue;
    }

    // Further UCSD equivalents for the row just recorded.
    if (lastTransfer && TRANSFER_CONT.test(line)) {
      lastTransfer.equivalents.push(line.trim());
      continue;
    }

    // ── coursework ──
    const course = COURSE_LINE.exec(line);
    if (course && !ROMAN.test(course[1]) && MERGED_ROWS.test(course[3])) {
      out.warnings.push(line);
      continue;
    }
    if (course && !ROMAN.test(course[1])) {
      const [, subject, number, title, units, grade, points] = course;
      const status = gradeStatus(grade ?? null);
      const record: HistoryCourse = {
        code: `${subject} ${number}`,
        subject,
        number,
        title: title.trim(),
        units: num(units),
        grade: grade ?? null,
        points: points != null ? num(points) : null,
        status,
      };
      // Coursework printed before any term header belongs to no term we can
      // name; parking it under "XFER" keeps it visible rather than lost.
      if (!current) {
        current = byTerm.get("XFER") ?? { code: "XFER", label: "Credit with no term", courses: [] };
        byTerm.set("XFER", current);
      }
      current.courses.push(record);
      lastTransfer = null;
      pendingHead = null;
      continue;
    }

    // ── a head line for the transfer row on the next line ──
    const head = TRANSFER_HEAD.exec(line);
    if (head && !ROMAN.test(head[1]) && !NOISE.test(line)) {
      pendingHead = { code: `${head[1]} ${head[2]}`, title: head[3].trim() };
      continue;
    }

    // ── anything left that looked like data ──
    if (!NOISE.test(line) && LOOKS_LIKE_COURSE.test(line)) {
      out.warnings.push(line);
    }
  }

  out.terms = [...byTerm.values()]
    .filter((t) => t.courses.length)
    .sort((a, b) => termOrder(a.code) - termOrder(b.code));

  // ── totals, computed rather than read ──
  // The page prints its own GPA, but a student who pastes a partial page would
  // carry a total that does not match the rows beneath it. Deriving it from the
  // rows we actually parsed keeps the number and the list telling one story.
  let qualityPoints = 0;
  let gpaUnits = 0;
  for (const t of out.terms) {
    for (const c of t.courses) {
      out.totals.courses++;
      if (earnsUnits(c.status)) out.totals.unitsEarned += c.units;
      if (c.status === "progress") out.totals.unitsInProgress += c.units;
      if (isGraded(c.grade)) {
        qualityPoints += (POINTS[c.grade as string] ?? 0) * c.units;
        gpaUnits += c.units;
      }
    }
  }
  for (const t of out.transfer) out.totals.transferUnits += t.units;

  out.totals.unitsEarned = round2(out.totals.unitsEarned);
  out.totals.unitsInProgress = round2(out.totals.unitsInProgress);
  out.totals.transferUnits = round2(out.totals.transferUnits);
  out.totals.gpa = gpaUnits > 0 ? round2(qualityPoints / gpaUnits) : null;

  out.majors = dedupe(out.majors);
  out.minors = dedupe(out.minors);

  return out;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const dedupe = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))];

/**
 * True when a paste produced nothing worth saving — so the UI can say "that
 * does not look like an Academic History" instead of writing an empty record
 * over one the student already had.
 */
export const isEmpty = (h: ParsedHistory): boolean =>
  h.terms.length === 0 && h.transfer.length === 0;
