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
  rows: CourseSeats[];
}

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
  return { term: term.term_code, refreshed: term.last_full_refresh_at ?? null, rows };
}
