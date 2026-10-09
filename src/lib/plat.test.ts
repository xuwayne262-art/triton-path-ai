import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  HttpError, collegeGEs, collegeName, dayLabel, geLabel, gpaTier, LETTER_SCALE, loadIndex, loadJSON, loadSubject,
  prereqKnown, ratingTone, refreshedDay, refreshedLabel, sortCourses, termName, termOrder, tidyTitle, typicalGrade,
  type CourseRow, type GEFile, type PlatIndex, type ProfessorFile, type SubjectFile,
} from "./plat";
import { COLLEGE_REQUIREMENTS } from "@/data/requirements";
import { COLLEGES } from "@/components/triton/types";

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

describe("calendar dates", () => {
  test("are written one way everywhere: \"Fri, Dec 11\"", () => {
    assert.equal(dayLabel("2026-12-11"), "Fri, Dec 11");
    assert.equal(dayLabel("2026-12-05"), "Sat, Dec 5");
    assert.equal(dayLabel("2026-08-23", { weekday: false, year: true }), "Aug 23, 2026");
  });

  test("never shift a day, whatever the time zone", () => {
    // Read as a date, not an instant: the first and last of a year stay put.
    assert.equal(dayLabel("2027-01-01"), "Fri, Jan 1");
    assert.equal(dayLabel("2026-12-31"), "Thu, Dec 31");
  });

  test("leave anything that is not a date alone", () => {
    assert.equal(dayLabel("TBA"), "TBA");
    assert.equal(dayLabel("MWF"), "MWF");
  });
});

describe("course titles", () => {
  test("space their em dashes", () => {
    assert.equal(tidyTitle("Introductory Ecology—Organisms and Habitat"), "Introductory Ecology — Organisms and Habitat");
    assert.equal(tidyTitle("Already — Spaced"), "Already — Spaced");
    assert.equal(tidyTitle("One side —closed"), "One side — closed");
  });

  test("keep en-dash ranges closed", () => {
    assert.equal(tidyTitle("The Struggle for K–12 Ethnic Studies"), "The Struggle for K–12 Ethnic Studies");
  });

  test("arrive spaced from the loaders, so every page shows them that way", async () => {
    const real = globalThis.fetch;
    globalThis.fetch = (async (url: string) => {
      const body = String(url).includes("/subject/")
        ? { code: "BIEB", name: "", term: "", termName: "", courses: { "BIEB 102": { t: "Introductory Ecology—Organisms and Habitat" } } }
        : { meta: {}, subjects: [], courses: [{ k: "BIEB 102", t: "Introductory Ecology—Organisms and Habitat" }] };
      return new Response(JSON.stringify(body), { status: 200 });
    }) as typeof fetch;
    try {
      assert.equal((await loadIndex()).courses[0].t, "Introductory Ecology — Organisms and Habitat");
      assert.equal((await loadSubject("BIEB")).courses["BIEB 102"].t, "Introductory Ecology — Organisms and Habitat");
    } finally {
      globalThis.fetch = real;
    }
  });

  test("no title in the dataset keeps a closed-up em dash once tidied", () => {
    const closed = index.courses.filter((c) => /\S—|—\S/.test(tidyTitle(c.t)));
    assert.deepEqual(closed.map((c) => c.k), []);
  });
});

describe("college names", () => {
  test("are the college's full name, from a GE key or the planner's choice", () => {
    assert.equal(collegeName("seventh"), "Seventh College");
    assert.equal(collegeName("Seventh"), "Seventh College");
    assert.equal(collegeName("ERC"), "Eleanor Roosevelt College");
  });

  test("a GE chip says whose GE it is", () => {
    assert.equal(geLabel("seventh:Alternatives · Nat Sci & Eng"), "Seventh College GE · Alternatives · Nat Sci & Eng");
  });

  test("each college's GE set has one name, in the planner's progress list too", () => {
    for (const c of COLLEGES) assert.equal(COLLEGE_REQUIREMENTS[c].groupLabel, collegeGEs(c), c);
  });

  test("a university requirement is named as UCSD names it, not as a college's GE", () => {
    assert.equal(geLabel("campus:DEI"), "University requirement · Diversity, Equity & Inclusion (DEI)");
    assert.equal(geLabel("campus:AHI"), "University requirement · American History & Institutions (AHI)");
  });
});

