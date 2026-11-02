import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseUnits, unitsLabel, unitsText, unitsTotal } from "./units";

describe("parseUnits", () => {
  test("a fixed number is fixed", () => {
    assert.deepEqual(parseUnits("4"), { min: 4, max: 4, options: [4] });
    assert.deepEqual(parseUnits("2.5"), { min: 2.5, max: 2.5, options: [2.5] });
  });

  test("a range stays a range, not its first number", () => {
    assert.deepEqual(parseUnits("1-4"), { min: 1, max: 4, options: null });
    assert.equal(unitsText(parseUnits("1-4")), "1–4");
  });

  test("listed values stay a choice", () => {
    assert.deepEqual(parseUnits("0-2-4"), { min: 0, max: 4, options: [0, 2, 4] });
  });

  test("a sequence counts one quarter's share", () => {
    assert.deepEqual(parseUnits("4-4-4"), { min: 4, max: 4, options: [4] });
    assert.deepEqual(parseUnits("0-4/0-4/0-4"), { min: 0, max: 4, options: null });
  });

  test("a title naming a choice the field narrowed keeps the choice (ECON 199)", () => {
    assert.deepEqual(parseUnits("2", "Independent Study (2 or 4)"), { min: 2, max: 4, options: [2, 4] });
    assert.equal(unitsLabel("2", "Independent Study (2 or 4)"), "2 or 4 units");
    assert.deepEqual(parseUnits(null, "Directed Group Study (2 or 4)"), { min: 2, max: 4, options: [2, 4] });
  });

  test("a title that disagrees with the field does not override it", () => {
    assert.deepEqual(parseUnits("4", "Topics in Music (1-2)"), { min: 4, max: 4, options: [4] });
    assert.deepEqual(parseUnits("4", "Calculus (honors)"), { min: 4, max: 4, options: [4] });
  });

  test("nothing listed is unknown, not zero", () => {
    assert.equal(parseUnits(null), null);
    assert.equal(unitsLabel(undefined), "Units not listed");
  });

  test("one unit is singular", () => {
    assert.equal(unitsLabel("1"), "1 unit");
    assert.equal(unitsLabel("1-4"), "1–4 units");
  });
});

describe("unitsTotal", () => {
  test("is a range while any course is still a choice", () => {
    assert.equal(unitsTotal([parseUnits("4"), parseUnits("2", "Independent Study (2 or 4)")]).text, "6–8");
    assert.equal(unitsTotal([parseUnits("4"), parseUnits("4")]).text, "8");
  });
});
