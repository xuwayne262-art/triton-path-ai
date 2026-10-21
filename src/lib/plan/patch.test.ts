import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { applyPlanPatch, blankPlanner, describeOps, planFingerprint, validatePlanPatch, type PatchData } from "./patch";
import { cleanPlanner, type PlannerDoc } from "./record";
import { mergeDocs } from "./merge";
import type { PlanChange, PlanOp } from "./change";
import { final, row, sec } from "@/lib/planAi/testFixtures";
import type { CourseRow, SectionTuple } from "@/lib/plat";

const rows: Record<string, CourseRow> = {
  "CSE 11": row("CSE 11"),
  "ECON 1": row("ECON 1"),
  "MATH 20A": row("MATH 20A"),
  "HILD 7A": row("HILD 7A", { o: 0 }),
};
const sections: Record<string, SectionTuple[]> = {
  "CSE 11": [sec("A00", "LE", "MWF", "10:00a", "10:50a", { id: "L1" }), sec("A01", "DI", "M", "1:00p", "1:50p"), sec("A02", "DI", "W", "1:00p", "1:50p"), final("2026-12-08", "8:00a", "10:59a", "L1")],
  "ECON 1": [sec("A00", "LE", "TuTh", "11:00a", "12:20p", { id: "L2" }), sec("A01", "DI", "F", "9:00a", "9:50a")],
  "MATH 20A": [sec("A00", "LE", "MWF", "9:00a", "9:50a")],
};
const data: PatchData = {
  term: "FA26",
  termName: "Fall 2026",
  rowFor: (c) => rows[c],
  sectionsFor: (c) => sections[c],
};

const start = (): PlannerDoc => ({ ...blankPlanner("FA26"), major: "Biology (BS)" });

describe("applying a change", () => {
  test("adds a course with its lecture and required discussion, and knows how to take it back", () => {
    const ops: PlanOp[] = [{ op: "add_term", code: "CSE 11", selection: { family: "A", parts: { DI: "A02" } } }];
    assert.deepEqual(validatePlanPatch(start(), ops, data), []);
    const { doc, inverse } = applyPlanPatch(start(), ops, data, "t1");
    assert.deepEqual(doc.schedule.map((e) => e.course.code), ["CSE 11"]);
    assert.deepEqual(doc.sections["CSE 11"], { family: "A", parts: { DI: "A02" } });
    assert.deepEqual(inverse, [{ op: "remove_term", code: "CSE 11", expect: { family: "A", parts: { DI: "A02" } } }]);
  });

  test("refuses fabricated, unoffered and impossible picks", () => {
    const problems = (ops: PlanOp[]) => validatePlanPatch(start(), ops, data).map((p) => p.code);
    assert.deepEqual(problems([{ op: "add_term", code: "FAKE 999", selection: null }]), ["UNKNOWN_COURSE"]);
    assert.deepEqual(problems([{ op: "add_term", code: "HILD 7A", selection: null }]), ["NOT_OFFERED"]);
    assert.deepEqual(problems([{ op: "add_term", code: "CSE 11", selection: { family: "Z", parts: {} } }]), ["INVALID_SECTIONS"]);
    assert.deepEqual(problems([{ op: "add_term", code: "CSE 11", selection: { family: "A", parts: { DI: "A09" } } }]), ["INVALID_SECTIONS"]);
  });

  test("is all or nothing: one bad operation stops the rest", () => {
    const ops: PlanOp[] = [
      { op: "add_term", code: "ECON 1", selection: { family: "A", parts: { DI: "A01" } } },
      { op: "add_term", code: "FAKE 1", selection: null },
    ];
    const before = start();
    assert.equal(validatePlanPatch(before, ops, data).length, 1);
    assert.throws(() => applyPlanPatch(before, ops, data, "t"));
    assert.deepEqual(before.schedule, [], "the plan itself is never touched");
  });

  test("checks each operation against the plan the earlier ones leave", () => {
    const twice: PlanOp[] = [
      { op: "add_term", code: "ECON 1", selection: null },
      { op: "add_term", code: "ECON 1", selection: null },
    ];
    assert.deepEqual(validatePlanPatch(start(), twice, data).map((p) => p.code), ["ALREADY_SCHEDULED"]);
    const swap: PlanOp[] = [
      { op: "add_term", code: "ECON 1", selection: null },
      { op: "remove_term", code: "ECON 1", expect: null },
    ];
    assert.deepEqual(validatePlanPatch(start(), swap, data), []);
  });

  test("a stale suggestion cannot overwrite a newer edit", () => {
    const { doc } = applyPlanPatch(start(), [{ op: "add_term", code: "CSE 11", selection: { family: "A", parts: { DI: "A01" } } }], data, "t");
    // Another tab changes the discussion; the old suggestion still expects A01.
    const edited = { ...doc, sections: { ...doc.sections, "CSE 11": { family: "A", parts: { DI: "A02" } } } };
    const stale: PlanOp[] = [{ op: "remove_term", code: "CSE 11", expect: { family: "A", parts: { DI: "A01" } } }];
    assert.deepEqual(validatePlanPatch(edited, stale, data).map((p) => p.code), ["SECTIONS_CHANGED"]);
  });

  test("this term's operations need the plan to be on this term", () => {
    const old = { ...start(), term: "SP26" };
    assert.deepEqual(validatePlanPatch(old, [{ op: "add_term", code: "ECON 1", selection: null }], data).map((p) => p.code), ["TERM_CHANGED"]);
    assert.deepEqual(validatePlanPatch(old, [{ op: "add_plan", code: "ECON 1", slot: { year: 2, quarter: "Winter" } }], data), []);
  });
});

