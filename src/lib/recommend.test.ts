import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { COLLEGE_CORE, shelfEligible } from "./recommend";
import { levelBand, sortCourses, type PlatIndex } from "./plat";

const index = JSON.parse(
  readFileSync(new URL("../../public/data/plat/index.json", import.meta.url), "utf8"),
) as PlatIndex;
const shelf = sortCourses(index.courses.filter(shelfEligible), "grade");

describe("the home page's recommendations", () => {
  test("leave out a thesis that passes the old size rule (PSYC 194A, Honors Thesis I)", () => {
    const thesis = index.courses.find((c) => c.k === "PSYC 194A");
    if (thesis) assert.equal(shelfEligible(thesis), false);
    // Whole words: CHEM 41C "Synthesis" is an ordinary lecture.
    assert.ok(!shelf.some((c) => /\b(thesis|honors?)\b/i.test(c.t)));
  });

  test("every course on the shelf meets each criterion the page states", () => {
    assert.ok(shelf.length >= 6, `${shelf.length} eligible`);
    for (const c of shelf) {
      assert.equal(c.o, 1, c.k);
      assert.ok((c.sl ?? 0) >= 40, c.k);
      assert.ok(c.r >= 3, c.k);
      assert.ok(parseFloat(c.u ?? "0") >= 3, c.k);
      assert.ok(levelBand(c) < 2, c.k);
      assert.ok(!COLLEGE_CORE.has(c.s), c.k);
      assert.doesNotMatch(c.t, /capstone|practicum|internship|research|independent study/i, c.k);
    }
  });

  test("read in the order of the averages they show", () => {
    for (let i = 1; i < shelf.length; i++) assert.ok((shelf[i - 1].g ?? 0) >= (shelf[i].g ?? 0));
  });
});
