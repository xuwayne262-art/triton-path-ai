import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { moveActive, resultSummary } from "./combobox";

describe("the search box's keys", () => {
  test("Down enters the list at the top and stops at the bottom", () => {
    assert.equal(moveActive("ArrowDown", -1, 5), 0);
    assert.equal(moveActive("ArrowDown", 3, 5), 4);
    assert.equal(moveActive("ArrowDown", 4, 5), 4);
  });

  test("Up stops at the top; Home and End jump", () => {
    assert.equal(moveActive("ArrowUp", 2, 5), 1);
    assert.equal(moveActive("ArrowUp", 0, 5), 0);
    assert.equal(moveActive("Home", 3, 5), 0);
    assert.equal(moveActive("End", 0, 5), 4);
  });

  test("an empty list has no active option", () => {
    assert.equal(moveActive("ArrowDown", 0, 0), -1);
    assert.equal(moveActive("End", -1, 0), -1);
  });
});

describe("what a screen reader is told", () => {
  test("counts each kind of result, and says how to choose", () => {
    assert.match(resultSummary(2, 6), /^2 professors and 6 courses\./);
    assert.match(resultSummary(0, 1), /^1 course\./);
    assert.match(resultSummary(1, 0), /^1 professor\./);
    assert.equal(resultSummary(0, 0), "No matches");
  });
});
