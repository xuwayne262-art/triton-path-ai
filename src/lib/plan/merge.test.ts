import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { adoptLegacy, mergeDocs, sameJson } from "./merge";
import { DEFAULT_MAJOR, DEFAULT_MINOR, type PlanDocs, type PlannerDoc, type TermRating } from "./record";

const course = (code: string) => ({
  id: code.toLowerCase().replace(/\s+/g, ""), code, title: code, units: 4, departments: [code.split(" ")[0]],
});

/** A schedule entry; the id is per instance, as the planner makes them. */
const on = (code: string, id = `${code}#1`) => ({ course: course(code) as never, id });

const planner = (codes: string[], over: Partial<PlannerDoc> = {}): PlannerDoc => ({
  major: DEFAULT_MAJOR, minor: DEFAULT_MINOR, college: null,
  schedule: codes.map((c) => on(c)), planned: [], synced: [], sections: {},
  ...over,
});

const docs = (p: PlannerDoc | null, shortlist: string[] = [], ratings: Record<string, TermRating> = {}): PlanDocs =>
  ({ planner: p, shortlist, ratings });

const codesOf = (d: PlanDocs) => d.planner?.schedule.map((e) => e.course.code);

describe("sameJson", () => {
  test("ignores key order and keys holding undefined, but not array order", () => {
    assert.ok(sameJson({ a: 1, b: [1, 2] }, { b: [1, 2], a: 1 }));
    assert.ok(sameJson({ a: 1, time: undefined }, { a: 1 }));
    assert.ok(!sameJson([1, 2], [2, 1]));
    assert.ok(!sameJson({ a: null }, {}));
    assert.ok(!sameJson({ a: 1 }, { a: "1" }));
  });
});

describe("mergeDocs: this device's edits folded into another device's save", () => {
  test("courses added on each side are all kept, theirs first", () => {
    const base = docs(planner(["CSE 11"]));
    const local = docs(planner(["CSE 11", "MATH 20A"]));
    const remote = docs(planner(["CSE 11", "PHYS 2A"]));
    assert.deepEqual(codesOf(mergeDocs(base, local, remote)), ["CSE 11", "PHYS 2A", "MATH 20A"]);
  });

  test("a removal on either side sticks — a stale copy does not bring it back", () => {
    const base = docs(planner(["CSE 11", "MATH 20A"]));
    const both = docs(planner(["CSE 11", "MATH 20A"]));
    const without = docs(planner(["CSE 11"]));
    assert.deepEqual(codesOf(mergeDocs(base, without, both)), ["CSE 11"], "removed here");
    assert.deepEqual(codesOf(mergeDocs(base, both, without)), ["CSE 11"], "removed there");
  });

  test("the same course added on both sides is kept once", () => {
    const base = docs(planner([]));
    const local = docs(planner([], { schedule: [on("CSE 12", "mine")] }));
    const remote = docs(planner([], { schedule: [on("CSE 12", "theirs")] }));
    const merged = mergeDocs(base, local, remote);
    assert.deepEqual(merged.planner?.schedule.map((e) => e.id), ["theirs"]);
  });

  test("a setting changed on one side wins; changed on both, this device's wins", () => {
    const base = docs(planner([], { major: "Physics (BS)" }));
    const same = docs(planner([], { major: "Physics (BS)" }));
    const math = docs(planner([], { major: "Mathematics (BS)" }));
    const bio = docs(planner([], { major: "Biology (BS)" }));
    assert.equal(mergeDocs(base, math, same).planner?.major, "Mathematics (BS)");
    assert.equal(mergeDocs(base, same, bio).planner?.major, "Biology (BS)");
    assert.equal(mergeDocs(base, math, bio).planner?.major, "Mathematics (BS)");
  });

  test("a course moved in the four-year plan keeps the move from whichever side made it", () => {
    const at = (quarter: "Fall" | "Winter") =>
      docs(planner([], { planned: [{ courseId: "p1", course: course("CSE 12") as never, year: 1, quarter }] }));
    assert.equal(mergeDocs(at("Fall"), at("Winter"), at("Fall")).planner?.planned[0].quarter, "Winter");
    assert.equal(mergeDocs(at("Fall"), at("Fall"), at("Winter")).planner?.planned[0].quarter, "Winter");
  });

  test("section picks merge course by course, and clearing one counts", () => {
    const pickA = { family: "A", parts: {} };
    const pickB = { family: "B", parts: {} };
    const base = docs(planner([], { sections: { "CSE 11": pickA } }));
    const local = docs(planner([], { sections: {} }));
    const remote = docs(planner([], { sections: { "CSE 11": pickA, "MATH 20A": pickB } }));
    assert.deepEqual(mergeDocs(base, local, remote).planner?.sections, { "MATH 20A": pickB });
  });

  test("stars and ratings merge the same way", () => {
    const r = (quality: number): TermRating => ({ quality, difficulty: 0, again: null, at: "2026-09-01T00:00:00.000Z" });
    const base = docs(null, ["CSE 11", "COGS 9"], { a: r(3) });
    const local = docs(null, ["CSE 11", "MATH 18"], { a: r(3), b: r(5) });
    const remote = docs(null, ["CSE 11", "COGS 9", "PHYS 2A"], { a: r(1) });
    const merged = mergeDocs(base, local, remote);
    assert.deepEqual(merged.shortlist, ["CSE 11", "PHYS 2A", "MATH 18"]);
    assert.deepEqual(merged.ratings, { a: r(1), b: r(5) });
  });

  test("a device that never opened the planner takes the account's", () => {
    const remote = docs(planner(["CSE 11"]));
    assert.deepEqual(mergeDocs(docs(null), docs(null), remote).planner, remote.planner);
  });

  test("which starred courses were placed only ever grows", () => {
    const base = docs(planner([], { synced: ["CSE 11"] }));
    const local = docs(planner([], { synced: ["CSE 11", "MATH 18"] }));
    const remote = docs(planner([], { synced: ["CSE 11", "COGS 9"] }));
    assert.deepEqual(mergeDocs(base, local, remote).planner?.synced, ["CSE 11", "COGS 9", "MATH 18"]);
  });
});

