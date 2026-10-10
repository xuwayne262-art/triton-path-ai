import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  cleanDocs, cleanPlanner, cleanRatings, cleanShortlist, DEFAULT_MAJOR, DEFAULT_MINOR, isBlankPlanner,
  type PlannerDoc,
} from "./record";

/** A course as platRowToCourse builds it. */
const course = (code: string) => ({
  id: code.toLowerCase().replace(/\s+/g, ""),
  code,
  title: `${code} title`,
  units: 4,
  departments: [code.split(" ")[0]],
  genEd: [],
  categories: ["Lower Division"],
  time: [{ day: "Mon", start: "09:00", end: "09:50" }, { day: "Wed", start: "09:00", end: "09:50" }],
});

const realPlan: PlannerDoc = {
  major: "Mathematics (BS)",
  minor: "None",
  college: "Revelle",
  schedule: [
    { course: course("CSE 11") as never, id: "cse11-1727000000000-0" },
    { course: course("MATH 20A") as never, id: "math20a-1727000000001-1" },
  ],
  planned: [
    { courseId: "cse11", course: course("CSE 11") as never, year: 1, quarter: "Fall" },
    { courseId: "cse12-1727", course: course("CSE 12") as never, year: 1, quarter: "Winter" },
  ],
  synced: ["CSE 11"],
  sections: { "CSE 11": { family: "A", parts: { DI: "A01" } }, "MATH 20A": { family: "B", parts: {} } },
};

describe("a well-formed plan", () => {
  test("passes through every cleaner unchanged", () => {
    // The sync compares what it sent with what the server kept. A cleaner that
    // rewrote good data would make every device think it had something to save.
    const docs = {
      planner: realPlan,
      shortlist: ["CSE 11", "COGS 9"],
      ratings: { "FA26::CSE 11::Politz, Joseph Gibbs": { quality: 5, difficulty: 3, again: true, at: "2026-09-28T10:00:00.000Z" } },
    };
    const roundTripped = JSON.parse(JSON.stringify(docs));
    assert.deepEqual(cleanDocs(roundTripped), roundTripped);
  });

  test("keeps Course fields the server has never heard of, bounded", () => {
    const c = { ...course("CSE 11"), color: "bg-blue-100", futureField: { nested: ["a", "b"] } };
    const p = cleanPlanner({ ...realPlan, schedule: [{ course: c, id: "x" }] });
    assert.deepEqual(p?.schedule[0].course, c);

    const deep = { ...course("CSE 12"), tooDeep: { a: { b: { c: { d: 1 } } } } };
    const q = cleanPlanner({ ...realPlan, schedule: [{ course: deep, id: "y" }] });
    assert.deepEqual((q?.schedule[0].course as unknown as { tooDeep: unknown }).tooDeep, { a: { b: {} } });
  });
});

describe("cleanPlanner", () => {
  test("refuses anything that is not an object", () => {
    for (const bad of [null, undefined, 42, "plan", [realPlan]]) assert.equal(cleanPlanner(bad), null);
  });

  test("fills a missing program with the planner's defaults and drops an unknown college", () => {
    const p = cleanPlanner({ college: "Hogwarts" });
    assert.equal(p?.major, DEFAULT_MAJOR);
    assert.equal(p?.minor, DEFAULT_MINOR);
    assert.equal(p?.college, null);
    assert.deepEqual(p?.schedule, []);
  });

  test("drops schedule entries the planner could not draw", () => {
    const p = cleanPlanner({
      schedule: [
        { course: { title: "no code" }, id: "a" },
        { course: course("CSE 11") },
        "CSE 12",
        { course: course("CSE 15L"), id: "ok" },
      ],
    });
    assert.deepEqual(p?.schedule.map((e) => e.course.code), ["CSE 15L"]);
  });

  test("keeps one entry per course, as the planner does", () => {
    const p = cleanPlanner({
      schedule: [
        { course: course("CSE 11"), id: "first" },
        { course: course("CSE 11"), id: "second" },
        { course: course("MATH 20A"), id: "first" },
      ],
    });
    assert.deepEqual(p?.schedule.map((e) => e.id), ["first"]);
  });

  test("drops four-year entries with no year or quarter to put them in", () => {
    const p = cleanPlanner({
      planned: [
        { courseId: "a", course: course("CSE 11"), year: 5, quarter: "Fall" },
        { courseId: "b", course: course("CSE 12"), year: 2, quarter: "Summer" },
        { courseId: "c", course: course("CSE 15L"), year: "2", quarter: "Fall" },
        { courseId: "d", course: course("CSE 20"), year: 2, quarter: "Spring" },
      ],
    });
    assert.deepEqual(p?.planned.map((e) => e.courseId), ["d"]);
  });

  test("keeps only section picks with a lecture family", () => {
    const p = cleanPlanner({
      sections: {
        "CSE 11": { family: "A", parts: { DI: "A01", LA: 7 } },
        "CSE 12": { parts: { DI: "B01" } },
        "CSE 20": "A",
      },
    });
    assert.deepEqual(p?.sections, { "CSE 11": { family: "A", parts: { DI: "A01" } } });
  });

  test("caps the schedule, so one account cannot store without limit", () => {
    const schedule = Array.from({ length: 500 }, (_, i) => ({ course: course(`CSE ${i}`), id: String(i) }));
    assert.equal(cleanPlanner({ schedule })?.schedule.length, 40);
  });
});

