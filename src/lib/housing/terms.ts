/**
 * UCSD's quarters, for saying which terms a sublet actually covers.
 *
 * Student housing at UCSD turns over by the quarter, not by the month: someone
 * studying abroad for Winter needs a room from the first day of classes to the
 * end of finals, and "Jan 1 – Mar 15" quietly misses finals week. So a listing
 * is described by the quarters it covers, and a partial one says so.
 *
 * Dates are the Registrar's, from blink.ucsd.edu's Academic and Administrative
 * Calendars for 2026–2027 and 2027–2028 (checked against the pages' own HTML on
 * Oct 10, 2026; the 2026–27 page was last updated Oct 7, 2026). Summer is kept
 * as one stretch, Summer Session I's first day to Summer Session II's last
 * final, because a summer sublet is almost always taken for the whole of it.
 */

export interface Quarter {
  /** "WI27" */
  key: string;
  /** "Winter 2027" */
  name: string;
  /**
   * The quarter's own first day — the calendar's "Fall Quarter begins" — which
   * in fall and spring comes a few days before instruction does. Summer has
   * no such line, so it starts with its first class.
   */
  begins: string;
  /** First day of instruction, YYYY-MM-DD — when a student needs to be here. */
  classes: string;
  /** Last day of the quarter, finals included, YYYY-MM-DD. */
  end: string;
  /** Last day of instruction, when weekly classes stop, where the calendar is published. */
  lastClass?: string;
  /** Campus holidays during instruction: no classes meet. */
  holidays?: string[];
  /**
   * Every campus holiday inside the quarter's dates, named as the calendar
   * names it — including one before instruction begins, which `holidays`
   * leaves out because no class could meet on it anyway.
   */
  holidayNames?: Record<string, string>;
}

export const QUARTERS: Quarter[] = [
  {
    key: "FA26", name: "Fall 2026", begins: "2026-09-21", classes: "2026-09-24", end: "2026-12-12",
    lastClass: "2026-12-04", holidays: ["2026-11-11", "2026-11-26", "2026-11-27"],
    holidayNames: {
      "2026-11-11": "Veterans Day Holiday",
      "2026-11-26": "Thanksgiving Holiday",
      "2026-11-27": "Thanksgiving Holiday",
    },
  },
  {
    key: "WI27", name: "Winter 2027", begins: "2027-01-04", classes: "2027-01-04", end: "2027-03-20",
    lastClass: "2027-03-12", holidays: ["2027-01-18", "2027-02-15"],
    holidayNames: {
      "2027-01-18": "Martin Luther King, Jr. Holiday",
      "2027-02-15": "Presidents' Day Holiday",
    },
  },
  {
    key: "SP27", name: "Spring 2027", begins: "2027-03-24", classes: "2027-03-29", end: "2027-06-11",
    lastClass: "2027-06-04", holidays: ["2027-05-31"],
    holidayNames: {
      "2027-03-26": "Farmworkers Day Holiday",
      "2027-05-31": "Memorial Day observance",
    },
  },
  { key: "SU27", name: "Summer 2027", begins: "2027-06-28", classes: "2027-06-28", end: "2027-09-04" },
  {
    key: "FA27", name: "Fall 2027", begins: "2027-09-20", classes: "2027-09-23", end: "2027-12-11",
    lastClass: "2027-12-03", holidays: ["2027-11-11", "2027-11-25", "2027-11-26"],
    holidayNames: {
      "2027-11-11": "Veterans Day Holiday",
      "2027-11-25": "Thanksgiving Holiday",
      "2027-11-26": "Thanksgiving Holiday",
    },
  },
  {
    key: "WI28", name: "Winter 2028", begins: "2028-01-05", classes: "2028-01-10", end: "2028-03-25",
    lastClass: "2028-03-17", holidays: ["2028-01-17", "2028-02-21"],
    holidayNames: {
      "2028-01-17": "Martin Luther King, Jr. Holiday",
      "2028-02-21": "Presidents' Day Holiday",
    },
  },
  {
    key: "SP28", name: "Spring 2028", begins: "2028-03-29", classes: "2028-04-03", end: "2028-06-16",
    lastClass: "2028-06-09", holidays: ["2028-05-29"],
    holidayNames: {
      "2028-03-31": "Farmworkers Day Holiday",
      "2028-05-29": "Memorial Day observance",
    },
  },
];

