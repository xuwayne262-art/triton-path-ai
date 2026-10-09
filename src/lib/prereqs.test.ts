import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { prereqCodes, prereqSegments } from "./prereqs";
import type { PlatIndex, SubjectFile } from "./plat";

describe("reading course codes out of a prerequisite sentence", () => {
  test("a bare number joined by 'or' or 'and' keeps the subject before it", () => {
    assert.deepEqual(prereqCodes("CHEM 6A or 6AH."), ["CHEM 6A", "CHEM 6AH"]);
    assert.deepEqual(prereqCodes("ECON 1 and MATH 10C or 20C or 31BH."), ["ECON 1", "MATH 10C", "MATH 20C", "MATH 31BH"]);
    assert.deepEqual(prereqCodes("CSE 12 and 15L"), ["CSE 12", "CSE 15L"]);
  });

  test("a sequence written with dashes names each course in it", () => {
    assert.deepEqual(prereqCodes("MATH 20A-B"), ["MATH 20A", "MATH 20B"]);
    assert.deepEqual(prereqCodes("PHYS 2A–B–C"), ["PHYS 2A", "PHYS 2B", "PHYS 2C"]);
  });

  test("a number that nothing joins to a code is not a course", () => {
    assert.deepEqual(
      prereqCodes("AP Calculus AB score of 3 (or equivalent AB subscore on BC exam), or MATH 4C, or MATH 10A"),
      ["MATH 4C", "MATH 10A"],
    );
    assert.deepEqual(prereqCodes("MATH 20C and 2 years of calculus"), ["MATH 20C"]);
    assert.deepEqual(prereqCodes("upper-division standing"), []);
    assert.deepEqual(prereqCodes(null), []);
  });

  test("cutting the sentence into pieces loses nothing", () => {
    for (const text of [
      "CSE 21 or MATH 154 or MATH 158 and CSE 12 and CSE 15L or CSE 29; restricted to undergraduates.",
      "CHEM 6A or 6AH.",
      "PHYS 2A–B–C with a grade of C– or better",
    ]) {
      assert.equal(prereqSegments(text).map((s) => s.text).join(""), text);
    }
    const linked = prereqSegments("CHEM 6A or 6AH.").filter((s) => s.code);
    assert.deepEqual(linked.map((s) => [s.text, s.code]), [["CHEM 6A", "CHEM 6A"], ["6AH", "CHEM 6AH"]]);
  });
});

describe("\"Leads to\" in the dataset", () => {
  const dir = new URL("../../public/data/plat/", import.meta.url);
  const index = JSON.parse(readFileSync(new URL("index.json", dir), "utf8")) as PlatIndex;
  const subjects = readdirSync(new URL("subject/", dir)).map(
    (f) => JSON.parse(readFileSync(new URL(`subject/${f}`, dir), "utf8")) as SubjectFile,
  );
  const courses = new Map(subjects.flatMap((s) => Object.entries(s.courses)));
  const row = new Map(index.courses.map((c) => [c.k, c]));

  test("is exactly the reverse of every current course's prerequisites, read the app's way", () => {
    // The build reads prerequisites with its own copy of the rule; this holds
    // the two to the same answer over every course UCSD lists.
    const expected = new Map<string, Set<string>>();
    for (const [code, c] of courses) {
      const r = row.get(code);
      if (!r || !(r.ct !== 0 || r.o === 1)) continue;
      for (const ref of prereqCodes(c.pre)) {
        if (ref === code || !courses.has(ref)) continue;
        if (!expected.has(ref)) expected.set(ref, new Set());
        expected.get(ref)!.add(code);
      }
    }
    for (const [code, c] of courses) {
      assert.deepEqual(new Set(c.unl ?? []), expected.get(code) ?? new Set(), code);
    }
  });

  test("CSE 12 leads to the courses that build on it", () => {
    const unl = courses.get("CSE 12")?.unl ?? [];
    for (const next of ["CSE 100", "CSE 101", "CSE 105"]) assert.ok(unl.includes(next), next);
  });
});