describe("terms", () => {
  test("are named in full and ordered through the academic year", () => {
    assert.equal(termName("FA25"), "Fall 2025");
    assert.equal(termName("WI26"), "Winter 2026");
    const order = ["FA26", "WI26", "SP26", "FA25"].sort((a, b) => termOrder(a) - termOrder(b));
    assert.deepEqual(order, ["FA25", "WI26", "SP26", "FA26"]);
  });

  test("the schedule's refresh is dated in San Diego", () => {
    assert.equal(refreshedDay("2026-09-25 15:53:24+00"), "2026-09-25");
    assert.equal(refreshedDay("2026-09-26 02:00:00+00"), "2026-09-25");
    assert.equal(refreshedDay(null), null);
  });
});

describe("the dataset's people and history", () => {
  const read = <T,>(p: string) => JSON.parse(readFileSync(new URL(`../../public/data/plat/${p}`, import.meta.url), "utf8")) as T;
  const cse = read<SubjectFile>("subject/CSE.json");
  const profs = read<ProfessorFile>("professors.json").professors;

  test("a current instructor known by another name keeps their history", () => {
    // CSE 12 said Paul Cao had "no published record" when the archive holds
    // fourteen terms of it under his registered name, Yingjun Cao.
    const cao = cse.courses["CSE 12"].profs.find((p) => p.i === "Paul Cao");
    assert.ok(cao, "Paul Cao is listed");
    assert.equal(cao.cur, 1);
    assert.ok(cao.n >= 14, `${cao.n} terms`);
    assert.ok(!cse.courses["CSE 12"].profs.some((p) => p.i === "Yingjun Cao"), "not listed twice");
    const rec = profs.find((p) => p.n === "Paul Cao");
    assert.ok(rec?.a?.includes("Yingjun Cao"), "searchable by the registered name");
    assert.ok(!rec?.a?.includes("Penghui Cao"), "a different person is not folded in");
  });

  test("no one teaching in CSE this term is listed twice under two spellings", () => {
    const now = profs.filter((p) => p.c.some(([code, , , cur]) => cur === 1 && code.startsWith("CSE ")));
    const key = (n: string) => {
      const w = n.toLowerCase().replace(/[^a-z ]/g, " ").trim().split(/\s+/);
      return `${w[0]}|${w.at(-1)}`;
    };
    const seen = new Map<string, string>();
    for (const p of now) {
      const k = key(p.n);
      assert.ok(!seen.has(k), `${p.n} and ${seen.get(k)}`);
      seen.set(k, p.n);
    }
  });

  test("every term row points at an instructor on the course, newest first", () => {
    for (const [code, c] of Object.entries(cse.courses)) {
      const hist = c.hist ?? [];
      for (let i = 0; i < hist.length; i++) {
        assert.ok(c.profs[hist[i][1]], `${code}: row ${i} names no instructor`);
        if (i) assert.ok(termOrder(hist[i][0]) <= termOrder(hist[i - 1][0]), `${code}: ${hist[i][0]} after ${hist[i - 1][0]}`);
      }
    }
    assert.ok((cse.courses["CSE 12"].hist ?? []).length >= 30);
  });

  test("courses carry the catalog's own description, without the prerequisite sentence", () => {
    const desc = cse.courses["CSE 12"].desc ?? "";
    assert.match(desc, /^Use and implementation of basic data structures/);
    assert.doesNotMatch(desc, /Prerequisites?:/);
  });

  test("the university requirements come with the lists UCSD publishes", () => {
    const ge = read<GEFile>("ge.json");
    assert.ok(ge.lists["campus:AHI"].includes("HILD 2A"));
    assert.ok(ge.lists["campus:AHI"].includes("POLI 10D"), "POLI 10 is listed under its current code");
    assert.ok(ge.lists["campus:DEI"].includes("CSE 194"));
    assert.ok(!ge.lists["campus:DEI"].includes("CSE 12"), "a prerequisite named in the Senate list is not a DEI course");
    assert.ok(ge.meta.campus?.dei.url.startsWith("https://senate.ucsd.edu/"));
  });
});