/** Weeks of instruction in a regular quarter, for "hours a quarter" totals. */
export const QUARTER_WEEKS = 10;

/**
 * A partial overlap shorter than this is not worth mentioning — a lease that
 * ends on January 3rd does not "partly cover" Winter.
 */
const MIN_OVERLAP_DAYS = 14;

export type Coverage = "full" | "partial" | "none";

const DAY_MS = 86_400_000;

/** "2027-01-04" as a UTC timestamp. Invalid input is NaN, never a guess. */
export function dayValue(iso: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return Number.NaN;
  const t = Date.parse(`${iso}T00:00:00Z`);
  // Date.parse rolls "2027-02-30" over to March; a real date round-trips.
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === iso ? t : Number.NaN;
}

export const isIsoDate = (v: unknown): v is string =>
  typeof v === "string" && Number.isFinite(dayValue(v));

/** Today in San Diego, as YYYY-MM-DD — not the server's UTC date. */
export function todayInSanDiego(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

/**
 * How much of a quarter a stay covers. Full means in place by the first day of
 * classes and still there when finals end; anything less is partial, provided
 * it overlaps the quarter by at least two weeks.
 */
export function coverage(from: string, to: string, q: Quarter): Coverage {
  if (from <= q.classes && to >= q.end) return "full";
  const start = Math.max(dayValue(from), dayValue(q.classes));
  const end = Math.min(dayValue(to), dayValue(q.end));
  return (end - start) / DAY_MS + 1 >= MIN_OVERLAP_DAYS ? "partial" : "none";
}

/** Every quarter a stay touches, in order, with how well it covers each. */
export function quartersFor(from: string, to: string): { quarter: Quarter; coverage: Coverage }[] {
  return QUARTERS
    .map((quarter) => ({ quarter, coverage: coverage(from, to, quarter) }))
    .filter((q) => q.coverage !== "none");
}

/** "Winter 2027", "Winter & Spring 2027", "Fall 2026 & Winter 2027", "Fall 2026 – Spring 2027" */
function joinQuarters(qs: Quarter[]): string {
  if (qs.length <= 1) return qs[0]?.name ?? "";
  const first = qs[0].name;
  const last = qs[qs.length - 1].name;
  // Fully covered quarters are always consecutive, so three or more read as a range.
  if (qs.length > 2) return `${first} – ${last}`;
  const [season, year] = first.split(" ");
  return last.endsWith(` ${year}`) ? `${season} & ${last}` : `${first} & ${last}`;
}

/**
 * Which quarters a stay covers, in words, for a card that has one line to
 * say it: "Winter & Spring 2027", "Winter 2027, part of Spring 2027". Null
 * when it covers none of them worth mentioning.
 */
export function describeCoverage(from: string, to: string): string | null {
  const touched = quartersFor(from, to);
  const full = touched.filter((q) => q.coverage === "full").map((q) => q.quarter);
  const part = touched.filter((q) => q.coverage === "partial").map((q) => q.quarter);
  if (full.length && part.length) return `${joinQuarters(full)}, part of ${joinQuarters(part)}`;
  if (full.length) return joinQuarters(full);
  if (part.length) return `Part of ${joinQuarters(part)}`;
  return null;
}

/** Quarters still worth searching for: the current one until its finals end, and later. */
export function upcomingQuarters(today = todayInSanDiego(), count = 4): Quarter[] {
  return QUARTERS.filter((q) => q.end >= today).slice(0, count);
}

export const quarterByKey = (key: string | null | undefined) =>
  QUARTERS.find((q) => q.key === key) ?? null;

const MONTH_DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const MONTH_DAY_YEAR = new Intl.DateTimeFormat("en-US", {
  month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
});

/** "Jan 4 – Mar 20, 2027", or "Dec 15, 2026 – Mar 20, 2027" across a new year. */
export function formatStay(from: string, to: string): string {
  const a = dayValue(from);
  const b = dayValue(to);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return "";
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  return `${(sameYear ? MONTH_DAY : MONTH_DAY_YEAR).format(a)} – ${MONTH_DAY_YEAR.format(b)}`;
}

/** "Mar 20" */
export const formatDay = (iso: string) => {
  const t = dayValue(iso);
  return Number.isFinite(t) ? MONTH_DAY.format(t) : "";
};

/** Whole days from one date to another; negative when `to` is earlier. */
export const daysBetween = (from: string, to: string) =>
  Math.round((dayValue(to) - dayValue(from)) / DAY_MS);
