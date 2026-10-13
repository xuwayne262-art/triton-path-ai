/**
 * How old a seat count is, and the words the site may use for it.
 *
 * Seats come from UCSD's Class Planner, which recounts each section from TSS
 * on its own clock: one dataset holds counts taken weeks apart (on Oct 12,
 * 2026 BILD 4's lecture B had been counted that afternoon and lecture A on
 * Sep 21). The dataset records each section's own count time, and each list
 * row the oldest count it sums. Three cases are kept apart because a student
 * should act on them differently:
 *
 *   - "recent": counted within SEAT_STALE_HOURS — still only a count, not live;
 *   - "old": counted longer ago than that — it has missed at least one of
 *     Class Planner's recounts and may be well out of date;
 *   - "unknown": Class Planner gave no time, which is not the same as zero
 *     open seats, and is never filled in from a sibling section.
 *
 * Nothing here dates a count by when this site read Class Planner. Re-reading
 * a count nobody redid does not make it any newer.
 */

/**
 * Class Planner recounts seats about once a day when its refresh is working,
 * and the dataset is rebuilt within hours of a recount. A count older than a
 * day has therefore missed at least one recount, which is what "old" means.
 */
export const SEAT_STALE_HOURS = 24;

const HOUR = 3_600_000;
const ZONE = "America/Los_Angeles";

export type SeatAge =
  | { kind: "recent"; at: string }
  | { kind: "old"; at: string; days: number }
  | { kind: "unknown" };

/** How old the count taken at `at` is at `now` (ms). */
export function seatAge(at: string | null | undefined, now: number): SeatAge {
  const t = at ? Date.parse(at) : Number.NaN;
  if (!at || !Number.isFinite(t)) return { kind: "unknown" };
  const hours = (now - t) / HOUR;
  if (hours < SEAT_STALE_HOURS) return { kind: "recent", at };
  return { kind: "old", at, days: Math.floor(hours / 24) };
}

/** "2026-09-21T13:01Z" -> "Sep 21", the San Diego date. */
export function seatDay(at: string): string {
  return new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: ZONE });
}

/** "2026-09-21T13:01Z" -> "Mon, Sep 21, 2026, 6:01 AM PT". */
export function seatMoment(at: string): string {
  const when = new Date(at).toLocaleString("en-US", {
    weekday: "short", month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", timeZone: ZONE,
  });
  return `${when} PT`;
}

/**
 * "under an hour ago", "12 hours ago", "22 days ago" — how long ago, for the
 * sentence below. Hours up to two days: "today" would be wrong for a count
 * taken yesterday afternoon in San Diego, which is this morning in China.
 */
function ago(at: string, now: number): string {
  const hours = Math.floor((now - Date.parse(at)) / HOUR);
  if (hours < 1) return "under an hour ago";
  if (hours < 48) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  return `${Math.floor(hours / 24)} days ago`;
}

/**
 * The whole story of one count, for a tooltip or a screen reader: when it was
 * taken, how long ago, and where the live number is.
 */
export function seatAgeSentence(age: SeatAge, now: number): string {
  if (age.kind === "unknown") {
    return "UCSD’s Class Planner did not say when it counted these seats. Check TSS for the live count.";
  }
  const when = `Counted by UCSD’s Class Planner on ${seatMoment(age.at)}, ${ago(age.at, now)}.`;
  return age.kind === "old"
    ? `${when} That is more than a day old and may be out of date — check TSS for the live count.`
    : `${when} Seats change quickly; TSS has the live count.`;
}

/**
 * The time a sum of sections' seats can carry: the oldest of their counts,
 * since the sum is only as fresh as its stalest part. When one of them has no
 * time of its own, the course's oldest count (`courseOldest`, which Class
 * Planner states across all of its sections) stands in — never a sibling's
 * newer one. Null when nothing is known. The data build dates list rows by
 * the same rule (scripts/build-plat-data.mjs, `sat`).
 */
export function sumSeatsAt(times: (string | null)[], courseOldest: string | null): string | null {
  const known = times.filter((t): t is string => Boolean(t));
  const undated = known.length < times.length;
  const pool = undated ? [...known, ...(courseOldest ? [courseOldest] : [])] : known;
  if (undated && !courseOldest) return null;
  return pool.sort((a, b) => Date.parse(a) - Date.parse(b))[0] ?? null;
}

export interface SeatSpan {
  oldest: string;
  newest: string;
}

/** The first and last of some count times, for "counted Sep 21 – Oct 12"; null when none is known. */
export function seatSpan(times: (string | null | undefined)[]): SeatSpan | null {
  const known = times
    .filter((t): t is string => Boolean(t) && Number.isFinite(Date.parse(t as string)))
    .sort((a, b) => Date.parse(a) - Date.parse(b));
  if (!known.length) return null;
  return { oldest: known[0], newest: known[known.length - 1] };
}

/** "Sep 21" or "Sep 21 – Oct 12": a span in San Diego days, one date when they share it. */
export function spanLabel(span: SeatSpan): string {
  const a = seatDay(span.oldest);
  const b = seatDay(span.newest);
  return a === b ? a : `${a} – ${b}`;
}
