/**
 * What may leave UCSDPlans for the language model, and what may not.
 *
 * Gemini's unpaid tier lets Google keep and review what it is sent, and its
 * terms forbid sending personal or confidential information. So the model
 * gets one thing: the request as typed, screened, short — plus public course
 * vocabulary the server adds. Never the plan, the Academic History, grades,
 * names, emails or ids; "my plan" and "courses I've taken" are resolved here
 * after the model has said what kind of request it is.
 *
 * A request that looks like it carries personal details is not sent at all,
 * and the student is told why. Removing a name would not make a transcript
 * anonymous, so nothing is redacted and forwarded: it is kept back whole.
 */

export const MAX_MODEL_INPUT = 400;

export type SensitiveReason =
  | "email"
  | "phone"
  | "student-id"
  | "grades"
  | "gpa"
  | "record-paste"
  | "name"
  | "link"
  | "too-long";

const CHECKS: [SensitiveReason, RegExp][] = [
  ["email", /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i],
  ["phone", /(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/],
  ["student-id", /\b[AU]\d{8}\b|\bPID\b|\bstudent\s*(?:id|number)\b|\b\d{3}-\d{2}-\d{4}\b/i],
  ["gpa", /\bgpa\b[^.?!]{0,20}\b[0-4]\.\d{1,2}\b|\b[0-4]\.\d{1,2}\s*(?:gpa|grade point)\b/i],
  ["grades", /\b(?:got|received|earned|made|had|have|getting)\s+(?:an?\s+)?[A-DF][+-]?\s+(?:in|on|for)\b|\b[A-DF][+-]?\s+in\s+[A-Z]{2,5}\s?\d|\b(?:failed|flunked|withdrew\s+from|retook|retaking|repeated|dropped\s+out)\b/i],
  // Case matters past the first word: a capitalised pair after "I'm" reads as a name.
  ["name", /\b[Mm]y\s+name\s+is\b|\b[Ii](?:'m|\s+am)\s+[A-Z][a-z]+\s+[A-Z][a-z]+\b|\b[Tt]his\s+is\s+[A-Z][a-z]+\s+[A-Z][a-z]+\b/],
  ["link", /https?:\/\/|www\./i],
];

/** Course rows with grades, the shape of a pasted record. */
const RECORD_LINE = /\b[A-Z]{2,5}\s?\d{1,3}[A-Z]{0,3}\b.*\s(?:[A-DF][+-]?|P|NP|W|IP)(?![A-Za-z0-9])\s*$/;

/** Why a request must not go to the model, or an empty list when it may. */
export function screenSensitive(text: string): SensitiveReason[] {
  const out: SensitiveReason[] = [];
  if (text.length > MAX_MODEL_INPUT) out.push("too-long");
  for (const [reason, re] of CHECKS) if (re.test(text)) out.push(reason);
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length >= 3 && lines.filter((l) => RECORD_LINE.test(l.trim())).length >= 2) out.push("record-paste");
  return out;
}

/** Everything the browser sends with a request for interpretation. Nothing else is allowed to be added. */
export interface InterpretRequest {
  text: string;
  context: {
    /** How many options are on screen, so "the second one" can be read. 0–3. */
    options: number;
    /** Whether a change is waiting for a yes or no. */
    pending: boolean;
  };
}

const ALLOWED_KEYS = ["text", "context"];
const ALLOWED_CONTEXT = ["options", "pending"];

/**
 * The request body for /api/plan-ai/interpret, or why there is none. Built
 * field by field from an allowlist: whatever else the caller holds — the
 * plan, the record, the session — has no way in.
 */
export function buildInterpretRequest(
  text: string,
  context: { options: number; pending: boolean },
): { ok: true; body: InterpretRequest } | { ok: false; reasons: SensitiveReason[] } {
  const trimmed = text.replace(/\s+/g, " ").trim();
  const reasons = screenSensitive(text);
  if (reasons.length) return { ok: false, reasons };
  return {
    ok: true,
    body: {
      text: trimmed,
      context: {
        options: Math.max(0, Math.min(3, Math.trunc(Number(context.options) || 0))),
        pending: context.pending === true,
      },
    },
  };
}

/** True when a body holds nothing outside the allowlist — the server's own check of the same boundary. */
export function onlyAllowedFields(body: unknown): boolean {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const b = body as Record<string, unknown>;
  if (!Object.keys(b).every((k) => ALLOWED_KEYS.includes(k))) return false;
  const ctx = b.context;
  if (ctx === undefined) return true;
  return Boolean(ctx) && typeof ctx === "object" && !Array.isArray(ctx)
    && Object.keys(ctx as object).every((k) => ALLOWED_CONTEXT.includes(k));
}

/** The words a student sees when a request was kept back. */
export const SENSITIVE_LABEL: Record<SensitiveReason, string> = {
  email: "an email address",
  phone: "a phone number",
  "student-id": "a student ID",
  grades: "grades",
  gpa: "a GPA",
  "record-paste": "part of an academic record",
  name: "a name",
  link: "a link",
  "too-long": "more text than a request needs",
};
