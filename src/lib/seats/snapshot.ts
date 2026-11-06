import { quarterOf, termRank } from "@/lib/terms";
import { QUARTERS, todayInSanDiego } from "@/lib/housing/terms";
import { tallyPlannerSections, type PlannerSection, type SeatCount } from "./tally";

/**
 * Today's seats for every course in each quarter UCSD's public schedule
 * serves — Fall and Winter together while Winter is being booked — so each
 * course page can draw how its own quarter filled.
 *
 * It reads the public search (POST /api/v1/public/catalog/courses/search),
 * paged 48 listings at a time with an explicit term and offset: about fifty
 * requests a quarter. The routes it used before (/planner/terms,
 * /catalog/courses, /schedules/{ref}) answer 401 since late October 2026.
 *
 * The public schedule does not say when UCSD counted a section's seats, so a
 * snapshot is filed under the San Diego day it was read on, and the chart
 * says so; UCSD's own refresh time is kept beside it, never as a count time.
 */

const API = "https://classplanner.apps.ucsd.edu/api/v1/public/catalog";
/** The search refuses larger pages. */
const PAGE = 48;
const CONCURRENCY = 4;

export interface CourseSeats extends SeatCount {
  /** "CSE 12" */
  course: string;
}

export interface Snapshot {
  term: string;
  /** When UCSD last refreshed the term, as the API says it. Not when any seat was counted. */
  refreshed: string | null;
  rows: CourseSeats[];
}

type Fetch = typeof fetch;

async function call<T>(f: Fetch, path: string, body?: unknown, tries = 3): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await f(`${API}${path}`, {
        method: body ? "POST" : "GET",
        headers: {
          accept: "application/json",
          "user-agent": "UCSDPlans seat history (student project)",
          ...(body ? { "content-type": "application/json", origin: "https://classplanner.apps.ucsd.edu" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as T;
    } catch (err) {
      if (attempt >= tries) throw new Error(`${path}: ${err instanceof Error ? err.message : String(err)}`);
      await new Promise((r) => setTimeout(r, 400 * attempt));
    }
  }
}

async function pool<T, R>(items: T[], worker: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= items.length) return;
        out[i] = await worker(items[i]);
      }
    }),
  );
  return out;
}

interface Listing {
  term_code: string;
  subject_code: string;
  course_code: string;
  sections?: PlannerSection[];
}

interface Page {
  term_code: string;
  total: number;
  offset: number;
  courses: Listing[];
}

interface TermHeader {
  term_code: string;
  configured?: boolean;
  last_full_refresh_at?: string | null;
}

/** "CSE", "005" -> "CSE 5": the code every other part of the site uses. */
export const plannerCode = (subject: string, course: string) =>
  `${subject} ${String(course).replace(/^0+(?=\d)/, "")}`;

/**
 * The quarters worth a snapshot today: every configured Fall, Winter or Spring
 * whose finals are not over. A summer session is not a quarter on UCSD's
 * calendar, and a finished quarter's seats no longer move.
 */
export function quartersToCount(terms: TermHeader[], today: string): TermHeader[] {
  return terms.filter((t) => {
    if (t.configured === false || !/^(FA|WI|SP)\d{2}$/.test(t.term_code)) return false;
    const q = quarterOf(t.term_code);
    // A quarter the calendar here does not have yet is a new one, unless it is older than all it has.
    return q ? today <= q.end : termRank(t.term_code) > termRank(QUARTERS[0].key);
  });
}

/** Every listing of one term, page by page, checked to belong to it and to add up to its total. */
async function termListings(f: Fetch, term: string): Promise<Listing[]> {
  const first = await call<Page>(f, "/courses/search", { term_code: term, offset: 0, limit: PAGE });
  const offsets: number[] = [];
  for (let o = first.courses.length; o < first.total; o += PAGE) offsets.push(o);
  const rest = await pool(offsets, (offset) => call<Page>(f, "/courses/search", { term_code: term, offset, limit: PAGE }));
  const pages = [first, ...rest];
  const listings = pages.flatMap((p) => p.courses ?? []);
  if (pages.some((p) => p.term_code !== term) || listings.some((l) => l.term_code !== term)) {
    throw new Error(`the search answered with another term's listings when asked for ${term}`);
  }
  if (listings.length !== first.total) throw new Error(`${term}: ${listings.length} of ${first.total} listings`);
  return listings;
}

/** One snapshot of one term. A course listed more than once (topics, families) is counted together. */
export async function snapshotTerm(f: Fetch, header: TermHeader): Promise<Snapshot> {
  const listings = await termListings(f, header.term_code);
  const sections = new Map<string, PlannerSection[]>();
  for (const c of listings) {
    const code = plannerCode(c.subject_code, c.course_code);
    sections.set(code, [...(sections.get(code) ?? []), ...(c.sections ?? [])]);
  }
  const rows: CourseSeats[] = [];
  for (const [course, secs] of sections) {
    const count = tallyPlannerSections(secs);
    if (count) rows.push({ course, ...count });
  }
  rows.sort((a, b) => a.course.localeCompare(b.course));
  return { term: header.term_code, refreshed: header.last_full_refresh_at ?? null, rows };
}

/** Today's snapshot of every quarter worth one (see quartersToCount). */
export async function takeSnapshots(f: Fetch = fetch, now: Date = new Date()): Promise<Snapshot[]> {
  const { terms } = await call<{ terms?: TermHeader[] }>(f, "/terms");
  const wanted = quartersToCount(terms ?? [], todayInSanDiego(now));
  if (!wanted.length) throw new Error("UCSD's public schedule lists no quarter in progress or ahead");
  const out: Snapshot[] = [];
  // One term at a time: each is about fifty requests, and UCSD's API is shared.
  for (const t of wanted) out.push(await snapshotTerm(f, t));
  return out;
}
