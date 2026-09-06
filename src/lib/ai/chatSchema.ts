/**
 * Runtime schema for `POST /api/chat`.
 *
 * A TypeScript annotation on `await req.json()` is a compile-time fiction —
 * every field here is checked at runtime, and anything that fails is rejected
 * before a single token is bought.
 *
 * Everything this module returns is a freshly built value made only of
 * primitives we have inspected. Nothing from the caller's object graph is
 * forwarded to the model by reference, so unknown or nested fields cannot ride
 * along into the prompt.
 */

/** The eight UCSD colleges, plus the value the client sends when none is set. */
export const COLLEGES = [
  "Revelle",
  "Muir",
  "Marshall",
  "Warren",
  "ERC",
  "Sixth",
  "Seventh",
  "Eighth",
  "Undeclared",
] as const;

export type CollegeValue = (typeof COLLEGES)[number];

/**
 * Message length is counted in JavaScript UTF-16 code units — the value of
 * `trimmed.length` — measured *after* trimming leading and trailing
 * whitespace. Astral characters (most emoji) therefore count as 2. This is the
 * same number a browser `maxLength` attribute enforces, so client and server
 * agree without extra work.
 */
export const MAX_MESSAGE_CHARS = 4000;

/**
 * Plan limits. The planner grid is 4 years x 3 quarters = 12 terms; a heavy
 * 5-course term in every one of them is 60 entries, so 64 accepts any
 * legitimate plan with headroom while keeping the serialized plan bounded.
 */
export const MAX_PLAN_COURSES = 64;
/** "MATH 20A", "CSE 100R" — real UCSD codes top out near 10 characters. */
export const MAX_CODE_CHARS = 24;
/** Longest UCSD course titles run just over 100 characters. */
export const MAX_TITLE_CHARS = 160;
/** No real course is worth more; also rejects Infinity, NaN and negatives. */
export const MAX_UNITS = 20;

export const QUARTERS = ["Fall", "Winter", "Spring"] as const;
export type PlanQuarter = (typeof QUARTERS)[number];

/**
 * The only plan fields the advisor needs. Flat and scalar by construction —
 * there is no nesting for a caller to exploit.
 */
export interface PlanEntry {
  code: string;
  title: string;
  units: number;
  year: 1 | 2 | 3 | 4;
  quarter: PlanQuarter;
}

export interface ValidatedChatRequest {
  studentMessage: string;
  selectedCollege: CollegeValue;
  plan: PlanEntry[];
}

export type ValidationFailure = { ok: false; code: string; error: string };
export type ValidationResult =
  | { ok: true; value: ValidatedChatRequest }
  | ValidationFailure;

