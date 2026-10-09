import type { CourseSeats } from "./snapshot";

/**
 * Where each course's daily seat counts are kept, so a course page can show
 * how fast it filled — the one thing a single snapshot cannot say.
 *
 * Supabase in production (the same service-role REST access as the other
 * stores), a JSON file per term for `next dev`, and null when neither is
 * available — never a silent no-op. One row per course per day: a second run
 * on the same day replaces that day's numbers rather than adding a point.
 */

export interface SeatPoint {
  /** San Diego date, YYYY-MM-DD. */
  day: string;
  enrolled: number;
  capacity: number;
  waitlist: number;
}

export interface SeatStore {
  readonly name: string;
  /** Saves one day's counts for every course; returns how many rows were written. */
  record(term: string, day: string, rows: CourseSeats[]): Promise<number>;
  /** One course's points in a term, oldest first. */
  history(term: string, course: string): Promise<SeatPoint[]>;
}

const env = (...names: string[]): string => {
  for (const n of names) {
    const v = process.env[n];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
};

export const SEAT_TABLE = "seat_history";
const MIGRATION = "supabase/004_seat_history.sql";

const toPoint = (r: { day?: unknown; enrolled?: unknown; capacity?: unknown; waitlist?: unknown }): SeatPoint | null => {
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v));
  if (typeof r.day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(r.day)) return null;
  const enrolled = n(r.enrolled), capacity = n(r.capacity), waitlist = n(r.waitlist);
  if (![enrolled, capacity, waitlist].every(Number.isFinite)) return null;
  return { day: r.day, enrolled, capacity, waitlist };
};

function supabaseStore(url: string, key: string): SeatStore {
  const table = `${url.replace(/\/+$/, "")}/rest/v1/${SEAT_TABLE}`;
  const headers = { apikey: key, authorization: `Bearer ${key}` };

  const send = async (input: string, init: RequestInit): Promise<Response> => {
    const res = await fetch(input, { ...init, cache: "no-store" });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      const missing = /PGRST205|Could not find the table/i.test(detail)
        ? ` — seat history is not set up in this database yet. Run ${MIGRATION} in the Supabase SQL editor.`
        : "";
      throw new Error(`Supabase ${init.method ?? "GET"} ${res.status}: ${detail.slice(0, 300)}${missing}`);
    }
    return res;
  };

  return {
    name: "supabase",
    async record(term, day, rows) {
      const now = new Date().toISOString();
      // Batches keep each request well under PostgREST's body limit.
      for (let i = 0; i < rows.length; i += 500) {
        const body = rows.slice(i, i + 500).map((r) => ({
          term, course: r.course, day,
          enrolled: r.enrolled, capacity: r.capacity, waitlist: r.waitlist,
          recorded_at: now,
        }));
        await send(`${table}?on_conflict=term,course,day`, {
          method: "POST",
          headers: { ...headers, "content-type": "application/json", prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify(body),
        });
      }
      return rows.length;
    },
    async history(term, course) {
      const q = `term=eq.${encodeURIComponent(term)}&course=eq.${encodeURIComponent(course)}`
        + "&select=day,enrolled,capacity,waitlist&order=day.asc&limit=400";
      const res = await send(`${table}?${q}`, { headers });
      const rows = (await res.json()) as Array<Record<string, unknown>>;
      return rows.map(toPoint).filter((p): p is SeatPoint => p !== null);
    },
  };
}

/**
 * One JSON file per term under .history-store/seats/, for `next dev` only: a
 * serverless filesystem is per-instance and wiped on deploy. Shaped
 * { course: { day: [enrolled, capacity, waitlist] } }.
 */
function fileStore(): SeatStore {
  const dir = ".history-store/seats";
  const fsp = () => import("node:fs/promises");
  const pathFor = (term: string) => `${dir}/${term.replace(/[^A-Za-z0-9]/g, "_")}.json`;
  type File = Record<string, Record<string, [number, number, number]>>;

  const load = async (term: string): Promise<File> => {
    try {
      const v = JSON.parse(await (await fsp()).readFile(pathFor(term), "utf8"));
      return v && typeof v === "object" ? (v as File) : {};
    } catch {
      return {};
    }
  };

  return {
    name: "file",
    async record(term, day, rows) {
      const file = await load(term);
      for (const r of rows) {
        file[r.course] = { ...(file[r.course] ?? {}), [day]: [r.enrolled, r.capacity, r.waitlist] };
      }
      const f = await fsp();
      await f.mkdir(dir, { recursive: true });
      await f.writeFile(pathFor(term), JSON.stringify(file), "utf8");
      return rows.length;
    },
    async history(term, course) {
      const days = (await load(term))[course] ?? {};
      return Object.entries(days)
        .map(([day, [enrolled, capacity, waitlist]]) => toPoint({ day, enrolled, capacity, waitlist }))
        .filter((p): p is SeatPoint => p !== null)
        .sort((a, b) => a.day.localeCompare(b.day));
    },
  };
}

let cached: SeatStore | null | undefined;

/** The configured store, or null when there is none. */
export function seatStore(): SeatStore | null {
  if (cached !== undefined) return cached;
  const supabaseUrl = env("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY", "SUPABASE_SECRET_KEY");
  if (supabaseUrl && serviceKey) cached = supabaseStore(supabaseUrl, serviceKey);
  else if (process.env.NODE_ENV !== "production") cached = fileStore();
  else cached = null;
  return cached;
}

/** Test seam: forget the cached driver so env changes take effect. */
export function resetSeatStore(): void {
  cached = undefined;
}
