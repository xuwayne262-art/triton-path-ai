import { termRank } from "@/lib/plan/term";
import { tallyPlannerSections, type PlannerSection, type SeatCount } from "./tally";

/**
 * Today's seats for every course UCSD's Class Planner lists — the same
 * first-party source as the dataset's schedule, read the way
 * scripts/fetch-classplanner.mjs reads it, minus everything but the counts.
 *
 * About 250 requests: one course list per subject, paged 48 at a time (the
 * API refuses more). Run once a day by the cron route; UCSD refreshes the
 * term's availability roughly daily (`last_full_refresh_at`).
 */

const API = "https://classplanner.apps.ucsd.edu/api/v1";
/** The API rejects anything larger; it is not a suggestion. */
const PAGE = 48;
const CONCURRENCY = 6;

export interface CourseSeats extends SeatCount {
  /** "CSE 12" */
  course: string;
}

export interface Snapshot {
  term: string;
  /** When UCSD last refreshed the term, as the API says it. */
  refreshed: string | null;
  /**
   * When Class Planner last counted seats from TSS (ISO), judged on the term's
   * busiest courses; null when it would not say. Its counts can stay the same
   * for weeks — Fall 2026's were Sep 21's on Oct 10 — so a snapshot is filed
   * under this day, not the day it was taken.
   */
  counted: string | null;
  rows: CourseSeats[];
}

/**
 * When Class Planner says it last counted a course's seats: "9/21/26 8:37 AM
 * PDT" -> "2026-09-21T15:37:00.000Z". Null for a label in another shape.
 */
export function seatTime(label: string | null | undefined): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4}) (\d{1,2}):(\d{2}) ?([AP]M) (PDT|PST)$/i.exec(String(label ?? "").trim());
  if (!m) return null;
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const hour = (Number(m[4]) % 12) + (/^p/i.test(m[6]) ? 12 : 0);
  const t = Date.UTC(year, Number(m[1]) - 1, Number(m[2]), hour + (/^PST$/i.test(m[7]) ? 8 : 7), Number(m[5]));
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/** A share link's schedule ref, as Class Planner builds it: ids sorted, at most 15 courses. */
const scheduleRef = (ids: string[], term: string) =>
  "CS2" + Buffer.from(JSON.stringify({ s: [...new Set(ids)].sort(), t: term })).toString("base64").replace(/=+$/, "");

type Fetch = typeof fetch;

async function getJson<T>(f: Fetch, url: string, tries = 3): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await f(url, {
        headers: { accept: "application/json", "user-agent": "UCSDPlans seat history (student project)" },
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as T;
    } catch (err) {
      if (attempt >= tries) throw new Error(`${url}: ${err instanceof Error ? err.message : String(err)}`);
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

interface PlannerCourse {
  subject_code: string;
  course_code: string;
  sections?: PlannerSection[];
}

/** "CSE", "005" -> "CSE 5": the code every other part of the site uses. */
export const plannerCode = (subject: string, course: string) =>
  `${subject} ${String(course).replace(/^0+(?=\d)/, "")}`;

/**
 * One snapshot of the term Class Planner currently serves. A topics course
 * listed once per topic (CSE 190) is one course, so its entries are counted
 * together.
 */
export async function takeSnapshot(f: Fetch = fetch): Promise<Snapshot> {
  const { terms } = await getJson<{ terms?: { term_code: string; configured?: boolean; last_full_refresh_at?: string }[] }>(
    f, `${API}/planner/terms`,
  );
  // The latest quarter, as scripts/fetch-classplanner.mjs picks it: once the
  // next quarter's listings are out, both are served, and the next is the one
  // being enrolled in. A summer session is not a quarter.
  const configured = (terms ?? []).filter((t) => t.configured !== false);
  const quarters = configured.filter((t) => /^(FA|WI|SP)\d{2}$/.test(t.term_code));
  const term = [...(quarters.length ? quarters : configured)].sort((a, b) => termRank(b.term_code) - termRank(a.term_code))[0];
  if (!term) throw new Error("Class Planner lists no configured term");

  const filters = await getJson<{ subjects?: { value: string }[] }>(
    f, `${API}/catalog/filters?term_code=${encodeURIComponent(term.term_code)}`,
  );
  const subjects = (filters.subjects ?? []).map((s) => s.value);

  const pages = await pool(subjects, async (subject) => {
    const rows: PlannerCourse[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const page = await getJson<{ courses?: PlannerCourse[]; total?: number }>(
        f,
        `${API}/catalog/courses?term_code=${encodeURIComponent(term.term_code)}&subject_code=${encodeURIComponent(subject)}&limit=${PAGE}&offset=${offset}`,
      );
      const got = page.courses ?? [];
      rows.push(...got);
      if (got.length < PAGE || rows.length >= (page.total ?? 0)) break;
    }
    return rows;
  });

  const sections = new Map<string, PlannerSection[]>();
  for (const c of pages.flat()) {
    const code = plannerCode(c.subject_code, c.course_code);
    sections.set(code, [...(sections.get(code) ?? []), ...(c.sections ?? [])]);
  }

  const rows: CourseSeats[] = [];
  for (const [course, secs] of sections) {
    const count = tallyPlannerSections(secs);
    if (count) rows.push({ course, ...count });
  }
  rows.sort((a, b) => a.course.localeCompare(b.course));

  // When the counts were taken, asked of the busiest fifteen courses (one
  // schedule request holds at most fifteen). An outage here is not fatal:
  // the snapshot is then filed under the day it was taken, as it used to be.
  let counted: string | null = null;
  const busiest = rows
    .map((r) => ({ r, id: (sections.get(r.course) ?? []).find((s) => s.section_id)?.section_id }))
    .filter((x): x is { r: CourseSeats; id: string } => Boolean(x.id))
    .sort((a, b) => b.r.enrolled - a.r.enrolled)
    .slice(0, 15);
  if (busiest.length) {
    try {
      const res = await getJson<{ course_details?: Record<string, { seat_freshness?: { label?: string } }> }>(
        f, `${API}/schedules/${scheduleRef(busiest.map((x) => x.id), term.term_code)}?context=planner`,
      );
      counted = Object.values(res.course_details ?? {})
        .map((d) => seatTime(d.seat_freshness?.label))
        .filter((t): t is string => Boolean(t))
        .sort()
        .pop() ?? null;
    } catch (err) {
      console.error(`[seats] could not ask when the seats were counted: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { term: term.term_code, refreshed: term.last_full_refresh_at ?? null, counted, rows };
}
