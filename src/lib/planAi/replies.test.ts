import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { defaultSettings } from "./conversation";
import type { OptionsResult } from "./engine";
import { moveReply, optionsReply } from "./replies";
import type { PlanTarget, Proposal } from "./types";

const term: PlanTarget = { kind: "term", term: "FA26", label: "Fall 2026 · This term" };
const slot: PlanTarget = { kind: "plan", slot: { year: 2, quarter: "Winter" }, term: "WI27", label: "Winter 2027 · Year 2" };

const draft = (units: number) => ({ ops: [{ op: "add_plan" }], after: { units } }) as unknown as Proposal;
const result = (count: number, solutions = count): OptionsResult => ({
  proposals: Array.from({ length: count }, () => draft(12)),
  outcome: { exhaustive: true, explored: count, relaxation: null },
  undecided: [],
  considered: count,
  solutions,
  keptUnits: 4,
});

describe("options replies", () => {
  test("a week's alternatives trade something off", () => {
    assert.equal(optionsReply(result(3), defaultSettings(term), term, "build"), "Here's a 12-unit Fall 2026 draft. Two alternatives below trade something off.");
    assert.equal(optionsReply(result(1, 1), defaultSettings(term), term, "build"), "Here's a 12-unit Fall 2026 draft. It's the only combination that fits.");
  });

  test("a 4-year plan quarter has no week, so its drafts are other mixes", () => {
    assert.equal(optionsReply(result(3), defaultSettings(slot), slot, "build"), "Here's a 12-unit Winter 2027 (Year 2) draft. Two other mixes below.");
    assert.equal(optionsReply(result(2), defaultSettings(slot), slot, "build"), "Here's a 12-unit Winter 2027 (Year 2) draft. Another mix below.");
    assert.equal(optionsReply(result(1, 1), defaultSettings(slot), slot, "build"), "Here's a 12-unit Winter 2027 (Year 2) draft.");
    assert.equal(optionsReply(result(1), defaultSettings(slot), slot, "improve"), "Here's how your Winter 2027 (Year 2) quarter could change.");
  });
});

describe("move replies", () => {
  test("names the course that would come too late, once", () => {
    const text = moveReply({
      code: "MATH 20A",
      to: { year: 3, quarter: "Fall" },
      dependents: [
        { code: "MATH 20B", slot: { year: 2, quarter: "Spring" }, required: true },
        { code: "MATH 18", slot: { year: 2, quarter: "Winter" }, required: false },
      ],
      prerequisitesAfter: [],
      pastTerms: ["FA25", "FA24"],
    });
    assert.equal(text, "MATH 20B (Year 2 Spring) needs MATH 20A as a prerequisite. MATH 18 (Year 2 Winter) lists MATH 20A as a prerequisite. In Year 3 Fall, MATH 20A would no longer come before them. It was taught in Fall 2025 and Fall 2024. The Fall schedule isn't published yet.");
  });

  test("a move that keeps the order says so", () => {
    const text = moveReply({ code: "MATH 18", to: { year: 1, quarter: "Spring" }, dependents: [], prerequisitesAfter: [], pastTerms: [] });
    assert.equal(text, "Moving MATH 18 to Year 1 Spring keeps your plan's known prerequisites in order. The grade archive shows no Spring offering, and the schedule isn't published yet.");
  });
});
