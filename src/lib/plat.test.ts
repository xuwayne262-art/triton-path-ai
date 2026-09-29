import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  HttpError, gpaTier, LETTER_SCALE, loadJSON, prereqKnown, ratingTone, refreshedLabel, sortCourses,
  typicalGrade, type CourseRow, type PlatIndex,
} from "./plat";

/** The dataset the site serves, so these checks cover every real course. */
const index = JSON.parse(readFileSync(new URL("../../public/data/plat/index.json", import.meta.url), "utf8")) as PlatIndex;

const row = (k: string, over: Partial<CourseRow> = {}): CourseRow => ({
  k, s: k.split(" ")[0], c: k.split(" ")[1], t: k, u: "4", g: null, a: null, r: 0, o: 1, pr: 0,
  sa: null, sl: null, d: null, st: null, en: null, b: null,
  p: null, pq: null, pn: null, pa: null, pd: null, pg: null,
  ...over,
});

/** A letter's place in the scale: 0 for A, 1 for A−, and so on. */
const rank = (letter: string) => LETTER_SCALE.findIndex(([, l]) => l === letter);

describe("the letter on a badge", () => {
  test("is the nearest UCSD grade point, cut at the midpoints", () => {
    const cases: [number, string][] = [
      [4, "A"], [3.85, "A"], [3.849, "A−"], [3.5, "A−"], [3.499, "B+"], [3.15, "B+"], [3.149, "B"],
      [2.85, "B"], [2.849, "B−"], [2.5, "B−"], [2.499, "C+"], [2.15, "C+"], [2.149, "C"],
      [1.85, "C"], [1.849, "C−"], [1.5, "C−"], [1.499, "D+"], [1.15, "D+"], [0.85, "D"], [0.849, "D−"],
      [0.35, "D−"], [0.2, "F"],
    ];
    for (const [gpa, letter] of cases) assert.equal(typicalGrade(gpa)?.letter, letter, `GPA ${gpa}`);
  });

  test("has exactly one colour per letter, across every GPA", () => {
    // A B+ used to be green from 3.40 and amber below it; A−, B and B− were
    // split the same way.
    const colours = new Map<string, Set<string>>();
    for (let i = 1; i <= 4000; i++) {
      const v = typicalGrade(i / 1000)!;
      if (!colours.has(v.letter)) colours.set(v.letter, new Set());
      colours.get(v.letter)!.add(v.tier.pill);
      assert.equal(gpaTier(i / 1000), v.tier, "a bare GPA wears its letter's colour");
    }
    for (const [letter, set] of colours) assert.equal(set.size, 1, `${letter} has ${set.size} colours`);
  });

  test("gets no warmer as the grade goes down", () => {
    const order = LETTER_SCALE.map(([, , tier]) => tier.label);
    const seen: string[] = [];
    for (const label of order) if (seen.at(-1) !== label) seen.push(label);
    assert.deepEqual(seen, ["Very generous", "Generous", "Average", "Tough", "Brutal"]);
  });

  test("is nothing at all without a history, and flagged when one term is all there is", () => {
    assert.equal(typicalGrade(null), null);
    assert.equal(typicalGrade(0), null);
    assert.equal(typicalGrade(3.9, 1)?.thin, true);
    assert.equal(typicalGrade(3.9, 2)?.thin, false);
  });
});

describe("sorting by best grades", () => {
  test("reads straight down: letters, colours and GPAs all descend, no history last", () => {
    const check = (label: string, rows: CourseRow[]) => {
      const sorted = sortCourses(rows, "grade");
      let prev = Infinity;
      let seenNone = false;
      for (const c of sorted) {
        if (c.g == null || c.g <= 0) { seenNone = true; continue; }
        assert.ok(!seenNone, `${label}: ${c.k} has a history but sorts after one without`);
        assert.ok(c.g <= prev, `${label}: ${c.k} (${c.g}) sorts below a lower average`);
        prev = c.g;
      }
    };
    check("all courses", index.courses);
    for (const s of index.subjects) check(s.code, index.courses.filter((c) => c.s === s.code));
  });

  test("puts a one-term A above a B+, rather than pulling it toward the middle", () => {
    const chem = sortCourses(index.courses.filter((c) => c.s === "CHEM" && c.o), "grade").map((c) => c.k);
    assert.ok(chem.indexOf("CHEM 163") < chem.indexOf("CHEM 116"), "CHEM 163 (A, 1 term) above CHEM 116 (B+)");
    const letters = sortCourses(index.courses.filter((c) => c.s === "CHEM"), "grade")
      .map((c) => typicalGrade(c.g)?.letter)
      .filter((l): l is string => Boolean(l));
    for (let i = 1; i < letters.length; i++) {
      assert.ok(rank(letters[i]) >= rank(letters[i - 1]), `${letters[i - 1]} then ${letters[i]}`);
    }
  });

  test("breaks a tie on the average with the longer history, then the course code", () => {
    const sorted = sortCourses([
      row("CSE 12", { g: 3.5, r: 2 }), row("CSE 11", { g: 3.5, r: 2 }), row("CSE 8A", { g: 3.5, r: 9 }),
    ], "grade");
    assert.deepEqual(sorted.map((c) => c.k), ["CSE 8A", "CSE 11", "CSE 12"]);
  });
});