describe("undo", () => {
  test("reverses only its own change, leaving later edits in place", () => {
    const add = applyPlanPatch(start(), [{ op: "add_term", code: "CSE 11", selection: { family: "A", parts: { DI: "A01" } } }], data, "t1");
    // Later, an unrelated edit: ECON 1 added by hand.
    const later = applyPlanPatch(add.doc, [{ op: "add_term", code: "ECON 1", selection: null }], data, "t2").doc;
    assert.deepEqual(validatePlanPatch(later, add.inverse, data), []);
    const undone = applyPlanPatch(later, add.inverse, data, "t3").doc;
    assert.deepEqual(undone.schedule.map((e) => e.course.code), ["ECON 1"]);
    assert.equal(undone.sections["CSE 11"], undefined);
  });

  test("refuses to undo over an edit to the same course", () => {
    const add = applyPlanPatch(start(), [{ op: "add_term", code: "CSE 11", selection: { family: "A", parts: { DI: "A01" } } }], data, "t1");
    const resectioned = applyPlanPatch(add.doc, [{ op: "set_sections", code: "CSE 11", selection: { family: "A", parts: { DI: "A02" } }, expect: { family: "A", parts: { DI: "A01" } } }], data, "t2").doc;
    assert.deepEqual(validatePlanPatch(resectioned, add.inverse, data).map((p) => p.code), ["SECTIONS_CHANGED"]);
  });

  test("a removal comes back with its own entry and sections", () => {
    const add = applyPlanPatch(start(), [{ op: "add_term", code: "CSE 11", selection: { family: "A", parts: { DI: "A01" } }, entryId: "cse11-keep" }], data, "t1");
    const removed = applyPlanPatch(add.doc, [{ op: "remove_term", code: "CSE 11", expect: { family: "A", parts: { DI: "A01" } } }], data, "t2");
    const back = applyPlanPatch(removed.doc, removed.inverse, data, "t3").doc;
    assert.equal(back.schedule[0].id, "cse11-keep");
    assert.deepEqual(back.sections["CSE 11"], { family: "A", parts: { DI: "A01" } });
  });

  test("4-year plan moves reverse to where they were", () => {
    const placed = applyPlanPatch(start(), [{ op: "add_plan", code: "MATH 20A", slot: { year: 1, quarter: "Fall" } }], data, "t1").doc;
    assert.equal(placed.planned[0].course.time, undefined, "a later quarter's course carries no meeting time");
    const moved = applyPlanPatch(placed, [{ op: "move_plan", code: "MATH 20A", from: { year: 1, quarter: "Fall" }, to: { year: 1, quarter: "Spring" } }], data, "t2");
    assert.equal(moved.doc.planned[0].quarter, "Spring");
    assert.equal(applyPlanPatch(moved.doc, moved.inverse, data, "t3").doc.planned[0].quarter, "Fall");
  });
});

