import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyFilters, DEFAULT_FILTERS } from "./courseFilters";
import type { PlatIndex } from "./plat";

const index = JSON.parse(readFileSync(new URL("../../public/data/plat/index.json", import.meta.url), "utf8")) as PlatIndex;
const chem = index.courses.filter((c) => c.s === "CHEM");

describe("a department's course list", () => {
  test("opens on every course, including ones not running this term", () => {
    // CHEM 118 is in the catalog but not on the Fall 2026 schedule; the list
    // used to hide it behind a filter nobody could see.
    const shown = applyFilters(chem, DEFAULT_FILTERS).map((c) => c.k);
    assert.ok(shown.includes("CHEM 118"));
    assert.equal(shown.length, chem.length, "nothing is left out by default");
  });

  test("narrows to this term's courses when asked", () => {
    const shown = applyFilters(chem, { ...DEFAULT_FILTERS, offeredOnly: true });
    assert.ok(shown.every((c) => c.o === 1));
    assert.ok(!shown.some((c) => c.k === "CHEM 118"));
    assert.equal(shown.length, chem.filter((c) => c.o).length);
  });

  test("'No prerequisite' only keeps courses known to have none", () => {
    const shown = applyFilters(index.courses, { ...DEFAULT_FILTERS, noPre: true });
    assert.ok(shown.length > 0);
    for (const c of shown) {
      assert.equal(c.pr, 0, c.k);
      assert.ok(!(c.ct === 0 && c.o === 0), `${c.k} is retired, its prerequisites unknown`);
    }
  });

  test("sorting by best grades keeps every course, histories first", () => {
    const sorted = applyFilters(chem, { ...DEFAULT_FILTERS, sort: "grade" });
    assert.equal(sorted.length, chem.length);
    const firstBlank = sorted.findIndex((c) => !(c.g != null && c.g > 0));
    assert.ok(sorted.slice(firstBlank).every((c) => !(c.g != null && c.g > 0)));
  });
});
