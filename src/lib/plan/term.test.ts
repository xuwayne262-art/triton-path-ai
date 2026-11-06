import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_MAJOR, DEFAULT_MINOR, MAX_PAST_TERMS, type PlannerDoc } from "./record";
import { canonical, canonicalTerm, commuteTerm, inTerm, LEGACY_TERM, laterTerm, picksFor, termLabel, termOf, termRank } from "./term";

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

describe("two quarters at once", () => {
  // What a device shows is a view of one stored document; see canonical().
  const fall = (codes: string[]) => plan(codes, { term: "FA26" });

  test("switching to Winter and back to Fall returns Fall's exact picks", () => {
    const start = fall(["CSE 11", "MATH 20A"]);
    const winter = { ...inTerm(start, "WI27"), schedule: [on("ECON 110B")], sections: { "ECON 110B": { family: "B", parts: { DI: "B02" } } } };
    const back = inTerm(winter, "FA26");
    assert.deepEqual(back.schedule, start.schedule);
    assert.deepEqual(back.sections, start.sections);
    assert.deepEqual(picksFor(back, "WI27").schedule.map((e) => e.course.code), ["ECON 110B"]);
    assert.deepEqual(back.planned, start.planned, "the four-year plan is not a quarter's");
  });

  test("every device stores the same document, whichever quarter it shows", () => {
    const stored = canonical({ ...inTerm(fall(["CSE 11"]), "WI27"), schedule: [on("ECON 110B")], sections: {} });
    const onFall = inTerm(stored, "FA26");
    const onWinter = inTerm(stored, "WI27");
    assert.equal(canonicalTerm(stored), "WI27");
    assert.deepEqual(canonical(onFall), canonical(onWinter));
    assert.deepEqual(canonical(onFall), stored);
  });

  test("looking at a quarter with no picks changes nothing that is stored", () => {
    const stored = canonical(fall(["CSE 11"]));
    assert.deepEqual(canonical(inTerm(stored, "WI27")), stored);
    assert.equal(canonicalTerm(inTerm(stored, "WI27")), "FA26");
  });

  test("a plan saved before plans recorded a term is Fall 2026's", () => {
    const legacy = plan(["CSE 11"]);
    assert.equal(canonicalTerm(legacy), LEGACY_TERM);
    assert.deepEqual(picksFor(inTerm(legacy, "WI27"), "FA26").schedule.map((e) => e.course.code), ["CSE 11"]);
  });
});

describe("commuteTerm", () => {
  const quarters = [
    { code: "FA26", name: "Fall 2026", rooms: true },
    { code: "WI27", name: "Winter 2027", rooms: false },
  ];
  const doc = (fall: string[], winter: string[]): PlannerDoc =>
    plan(winter, { term: "WI27", past: fall.length ? { FA26: { schedule: fall.map(on), sections: {} } } : undefined });

  test("uses the newest quarter with rooms, and names a newer one without", () => {
    assert.deepEqual(commuteTerm(doc(["CSE 12"], ["CSE 15L"]), quarters), { term: "FA26", passedOver: "Winter 2027" });
  });
  test("a plan with only Fall courses says nothing about Winter", () => {
    assert.deepEqual(commuteTerm(doc(["CSE 12"], []), quarters), { term: "FA26", passedOver: null });
  });
  test("no plan: the newest quarter with rooms", () => {
    assert.deepEqual(commuteTerm(null, quarters), { term: "FA26", passedOver: null });
  });
  test("once Winter lists rooms, Winter is used", () => {
    const later = quarters.map((q) => ({ ...q, rooms: true }));
    assert.deepEqual(commuteTerm(doc(["CSE 12"], ["CSE 15L"]), later), { term: "WI27", passedOver: null });
  });
});