describe("what a change is called, and when a suggestion is stale", () => {
  test("labels come from the operations", () => {
    assert.equal(describeOps([{ op: "add_term", code: "ECON 1", selection: null }], "Fall 2026"), "Added ECON 1 to Fall 2026");
    assert.equal(
      describeOps([{ op: "remove_term", code: "CSE 11", expect: null }, { op: "add_term", code: "ECON 1", selection: null }], "Fall 2026"),
      "Added ECON 1 to Fall 2026; removed CSE 11 from Fall 2026",
    );
  });

  test("the fingerprint moves with sections and the 4-year plan, not with order", () => {
    const a = applyPlanPatch(start(), [
      { op: "add_term", code: "CSE 11", selection: { family: "A", parts: { DI: "A01" } } },
      { op: "add_term", code: "ECON 1", selection: null },
    ], data, "t").doc;
    const reordered = { ...a, schedule: [...a.schedule].reverse() };
    assert.equal(planFingerprint(a), planFingerprint(reordered));
    const resectioned = { ...a, sections: { ...a.sections, "CSE 11": { family: "A", parts: { DI: "A02" } } } };
    assert.notEqual(planFingerprint(a), planFingerprint(resectioned));
  });
});

describe("the change log in the stored plan", () => {
  const entry = (id: string, at: string, extra: Partial<PlanChange> = {}): PlanChange => ({
    id, at, label: "Added ECON 1 to Fall 2026", ops: [{ op: "add_term", code: "ECON 1", selection: null }],
    inverse: [{ op: "remove_term", code: "ECON 1", expect: null }], ...extra,
  });

  test("survives the cleaner, and an unreadable entry is dropped", () => {
    const doc = cleanPlanner({ ...start(), log: [entry("pc_aaaaaaaaaaaaaaaaaaaa", "2026-10-21T10:00:00Z"), { id: "bad" }] });
    assert.equal(doc?.log?.length, 1);
    assert.equal(cleanPlanner({ ...start() })?.log, undefined, "absent when there is none");
  });

  test("merging two devices keeps every change once, and an undo recorded on either", () => {
    const base = { ...start(), log: [entry("pc_aaaaaaaaaaaaaaaaaaaa", "2026-10-21T10:00:00Z")] };
    const local = { ...base, log: [...base.log, entry("pc_bbbbbbbbbbbbbbbbbbbb", "2026-10-21T11:00:00Z")] };
    const remote = { ...base, log: [entry("pc_aaaaaaaaaaaaaaaaaaaa", "2026-10-21T10:00:00Z", { undoneBy: "pc_cccccccccccccccccccc" }), entry("pc_cccccccccccccccccccc", "2026-10-21T12:00:00Z", { undoOf: "pc_aaaaaaaaaaaaaaaaaaaa" })] };
    const docs = mergeDocs({ planner: base, shortlist: [], ratings: {} }, { planner: local, shortlist: [], ratings: {} }, { planner: remote, shortlist: [], ratings: {} });
    const log = docs.planner?.log ?? [];
    assert.deepEqual(log.map((c) => c.id), ["pc_aaaaaaaaaaaaaaaaaaaa", "pc_bbbbbbbbbbbbbbbbbbbb", "pc_cccccccccccccccccccc"]);
    assert.equal(log[0].undoneBy, "pc_cccccccccccccccccccc");
  });
});