describe("adoptLegacy: a device's plan from before syncing meets the account's", () => {
  test("nothing on either side is lost, and the account's copy of a course stands", () => {
    const local = docs(planner([], {
      schedule: [on("CSE 11", "laptop"), on("MATH 20A", "laptop")],
      sections: { "CSE 11": { family: "B", parts: {} }, "MATH 20A": { family: "C", parts: {} } },
    }), ["CSE 11", "MATH 18"]);
    const remote = docs(planner([], {
      schedule: [on("CSE 11", "phone"), on("PHYS 2A", "phone")],
      sections: { "CSE 11": { family: "A", parts: {} } },
    }), ["COGS 9"]);
    const merged = adoptLegacy(local, remote);
    assert.deepEqual(merged.planner?.schedule.map((e) => `${e.course.code}@${e.id}`), [
      "CSE 11@phone", "PHYS 2A@phone", "MATH 20A@laptop",
    ]);
    assert.deepEqual(merged.planner?.sections, {
      "CSE 11": { family: "A", parts: {} },
      "MATH 20A": { family: "C", parts: {} },
    });
    assert.deepEqual(merged.shortlist, ["COGS 9", "CSE 11", "MATH 18"]);
  });

  test("the account's program stands, unless it was never chosen there", () => {
    const math = docs(planner([], { major: "Mathematics (BS)", college: "Muir" }));
    const untouched = docs(planner(["CSE 11"]));
    const physics = docs(planner([], { major: "Physics (BS)", college: "Warren" }));
    assert.equal(adoptLegacy(math, untouched).planner?.major, "Mathematics (BS)");
    assert.equal(adoptLegacy(math, untouched).planner?.college, "Muir");
    assert.equal(adoptLegacy(math, physics).planner?.major, "Physics (BS)");
    assert.equal(adoptLegacy(math, physics).planner?.college, "Warren");
  });

  test("an untouched device changes nothing", () => {
    const remote = docs(planner(["CSE 11"], {
      major: "Mathematics (BS)", sections: { "CSE 11": { family: "A", parts: {} } }, synced: ["CSE 11"],
    }), ["CSE 11"]);
    assert.ok(sameJson(adoptLegacy(docs(planner([])), remote), remote));
  });

  test("devices on different terms meet in the later one, each term's picks kept apart", () => {
    // A laptop still holding Fall's schedule meets an account a phone already moved to Winter.
    const laptop = docs(planner(["CSE 11"], { sections: { "CSE 11": { family: "A", parts: { DI: "A01" } } } }));
    const phone = docs(planner(["CSE 12"], { term: "WI27", sections: { "CSE 12": { family: "B", parts: {} } } }));
    const merged = adoptLegacy(laptop, phone).planner!;
    assert.equal(merged.term, "WI27");
    assert.deepEqual(merged.schedule.map((e) => e.course.code), ["CSE 12"]);
    assert.deepEqual(merged.sections, { "CSE 12": { family: "B", parts: {} } });
    assert.deepEqual(merged.past?.FA26.sections, { "CSE 11": { family: "A", parts: { DI: "A01" } } });
  });

  test("the same instructor rated on both devices keeps the later rating", () => {
    const at = (quality: number, when: string): TermRating => ({ quality, difficulty: 0, again: null, at: when });
    const local = docs(null, [], { k: at(5, "2026-09-20T00:00:00.000Z"), mine: at(2, "2026-09-01T00:00:00.000Z") });
    const remote = docs(null, [], { k: at(1, "2026-09-10T00:00:00.000Z") });
    const merged = adoptLegacy(local, remote);
    assert.equal(merged.ratings.k.quality, 5);
    assert.equal(merged.ratings.mine.quality, 2);
  });
});

describe("mergeDocs across a change of term", () => {
  test("a stale device's edits to last term land in last term's kept picks, not in this term's", () => {
    const base = docs(planner(["CSE 11"], { term: "FA26" }));
    // The laptop added MATH 20A to Fall before it heard the account moved on.
    const laptop = docs(planner(["CSE 11", "MATH 20A"], { term: "FA26" }));
    // The phone loaded Winter's schedule, which put Fall away, then added CSE 12.
    const phone = docs(planner(["CSE 12"], {
      term: "WI27",
      past: { FA26: { schedule: [on("CSE 11")], sections: {} } },
    }));
    const merged = mergeDocs(base, laptop, phone).planner!;
    assert.equal(merged.term, "WI27");
    assert.deepEqual(merged.schedule.map((e) => e.course.code), ["CSE 12"]);
    assert.deepEqual(merged.past?.FA26.schedule.map((e) => e.course.code), ["CSE 11", "MATH 20A"]);
  });

  test("devices that agree on the term keep it, and keep both sides' earlier terms", () => {
    const base = docs(planner([], { term: "WI27" }));
    const local = docs(planner(["CSE 12"], { term: "WI27", past: { FA26: { schedule: [on("CSE 11")], sections: {} } } }));
    const remote = docs(planner([], { term: "WI27" }));
    const merged = mergeDocs(base, local, remote).planner!;
    assert.equal(merged.term, "WI27");
    assert.deepEqual(Object.keys(merged.past ?? {}), ["FA26"]);
    assert.deepEqual(merged.schedule.map((e) => e.course.code), ["CSE 12"]);
  });
});
