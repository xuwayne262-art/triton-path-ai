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