function fail(code: string, error: string): ValidationFailure {
  return { ok: false, code, error };
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function firstString(...candidates: unknown[]): string | null {
  for (const c of candidates) if (typeof c === "string") return c;
  return null;
}

/** 1-4, accepting the planner's number as well as a "Year 2" style string. */
function toYear(raw: unknown): 1 | 2 | 3 | 4 | null {
  let n: number | null = null;
  if (typeof raw === "number") n = raw;
  else if (typeof raw === "string") {
    const digits = raw.replace(/\D/g, "");
    if (digits !== "") n = Number(digits);
  }
  if (n === 1 || n === 2 || n === 3 || n === 4) return n;
  return null;
}

function toQuarter(raw: unknown): PlanQuarter | null {
  if (typeof raw !== "string") return null;
  const found = QUARTERS.find((q) => q.toLowerCase() === raw.trim().toLowerCase());
  return found ?? null;
}

/**
 * Normalises one planner entry.
 *
 * Accepts the planner's own `PlannedCourse` (`{ course, year, quarter }`) and
 * the flatter `{ id, name, units, year, term }` shape the plan generator
 * produces. Anything else is rejected rather than coerced.
 */
function toPlanEntry(raw: unknown, index: number): PlanEntry | ValidationFailure {
  if (!isPlainObject(raw)) {
    return fail("INVALID_PLAN", `currentPlan entry ${index} must be an object.`);
  }

  const nested = isPlainObject(raw.course) ? raw.course : null;

  const code = firstString(nested?.code, nested?.id, raw.code, raw.id, raw.courseId);
  if (code === null) {
    return fail("INVALID_PLAN", `currentPlan entry ${index} is missing a course code.`);
  }
  const trimmedCode = code.trim();
  if (trimmedCode === "" || trimmedCode.length > MAX_CODE_CHARS) {
    return fail(
      "INVALID_PLAN",
      `currentPlan entry ${index} has an empty or over-long course code.`,
    );
  }

  const title = firstString(nested?.title, nested?.name, raw.title, raw.name) ?? "";
  if (title.length > MAX_TITLE_CHARS) {
    return fail(
      "INVALID_PLAN",
      `currentPlan entry ${index} has a title longer than ${MAX_TITLE_CHARS} characters.`,
    );
  }

  const rawUnits = nested?.units ?? raw.units;
  let units = 0;
  if (rawUnits !== undefined && rawUnits !== null) {
    if (typeof rawUnits !== "number" || !Number.isFinite(rawUnits)) {
      return fail("INVALID_PLAN", `currentPlan entry ${index} has non-numeric units.`);
    }
    if (rawUnits < 0 || rawUnits > MAX_UNITS) {
      return fail(
        "INVALID_PLAN",
        `currentPlan entry ${index} has units outside 0-${MAX_UNITS}.`,
      );
    }
    units = rawUnits;
  }

  const year = toYear(raw.year);
  if (year === null) {
    return fail("INVALID_PLAN", `currentPlan entry ${index} has an invalid year.`);
  }

  const quarter = toQuarter(raw.quarter ?? raw.term);
  if (quarter === null) {
    return fail("INVALID_PLAN", `currentPlan entry ${index} has an invalid quarter.`);
  }

  return { code: trimmedCode, title: title.trim(), units, year, quarter };
}

/** Accepts undefined, null, `{}`, `{ plannedCourses: [...] }` and a bare array. */
function toPlan(raw: unknown): PlanEntry[] | ValidationFailure {
  if (raw === undefined || raw === null) return [];

  let list: unknown;
  if (Array.isArray(raw)) {
    list = raw;
  } else if (isPlainObject(raw)) {
    if (raw.plannedCourses === undefined || raw.plannedCourses === null) return [];
    list = raw.plannedCourses;
  } else {
    return fail("INVALID_PLAN", "currentPlan must be an object or an array.");
  }

  if (!Array.isArray(list)) {
    return fail("INVALID_PLAN", "currentPlan.plannedCourses must be an array.");
  }
  if (list.length > MAX_PLAN_COURSES) {
    return fail(
      "INVALID_PLAN",
      `currentPlan may contain at most ${MAX_PLAN_COURSES} courses.`,
    );
  }

  const entries: PlanEntry[] = [];
  for (let i = 0; i < list.length; i += 1) {
    const entry = toPlanEntry(list[i], i);
    if ("ok" in entry) return entry;
    entries.push(entry);
  }
  return entries;
}

/**
 * Validates an already-parsed JSON value against the chat request schema.
 *
 * A missing or null `selectedCollege` stays "Undeclared", matching what the
 * chat client sends today; an unrecognised college name is rejected rather
 * than silently downgraded, so a typo does not quietly change the advice.
 */
export function validateChatRequest(input: unknown): ValidationResult {
  if (!isPlainObject(input)) {
    return fail("INVALID_BODY", "Request body must be a JSON object.");
  }

  const { studentMessage, selectedCollege, currentPlan } = input;

  if (typeof studentMessage !== "string") {
    return fail("INVALID_MESSAGE", "studentMessage must be a string.");
  }
  const trimmed = studentMessage.trim();
  if (trimmed === "") {
    return fail("INVALID_MESSAGE", "studentMessage must not be empty.");
  }
  if (trimmed.length > MAX_MESSAGE_CHARS) {
    return fail(
      "INVALID_MESSAGE",
      `studentMessage must be at most ${MAX_MESSAGE_CHARS} characters.`,
    );
  }

  let college: CollegeValue = "Undeclared";
  if (selectedCollege !== undefined && selectedCollege !== null && selectedCollege !== "") {
    if (typeof selectedCollege !== "string") {
      return fail("INVALID_COLLEGE", "selectedCollege must be a string.");
    }
    const match = COLLEGES.find((c) => c === selectedCollege);
    if (!match) return fail("INVALID_COLLEGE", "selectedCollege is not a recognised college.");
    college = match;
  }

  const plan = toPlan(currentPlan);
  if ("ok" in plan) return plan;

  return {
    ok: true,
    value: { studentMessage: trimmed, selectedCollege: college, plan },
  };
}
