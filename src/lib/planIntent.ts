/**
 * Handing a course page's section choice to the Planner — through sign-in
 * when need be — without losing it on the way.
 *
 * The intent travels in the Planner's own URL:
 *
 *   /planner?add=BILD%204&pick=B%2CLA%3AB03&n=<nonce>
 *
 * A URL survives Google's round trip as the login page's `next`, which is
 * checked to be a same-site path (lib/auth/redirects.ts), so the student
 * lands in the Planner with the choice they made rather than back on a bare
 * course page. The nonce tells a click from a link: the course page keeps it
 * in this tab's sessionStorage, so the Planner applies an intent carrying it
 * at once, and asks first about one that arrived any other way — a link
 * someone sent cannot quietly change a student's schedule.
 */

export const ADD_INTENT_KEY = "ucsdplans-add-intent";

/** How long a stored nonce stays good: long enough to sign in, not long enough to surprise. */
export const ADD_INTENT_TTL_MS = 60 * 60 * 1000;

/** The shape of every course code in the dataset ("CSE 11", "MUS 8GS"); /api/seats checks the same. */
const COURSE = /^[A-Z]{2,5} \d{1,3}[A-Z]{0,4}$/;
const PICK = /^[A-Z0-9]{1,4}(,[A-Z]{2}:[A-Z0-9-]{1,12}){0,4}$/;
const NONCE = /^[A-Za-z0-9-]{8,64}$/;

export interface AddIntent {
  /** "BILD 4" */
  code: string;
  /** "B,LA:B03" (lib/sectionChoice.ts), or null to add the course with no sections chosen. */
  pick: string | null;
  nonce: string | null;
}

/** The Planner URL that carries an intent. */
export function addIntentHref(intent: AddIntent): string {
  const q = new URLSearchParams({ add: intent.code });
  if (intent.pick) q.set("pick", intent.pick);
  if (intent.nonce) q.set("n", intent.nonce);
  return `/planner?${q.toString()}`;
}

/** The intent in a Planner URL's query, or null when there is none or it is malformed. */
export function parseAddIntent(params: { get(name: string): string | null }): AddIntent | null {
  const code = (params.get("add") ?? "").trim().toUpperCase().replace(/\s+/g, " ");
  if (!COURSE.test(code)) return null;
  const pick = params.get("pick");
  const nonce = params.get("n");
  return {
    code,
    pick: pick && PICK.test(pick) ? pick : null,
    nonce: nonce && NONCE.test(nonce) ? nonce : null,
  };
}

/** What the course page keeps in sessionStorage for the Planner to recognise. */
export function storedIntent(intent: AddIntent, now: number): string {
  return JSON.stringify({ code: intent.code, nonce: intent.nonce, at: now });
}

/**
 * Whether this tab made the intent: its nonce is the one stored here, for the
 * same course, recently enough. Anything unreadable is not a match.
 */
export function madeHere(stored: string | null, intent: AddIntent, now: number): boolean {
  if (!stored || !intent.nonce) return false;
  try {
    const s = JSON.parse(stored) as { code?: unknown; nonce?: unknown; at?: unknown };
    return s.code === intent.code
      && s.nonce === intent.nonce
      && typeof s.at === "number"
      && now - s.at >= 0
      && now - s.at <= ADD_INTENT_TTL_MS;
  } catch {
    return false;
  }
}
