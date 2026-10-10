import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_MAJOR, DEFAULT_MINOR, MAX_PAST_TERMS, type PlannerDoc } from "./record";
import { inTerm, LEGACY_TERM, laterTerm, termLabel, termOf, termRank } from "./term";

const course = (code: string) => ({
  id: code.toLowerCase().replace(/\s+/g, ""), code, title: code, units: 4, departments: [code.split(" ")[0]],
});
const on = (code: string) => ({ course: course(code) as never, id: `${code}#1` });

const plan = (codes: string[], over: Partial<PlannerDoc> = {}): PlannerDoc => ({
  major: "Mathematics (BS)", minor: DEFAULT_MINOR, college: "Muir",
  schedule: codes.map(on),
  planned: [{ courseId: "cse12", course: course("CSE 12") as never, year: 2, quarter: "Winter" }],
  synced: ["CSE 11"],
  sections: Object.fromEntries(codes.map((c) => [c, { family: "A", parts: { DI: "A01" } }])),
  ...over,
});

describe("termRank and laterTerm", () => {
  test("put terms in calendar order across years, summer sessions between Spring and Fall", () => {
    const order = ["SP26", "S126", "S226", "FA26", "WI27", "SP27", "S327", "FA27"];
    const shuffled = ["FA27", "WI27", "S226", "SP26", "FA26", "S327", "SP27", "S126"];
    assert.deepEqual([...shuffled].sort((a, b) => termRank(a) - termRank(b)), order);
    assert.equal(laterTerm("FA26", "WI27"), "WI27");
    assert.equal(laterTerm("WI27", "FA26"), "WI27");
    assert.equal(termRank("Fall 2026"), -1);
  });

  test("termLabel names a term the dataset no longer does", () => {
    assert.equal(termLabel("WI27"), "Winter 2027");
    assert.equal(termLabel("S127"), "Summer Session I 2027");
    assert.equal(termLabel("XX"), "XX");
  });
});

describe("inTerm", () => {
  test("a plan already in the term is returned as it is", () => {
    const p = plan(["CSE 11"], { term: "FA26" });
    assert.equal(inTerm(p, "FA26"), p);
  });

  test("a plan saved before terms were recorded is Fall 2026's, and only gains the stamp", () => {
    const p = plan(["CSE 11"]);
    assert.equal(termOf(p), LEGACY_TERM);
    const stamped = inTerm(p, LEGACY_TERM);
    assert.deepEqual(stamped, { ...p, term: "FA26" });
  });

  test("moving to the next term puts this term's picks away and starts empty", () => {
    const p = plan(["CSE 11", "MATH 20A"], { term: "FA26" });
    const moved = inTerm(p, "WI27");
    assert.equal(moved.term, "WI27");
    assert.deepEqual(moved.schedule, []);
    assert.deepEqual(moved.sections, {});
    assert.deepEqual(moved.past, { FA26: { schedule: p.schedule, sections: p.sections } });
    // Nothing else about the plan changes: the four-year plan, the program, the synced list.
    assert.deepEqual(
      { ...moved, term: undefined, schedule: undefined, sections: undefined, past: undefined },
      { ...p, term: undefined, schedule: undefined, sections: undefined, past: undefined },
    );
  });

  test("a legacy plan meeting Winter's schedule is put away as Fall 2026's", () => {
    const moved = inTerm(plan(["CSE 11"]), "WI27");
    assert.deepEqual(Object.keys(moved.past ?? {}), ["FA26"]);
    assert.equal(moved.past?.FA26.sections["CSE 11"].parts.DI, "A01");
  });

  test("moving back to a term whose picks were kept brings them back", () => {
    const fall = plan(["CSE 11"], { term: "FA26" });
    const winter = { ...inTerm(fall, "WI27"), schedule: [on("CSE 12")], sections: { "CSE 12": { family: "B", parts: {} } } };
    const back = inTerm(winter, "FA26");
    assert.deepEqual(back.schedule, fall.schedule);
    assert.deepEqual(back.sections, fall.sections);
    assert.deepEqual(Object.keys(back.past ?? {}), ["WI27"]);
    assert.deepEqual(back.past?.WI27.schedule, [on("CSE 12")]);
  });

  test("an empty term is not kept, and no past is written for nothing", () => {
    const moved = inTerm(plan([], { term: "FA26" }), "WI27");
    assert.equal(moved.past, undefined);
    assert.ok(!("past" in moved));
  });

  test(`keeps at most ${MAX_PAST_TERMS} earlier terms, the latest`, () => {
    let p = plan(["CSE 11"], { term: "FA25" });
    for (const next of ["WI26", "SP26", "FA26", "WI27"]) p = { ...inTerm(p, next), schedule: [on("CSE 11")] };
    assert.deepEqual(Object.keys(p.past ?? {}).sort((a, b) => termRank(b) - termRank(a)), ["FA26", "SP26", "WI26"]);
  });

  test("refuses anything that is not a term code", () => {
    const p = plan(["CSE 11"], { term: "FA26" });
    assert.equal(inTerm(p, ""), p);
    assert.equal(inTerm(p, "Winter 2027"), p);
  });

  test("leaves a blank plan blank", () => {
    const blank: PlannerDoc = {
      major: DEFAULT_MAJOR, minor: DEFAULT_MINOR, college: null, schedule: [], planned: [], synced: [], sections: {},
    };
    assert.deepEqual(inTerm(blank, "WI27"), { ...blank, term: "WI27" });
  });
});