describe("sorting by professor rating", () => {
  test("highest rating first, more ratings breaking ties, unrated last", () => {
    const sorted = sortCourses([
      row("A 1"), row("B 1", { pq: 4.5, pn: 10 }), row("C 1", { pq: 4.9, pn: 3 }),
      row("D 1", { pq: 4.5, pn: 200 }), row("E 1", { pq: 0 }),
    ], "rating");
    assert.deepEqual(sorted.map((c) => c.k), ["C 1", "D 1", "B 1", "A 1", "E 1"]);
  });
});

describe("what the dataset knows about prerequisites", () => {
  test("is known for catalog courses and this term's courses, not retired ones", () => {
    assert.equal(prereqKnown(row("CHEM 118", { o: 0 })), true, "in the catalog, not offered");
    assert.equal(prereqKnown(row("CSE 199Z", { ct: 0, o: 1 })), true, "new this term, off-catalog");
    assert.equal(prereqKnown(row("CHEM 140A", { ct: 0, o: 0 })), false, "retired");
  });

  test("the dataset marks only courses the catalog does not list", () => {
    const c118 = index.courses.find((c) => c.k === "CHEM 118")!;
    const c140 = index.courses.find((c) => c.k === "CHEM 140A")!;
    assert.equal(c118.ct, undefined);
    assert.equal(c140.ct, 0);
  });
});

describe("rating colours", () => {
  test("are one rule everywhere", () => {
    assert.match(ratingTone(4.8), /emerald/);
    assert.match(ratingTone(4), /emerald/);
    assert.match(ratingTone(3.9), /amber/);
    assert.match(ratingTone(3), /amber/);
    assert.match(ratingTone(2.9), /red/);
    assert.equal(ratingTone(null), "text-gray-400");
  });
});

describe("loading the dataset", () => {
  test("a failed request is not remembered, so asking again tries again", async () => {
    const real = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      if (calls === 1) throw new TypeError("network down");
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch;
    try {
      await assert.rejects(loadJSON("/data/plat/test-retry.json"), TypeError);
      assert.deepEqual(await loadJSON("/data/plat/test-retry.json"), { ok: true });
      // A success is still fetched once and then served from memory.
      await loadJSON("/data/plat/test-retry.json");
      assert.equal(calls, 2);
    } finally {
      globalThis.fetch = real;
    }
  });

  test("an error status says which one, so a missing file is told from a dropped one", async () => {
    const real = globalThis.fetch;
    globalThis.fetch = (async () => new Response("", { status: 404 })) as typeof fetch;
    try {
      await assert.rejects(loadJSON("/data/plat/subject/NOPE.json"), (err: unknown) =>
        err instanceof HttpError && err.status === 404);
    } finally {
      globalThis.fetch = real;
    }
  });
});

describe("the schedule's refresh date", () => {
  test("reads the timestamp the build writes, in San Diego time", () => {
    assert.equal(refreshedLabel("2026-09-25 15:53:24+00"), "Sep 25, 2026");
    // Just after midnight UTC is still the day before in San Diego.
    assert.equal(refreshedLabel("2026-09-26 02:00:00+00"), "Sep 25, 2026");
    assert.equal(refreshedLabel(index.meta.refreshed), "Sep 25, 2026");
  });

  test("says nothing rather than something wrong", () => {
    assert.equal(refreshedLabel(null), null);
    assert.equal(refreshedLabel("soon"), null);
  });
});
