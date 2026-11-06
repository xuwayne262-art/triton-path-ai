import { MAX_PAST_TERMS, TERM_CODE, type PastTerm, type PlannerDoc } from "./record";

/**
 * Which term a plan's "This term" picks belong to, and what happens to them
 * when the site moves on to the next term's schedule.
 *
 * The planner keeps one schedule and its section picks ("CSE 12: A01"). The
 * dataset serves one term, and moves to the next as soon as UCSD publishes
 * its listings. A section code names a different section in every term —
 * Winter's A01 is not Fall's — so picks made against one term's schedule are
 * put away under that term, never read against the next one's.
 */

/**
 * Every plan saved before plans recorded their term was built against Fall
 * 2026's schedule: the only one the site served until then.
 */
export const LEGACY_TERM = "FA26";

/** The term a plan's schedule belongs to. */
export const termOf = (p: PlannerDoc): string => p.term || LEGACY_TERM;

/** Within a year: Winter, Spring, the summer sessions, then Fall. */
const SEASONS = ["WI", "SP", "S1", "S2", "S3", "SA", "SU", "FA"];

/** A number that sorts term codes in calendar order; -1 for anything that is not one. */
export function termRank(code: string): number {
  if (!TERM_CODE.test(code)) return -1;
  return Number(code.slice(2)) * 10 + Math.max(0, SEASONS.indexOf(code.slice(0, 2)));
}

/** The later of two terms. */
export const laterTerm = (a: string, b: string): string => (termRank(b) > termRank(a) ? b : a);

const SEASON_NAMES: Record<string, string> = {
  WI: "Winter", SP: "Spring", FA: "Fall", SU: "Summer", SA: "Summer",
  S1: "Summer Session I", S2: "Summer Session II", S3: "Summer Session III",
};

/** "WI27" -> "Winter 2027", for a term the dataset no longer names itself. */
export function termLabel(code: string): string {
  const season = TERM_CODE.test(code) ? SEASON_NAMES[code.slice(0, 2)] : undefined;
  return season ? `${season} 20${code.slice(2)}` : code;
}

/** Whether a term's picks hold anything. */
const hasPicks = (t: PastTerm) => t.schedule.length > 0 || Object.keys(t.sections).length > 0;

/** One term's picks from a plan, wherever they are kept; empty when it has none. */
export function picksFor(p: PlannerDoc, term: string): PastTerm {
  if (termOf(p) === term) return { schedule: p.schedule, sections: p.sections };
  return p.past?.[term] ?? { schedule: [], sections: {} };
}

/**
 * The term a plan is stored in: the latest one it holds picks for, or its own
 * when it holds none.
 */
export function canonicalTerm(p: PlannerDoc): string {
  let best = termOf(p);
  let bestHas = hasPicks({ schedule: p.schedule, sections: p.sections });
  for (const [term, picks] of Object.entries(p.past ?? {})) {
    if (!hasPicks(picks)) continue;
    if (!bestHas || termRank(term) > termRank(best)) {
      best = term;
      bestHas = true;
    }
  }
  return best;
}

/**
 * The plan as it is saved and synced, whichever quarter a device is showing:
 * set to the latest term it holds picks for, every other term's picks under
 * `past`. Showing Fall on a laptop and Winter on a phone then saves the same
 * document from both, so neither keeps moving the plan's term back to its own,
 * and a visit to a quarter with no picks changes nothing that is stored.
 */
export const canonical = (p: PlannerDoc): PlannerDoc => inTerm(p, canonicalTerm(p));

/** At most MAX_PAST_TERMS, keeping the latest. */
function keepLatest(past: Record<string, PastTerm>): Record<string, PastTerm> {
  const terms = Object.keys(past).sort((a, b) => termRank(b) - termRank(a)).slice(0, MAX_PAST_TERMS);
  return Object.fromEntries(terms.map((t) => [t, past[t]]));
}

/**
 * The plan, set to `term`. When its picks were made for another term they are
 * put away under that term, and any picks already kept for `term` — a term
 * the site moved back to — come back. Everything else, the four-year plan
 * included, is left as it was.
 */
export function inTerm(p: PlannerDoc, term: string): PlannerDoc {
  if (!TERM_CODE.test(term)) return p;
  const from = termOf(p);
  if (from === term) return p.term === term ? p : { ...p, term };

  const past: Record<string, PastTerm> = { ...p.past };
  if (p.schedule.length || Object.keys(p.sections).length) {
    past[from] = { schedule: p.schedule, sections: p.sections };
  }
  const back = past[term];
  delete past[term];

  const out: PlannerDoc = { ...p, term, schedule: back?.schedule ?? [], sections: back?.sections ?? {} };
  const kept = keepLatest(past);
  // Left off when empty, as cleanPlanner leaves it off.
  if (Object.keys(kept).length) out.past = kept;
  else delete out.past;
  return out;
}

/** A quarter the site serves, as far as a commute cares: whether its schedule lists rooms. */
export interface RoomsQuarter {
  code: string;
  name: string;
  rooms: boolean;
}

/**
 * The quarter a commute is measured to: the newest whose schedule lists rooms
 * and holds the student's courses, else the newest with rooms. `passedOver`
 * names a later quarter with courses but no rooms, so a page can say why its
 * classes were not used.
 */
export function commuteTerm(p: PlannerDoc | null, quarters: RoomsQuarter[]): { term: string | null; passedOver: string | null } {
  const newestFirst = [...quarters].sort((a, b) => termRank(b.code) - termRank(a.code));
  const has = (code: string) => !!p && picksFor(p, code).schedule.length > 0;
  const withRooms = newestFirst.filter((q) => q.rooms);
  const chosen = withRooms.find((q) => has(q.code)) ?? withRooms[0] ?? null;
  const passed = newestFirst.find((q) => !q.rooms && has(q.code) && (!chosen || termRank(q.code) > termRank(chosen.code)));
  return { term: chosen?.code ?? null, passedOver: passed?.name ?? null };
}