describe("cleanShortlist and cleanRatings", () => {
  test("the starred list keeps codes once, in order, and nothing else", () => {
    assert.deepEqual(cleanShortlist(["CSE 11", "", 7, "COGS 9", "CSE 11", null]), ["CSE 11", "COGS 9"]);
    assert.deepEqual(cleanShortlist("CSE 11"), []);
    assert.equal(cleanShortlist(Array.from({ length: 1000 }, (_, i) => `X ${i}`)).length, 400);
  });

  test("a rating needs a quality score; the rest is clamped", () => {
    const r = cleanRatings({
      good: { quality: 4.6, difficulty: 9, again: "yes", at: "2026-09-28T10:00:00.000Z" },
      unrated: { quality: 0, difficulty: 3 },
      junk: "five stars",
    });
    assert.deepEqual(r, { good: { quality: 5, difficulty: 5, again: null, at: "2026-09-28T10:00:00.000Z" } });
    assert.deepEqual(cleanRatings([{ quality: 5 }]), {});
  });
});

describe("cleanDocs", () => {
  test("anything that is not a plan is an empty one", () => {
    for (const bad of [null, 42, "x", []]) {
      assert.deepEqual(cleanDocs(bad), { planner: null, shortlist: [], ratings: {} });
    }
  });

  test("drops parts it does not know", () => {
    const d = cleanDocs({ shortlist: ["CSE 11"], password: "hunter2" }) as unknown as Record<string, unknown>;
    assert.deepEqual(Object.keys(d).sort(), ["planner", "ratings", "shortlist"]);
  });
});

describe("isBlankPlanner", () => {
  test("only an untouched planner is blank", () => {
    const blank = cleanPlanner({})!;
    assert.ok(isBlankPlanner(blank));
    assert.ok(isBlankPlanner(null));
    assert.ok(!isBlankPlanner({ ...blank, college: "Muir" }));
    assert.ok(!isBlankPlanner({ ...blank, major: "Mathematics (BS)" }));
    assert.ok(!isBlankPlanner({ ...blank, synced: ["CSE 11"] }));
    assert.ok(!isBlankPlanner(realPlan));
    // A term on its own says nothing about the student; a kept schedule does.
    assert.ok(isBlankPlanner({ ...blank, term: "WI27" }));
    assert.ok(!isBlankPlanner({ ...blank, past: { FA26: { schedule: realPlan.schedule, sections: {} } } }));
  });
});

describe("the term a plan's picks belong to", () => {
  const withTerms: PlannerDoc = {
    ...realPlan,
    term: "WI27",
    past: { FA26: { schedule: realPlan.schedule, sections: realPlan.sections } },
  };

  test("a plan with its term and an earlier term's picks passes through unchanged", () => {
    const roundTripped = JSON.parse(JSON.stringify(withTerms));
    assert.deepEqual(cleanPlanner(roundTripped), roundTripped);
  });

  test("a plan from before terms were recorded gains neither key", () => {
    const p = cleanPlanner(JSON.parse(JSON.stringify(realPlan)))!;
    assert.ok(!("term" in p));
    assert.ok(!("past" in p));
  });

  test("drops a term that is not a term code, and earlier terms that are not", () => {
    const p = cleanPlanner({
      ...withTerms,
      term: "Winter 2027",
      past: { "Fall 2026": withTerms.past!.FA26, SP26: "nope", WI26: { schedule: [], sections: {} }, FA26: withTerms.past!.FA26 },
    })!;
    assert.ok(!("term" in p));
    // An empty term is not worth keeping either.
    assert.deepEqual(Object.keys(p.past ?? {}), ["FA26"]);
  });

  test("cleans an earlier term's picks as strictly as this term's", () => {
    const p = cleanPlanner({
      ...withTerms,
      past: { FA26: { schedule: [{ course: { title: "no code" }, id: "x" }, ...realPlan.schedule], sections: { "CSE 11": { parts: {} } } } },
    })!;
    assert.deepEqual(p.past?.FA26.schedule, realPlan.schedule);
    assert.deepEqual(p.past?.FA26.sections, {});
  });
});
