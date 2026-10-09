import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyFilters, DEFAULT_FILTERS, splitByTerm } from "./courseFilters";
import { typicalGrade, type PlatIndex } from "./plat";

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

describe("reading this term's courses first", () => {
  const cse = index.courses.filter((c) => c.s === "CSE");

  test("keeps every course, this term's first, and hides nothing", () => {
    const sorted = applyFilters(cse, { ...DEFAULT_FILTERS, sort: "code" });
    const { offered, other } = splitByTerm(sorted);
    assert.equal(offered.length + other.length, cse.length);
    assert.ok(offered.every((c) => c.o === 1));
    assert.ok(other.every((c) => c.o !== 1));
    // CSE opened on six courses that are not running; now its first rows are.
    assert.ok(offered.slice(0, 6).every((c) => c.o === 1));
  });

  test("each part keeps the sort, so the averages still read straight down", () => {
    const sorted = applyFilters(cse, { ...DEFAULT_FILTERS, sort: "grade" });
    for (const [name, part] of Object.entries(splitByTerm(sorted))) {
      let prev = Infinity;
      let seenBlank = false;
      for (const c of part) {
        const has = c.g != null && c.g > 0;
        if (!has) { seenBlank = true; continue; }
        assert.ok(!seenBlank, `${name}: ${c.k} has a history but sorts after one without`);
        assert.ok(c.g! <= prev, `${name}: ${c.k} (${c.g}) sorts below a lower average`);
        prev = c.g!;
      }
      // And the letters shown beside them therefore never climb back up.
      const letters = part.map((c) => typicalGrade(c.g)?.letter).filter((l): l is string => Boolean(l));
      assert.equal(letters.length, part.filter((c) => c.g != null && c.g > 0).length);
    }
  });
});
