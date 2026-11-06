import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { tallyPlannerSections, tallySectionRows } from "./tally";
import type { SectionTuple } from "@/lib/plat";

/** A dataset section row with only the fields the tally reads filled in. */
const row = (code: string, type: string, enrolled: number | null, cap: number | null, over: Partial<{ waitlist: number; id: string; days: string; cancelled: number }> = {}): SectionTuple => [
  code, type, over.days ?? "MWF", "9:00a", "9:50a", "", "", "",
  cap == null || enrolled == null ? null : cap - enrolled, cap, over.cancelled ?? 0,
  over.waitlist ?? 0, enrolled, over.id ?? `id-${code}`, [], 540, 590,
];

describe("counting a course's seats", () => {
  test("sums the lectures, since each lecture's count already includes its discussions", () => {
    // CSE 11 as Class Planner reported it: A00 428 of 417 with discussions of
    // 143, 141 and 144; B00 156 of 196 with one discussion.
    const count = tallyPlannerSections([
      { section_id: "a", instruction_type_name: "lecture", enrolled: 428, capacity: 417, waitlist_enrolled: 3 },
      { section_id: "a1", instruction_type_name: "discussion", enrolled: 143, capacity: 139 },
      { section_id: "a2", instruction_type_name: "discussion", enrolled: 141, capacity: 139 },
      { section_id: "a3", instruction_type_name: "discussion", enrolled: 144, capacity: 139 },
      { section_id: "b", instruction_type_name: "lecture", enrolled: 156, capacity: 196 },
      { section_id: "b1", instruction_type_name: "discussion", enrolled: 156, capacity: 196 },
    ]);
    assert.deepEqual(count, { enrolled: 584, capacity: 613, waitlist: 3 });
  });

  test("sums every section of a course with no lecture", () => {
    const count = tallyPlannerSections([
      { section_id: "x", instruction_type_name: "lab", enrolled: 20, capacity: 24 },
      { section_id: "y", instruction_type_name: "lab", enrolled: 22, capacity: 24 },
    ]);
    assert.deepEqual(count, { enrolled: 42, capacity: 48, waitlist: 0 });
  });

  test("leaves out cancelled sections and counts a section once", () => {
    const count = tallyPlannerSections([
      { section_id: "a", instruction_type_name: "lecture", enrolled: 50, capacity: 60 },
      { section_id: "a", instruction_type_name: "lecture", enrolled: 50, capacity: 60 },
      { section_id: "b", instruction_type_name: "lecture", enrolled: 0, capacity: 60, status: "cancelled" },
    ]);
    assert.deepEqual(count, { enrolled: 50, capacity: 60, waitlist: 0 });
  });

  test("says nothing when no section publishes a capacity", () => {
    assert.equal(tallyPlannerSections([{ instruction_type_name: "lecture", enrolled: null, capacity: null }]), null);
    assert.equal(tallyPlannerSections([]), null);
  });

  test("reads the dataset's section rows the same way, skipping finals and repeated rows", () => {
    const count = tallySectionRows([
      row("A00", "LE", 279, 348, { id: "E1" }),
      row("A00", "LE", 279, 348, { id: "E1", days: "F" }),
      row("A01", "DI", 279, 348, { id: "E2" }),
      row("2026-12-07", "FI", null, null, { id: "E1", days: "2026-12-07" }),
    ]);
    assert.deepEqual(count, { enrolled: 279, capacity: 348, waitlist: 0 });
  });
});

describe("the daily seat snapshot", () => {
  test("counts every quarter still running or ahead, never a summer session or one that ended", async () => {
    const { quartersToCount } = await import("./snapshot");
    const terms = [
      { term_code: "WI27", configured: true },
      { term_code: "FA26", configured: true },
      { term_code: "S126", configured: true },
      { term_code: "SP26", configured: true },
      { term_code: "SP27", configured: false },
    ];
    assert.deepEqual(quartersToCount(terms, "2026-11-06").map((t) => t.term_code), ["WI27", "FA26"]);
    assert.deepEqual(quartersToCount(terms, "2026-12-13").map((t) => t.term_code), ["WI27"]);
  });

  test("pages the public search per term and counts a course's listings together", async () => {
    const { takeSnapshots } = await import("./snapshot");
    const listing = (term: string, code: string, enrolled: number) => ({
      term_code: term, subject_code: "CSE", course_code: code,
      sections: [{ section_id: `${term}${code}${enrolled}`, instruction_type_name: "lecture", capacity: 100, enrolled, status: "AC" }],
    });
    const listings: Record<string, ReturnType<typeof listing>[]> = {
      WI27: [listing("WI27", "190", 10), listing("WI27", "190", 5), listing("WI27", "011", 50)],
      FA26: [listing("FA26", "012", 90)],
    };
    const asked: unknown[] = [];
    const fake = async (url: string, init?: { body?: string }) => {
      if (url.endsWith("/terms")) {
        return Response.json({ terms: [{ term_code: "WI27", last_full_refresh_at: "2026-11-06 01:38:11+00" }, { term_code: "FA26" }] });
      }
      const { term_code, offset, limit } = JSON.parse(String(init?.body));
      asked.push([term_code, offset, limit]);
      const all = listings[term_code];
      return Response.json({ term_code, total: all.length, offset, limit, courses: all.slice(offset, offset + limit) });
    };
    const snaps = await takeSnapshots(fake as typeof fetch, new Date("2026-11-06T20:00:00Z"));
    assert.deepEqual(snaps.map((s) => [s.term, s.refreshed, s.rows.map((r) => [r.course, r.enrolled])]), [
      ["WI27", "2026-11-06 01:38:11+00", [["CSE 11", 50], ["CSE 190", 15]]],
      ["FA26", null, [["CSE 12", 90]]],
    ]);
    assert.deepEqual(asked, [["WI27", 0, 48], ["FA26", 0, 48]]);
  });
});
