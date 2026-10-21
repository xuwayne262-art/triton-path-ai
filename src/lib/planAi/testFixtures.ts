import type { CourseDetail, CourseRow, SectionTuple } from "@/lib/plat";

/**
 * Small, synthetic course data for Plan with AI's tests: rows and sections
 * shaped exactly like the published dataset, with times chosen to make each
 * clash, final and gap the tests need. Nothing here is real UCSD data.
 */

const DAY_MIN = (t: string) => {
  const m = /^(\d{1,2}):(\d{2})([ap])$/.exec(t)!;
  return ((Number(m[1]) % 12) + (m[3] === "p" ? 12 : 0)) * 60 + Number(m[2]);
};

let sid = 1;

/** One weekly section row. */
export function sec(code: string, type: string, days: string, start: string, end: string, opts: { open?: number; limit?: number; id?: string; status?: string } = {}): SectionTuple {
  const id = opts.id ?? `E ${String(sid++).padStart(8, "0")}`;
  return [
    code, type, days, start, end, "Center Hall", `CENTR ${100 + (sid % 50)}`, "Instructor",
    opts.open ?? 20, opts.limit ?? 40, 0, 0, 10, id, ["1"], DAY_MIN(start), DAY_MIN(end), "CENTR", opts.status ?? "AC", "", "2026-10-17T22:27Z",
  ];
}

/** A dated final for the section with `id`. */
export function final(date: string, start: string, end: string, id: string): SectionTuple {
  return [date, "FI", date, start, end, "Center Hall", "CENTR 101", "", null, null, 0, 0, null, id, ["1"], DAY_MIN(start), DAY_MIN(end), "CENTR", "", "", ""];
}

export function row(k: string, opts: Partial<CourseRow> = {}): CourseRow {
  const [s, c] = k.split(" ");
  return {
    k, s, c, t: `${k} title`, u: "4", g: 3.2, a: 40, r: 10, o: 1, pr: 0, sa: 20, sl: 40,
    d: null, st: null, en: null, b: null, p: "Instructor", pq: null, pn: null, pa: null, pd: null, pg: null,
    ...opts,
  };
}

export function detail(sections: SectionTuple[], opts: Partial<CourseDetail> = {}): CourseDetail {
  return {
    t: "title", u: "4", pre: null, ge: [], gpa: 3.2, aRate: 40, terms: 10, offered: 1, seatUrl: null, tss: null,
    res: null, fa: [], profs: [], sec: sections, ...opts,
  };
}
