import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  academicYearLabel, buildPlanLayer, currentAcademicYear, planStartFor, planYearNow, slotKey, stillPlanned, termForSlot,
  type PlannedLike,
} from "./planLayer";
import { readAcademicHistory } from "./parse";
import { ROW_OF as ROW, TSS_FIXTURE } from "./fixtures";

const TODAY = "2026-11-08";
const CATALOG = new Set(["BIEB 102", "ECON 110B", "MGT 160", "MGT 162R", "MGT 180R", "WCWP 10B"]);
const fixture = readAcademicHistory(TSS_FIXTURE, { today: TODAY, has: (c) => CATALOG.has(c) }).history;
/** The student says 2026–27 is their Year 3. */
const anchored = { ...fixture, planStart: planStartFor(3, currentAcademicYear(TODAY)) };

const plan = (courseId: string, code: string, year: 1 | 2 | 3 | 4, quarter: "Fall" | "Winter" | "Spring"): PlannedLike =>
  ({ courseId, course: { code }, year, quarter });

describe("plan years and calendar terms", () => {
  test("2026–27 as Year 3 puts Fall 2026 in Year 3 and Winter 2027 beside it", () => {
    assert.equal(anchored.planStart, 2024);
    assert.equal(termForSlot(3, "Fall", 2024), "FA26");
    assert.equal(termForSlot(3, "Winter", 2024), "WI27");
    assert.equal(termForSlot(1, "Spring", 2024), "SP25");
    assert.equal(academicYearLabel(3, 2024), "2026–27");
    assert.equal(planYearNow(2024, TODAY), 3);
  });

  test("the academic year turns over in July", () => {
    assert.equal(currentAcademicYear("2026-11-08"), 2026);
    assert.equal(currentAcademicYear("2027-03-01"), 2026);
    assert.equal(currentAcademicYear("2027-07-15"), 2027);
  });
});

describe("buildPlanLayer", () => {
  test("places each attempt in its real quarter, summer apart, with its status", () => {
    const layer = buildPlanLayer(anchored, [], TODAY);
    assert.equal(layer.anchored, true);
    const fall = layer.bySlot.get(slotKey(3, "Fall"))!;
    assert.deepEqual(fall.map((c) => [c.code, c.label]), [
      ["BIEB 102", "In progress"], ["ECON 110B", "In progress"], ["MGT 160", "In progress"], ["MGT 162R", "In progress"],
    ]);
    // Summer Session II 2026 belongs to 2025–26, which is Year 2.
    assert.deepEqual(layer.summer.get(2)!.map((c) => [c.code, c.label, c.grade]), [
      ["MGT 180R", "Completed", "C+"], ["WCWP 10B", "Completed", "B+"],
    ]);
    assert.equal(layer.outside.length, 0);
  });

  test("without an anchor nothing is guessed into the grid, and every attempt is still listed", () => {
    const layer = buildPlanLayer(fixture, [], TODAY);
    assert.equal(layer.anchored, false);
    assert.equal(layer.bySlot.size, 0);
    assert.deepEqual(layer.outside.map((o) => [o.term, o.chips.length]), [["S226", 2], ["FA26", 4]]);
  });

  test("quarters before Year 1 or after Year 4 stay reachable outside the grid", () => {
    const early = readAcademicHistory(["2020/2021 Fall Quarter", ROW("CSE-11", "Accel Intro", "4.00", "Letter Grade", "A", "16.0000")].join("\n"), { today: TODAY }).history;
    const layer = buildPlanLayer({ ...early, planStart: 2024 }, [], TODAY);
    assert.deepEqual(layer.outside.map((o) => o.termName), ["Fall 2020"]);
  });

  test("a planned course in the same quarter is the same attempt, shown once", () => {
    const planned = [plan("p1", "ECON 110B", 3, "Fall"), plan("p2", "CSE 100", 3, "Winter")];
    const layer = buildPlanLayer(anchored, planned, TODAY);
    assert.deepEqual([...layer.matched], ["p1"]);
    assert.equal(layer.bySlot.get(slotKey(3, "Fall"))!.find((c) => c.code === "ECON 110B")!.plannedId, "p1");
    assert.deepEqual(stillPlanned(planned, layer).map((p) => p.courseId), ["p2"], "the plan itself is untouched");
  });

  test("a course planned after it was passed is flagged, not removed", () => {
    const planned = [plan("p3", "MGT 180R", 4, "Fall")];
    const layer = buildPlanLayer(anchored, planned, TODAY);
    assert.deepEqual(layer.flags, [{ courseId: "p3", code: "MGT 180R", year: 4, quarter: "Fall", kind: "already-completed", doneIn: "Summer Session II 2026" }]);
    assert.deepEqual(stillPlanned(planned, layer), [], "it no longer counts as planned");
  });

  test("a course still in progress is not called completed when it is also planned later", () => {
    const layer = buildPlanLayer(anchored, [plan("p4", "MGT 160", 4, "Winter")], TODAY);
    assert.deepEqual(layer.flags, []);
  });

  test("a plan entry in a finished quarter the history covers, but without that course, is flagged", () => {
    const withSpring = readAcademicHistory([
      "2025/2026 Spring Quarter", ROW("CSE-12", "Basic Data Structures", "4.00", "Letter Grade", "B", "12.0000"),
    ].join("\n"), { today: TODAY }).history;
    const layer = buildPlanLayer({ ...withSpring, planStart: 2024 }, [plan("p5", "CSE 30", 2, "Spring"), plan("p6", "CSE 30", 2, "Winter")], TODAY);
    assert.deepEqual(layer.flags.map((f) => [f.courseId, f.kind]), [["p5", "past-not-taken"]], "Winter 2026 is not in the history, so nothing is said");
  });
});
