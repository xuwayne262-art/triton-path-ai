import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { currentPlanSlot, scheduleYear, termQuarter } from "./planSlot";
import type { PlanQuarter, PlanYear } from "./plan/record";

const at = (code: string, year: PlanYear, quarter: PlanQuarter = "Fall") => ({ course: { code }, year, quarter });

describe("termQuarter", () => {
  test("reads the season off a term code", () => {
    assert.equal(termQuarter("FA26"), "Fall");
    assert.equal(termQuarter("WI27"), "Winter");
    assert.equal(termQuarter("SP27"), "Spring");
  });

  test("a summer session opens on the fall after it", () => {
    assert.equal(termQuarter("S126"), "Fall");
    assert.equal(termQuarter("S226"), "Fall");
  });

  test("anything else is unknown, not Fall", () => {
    assert.equal(termQuarter(""), null);
    assert.equal(termQuarter("Fall 2026"), null);
  });
});

describe("currentPlanSlot", () => {
  test("waits for the term", () => {
    assert.equal(currentPlanSlot("", [at("CSE 12", 3)], ["CSE 12"]), null);
  });

  test("a junior whose Fall courses are in Year 3 opens on Year 3, Fall — not Year 1", () => {
    const planned = [at("CSE 12", 3), at("MATH 20C", 3), at("CSE 100", 4, "Winter")];
    assert.deepEqual(currentPlanSlot("FA26", planned, ["CSE 12", "MATH 20C"]), { year: 3, quarter: "Fall", basis: "schedule" });
  });

  test("this term's courses beat everything else in the plan", () => {
    const planned = [at("CSE 8A", 1), at("CSE 12", 2), at("CSE 30", 2)];
    assert.equal(currentPlanSlot("FA26", planned, ["CSE 12", "CSE 30"])?.year, 2);
  });

  test("placements in this quarter count before ones elsewhere", () => {
    const planned = [at("CSE 12", 2, "Winter"), at("CSE 30", 2, "Winter"), at("MATH 18", 3, "Fall")];
    assert.equal(currentPlanSlot("FA26", planned, ["CSE 12", "CSE 30", "MATH 18"])?.year, 3);
  });

  test("a tie goes to the earlier year, whatever the order", () => {
    const a = [at("CSE 12", 3), at("CSE 30", 2)];
    assert.equal(currentPlanSlot("FA26", a, ["CSE 12", "CSE 30"])?.year, 2);
    assert.equal(currentPlanSlot("FA26", [...a].reverse(), ["CSE 12", "CSE 30"])?.year, 2);
  });

  test("with this term not planned yet, the plan's first year", () => {
    const planned = [at("CSE 100", 3, "Winter"), at("CSE 101", 4, "Spring")];
    assert.deepEqual(currentPlanSlot("FA26", planned, ["CSE 12"]), { year: 3, quarter: "Fall", basis: "plan" });
  });

  test("an empty plan says so, and opens on Year 1", () => {
    assert.deepEqual(currentPlanSlot("WI27", [], []), { year: 1, quarter: "Winter", basis: "none" });
  });
});

describe("scheduleYear", () => {
  test("names the year when this term's courses share one", () => {
    assert.equal(scheduleYear([at("CSE 12", 3), at("MATH 20C", 3, "Winter")], ["CSE 12", "MATH 20C"]), 3);
  });

  test("is null when they are spread across years, or not planned", () => {
    assert.equal(scheduleYear([at("CSE 12", 2), at("MATH 20C", 3)], ["CSE 12", "MATH 20C"]), null);
    assert.equal(scheduleYear([at("CSE 12", 2)], ["MATH 20C"]), null);
  });
});
