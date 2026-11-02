import { test } from "node:test";
import assert from "node:assert/strict";
import { addOnDevice, undoOnDevice } from "./onDevice";
import { blankPlanner, type PatchData } from "./patch";
import { row, sec } from "@/lib/planAi/testFixtures";

const sections = {
  "CSE 11": [sec("A00", "LE", "MWF", "10:00a", "10:50a", { id: "L1" }), sec("A01", "DI", "M", "1:00p", "1:50p"), sec("A02", "DI", "W", "1:00p", "1:50p")],
};
const data: PatchData = {
  term: "FA26", termName: "Fall 2026",
  rowFor: (c) => (c === "CSE 11" ? row("CSE 11") : undefined),
  sectionsFor: (c) => (sections as Record<string, ReturnType<typeof sec>[]>)[c],
};
const pick = { family: "A", parts: { DI: "A02" } };

test("adds with the chosen sections, and undo takes exactly that back", () => {
  const added = addOnDevice(null, "CSE 11", pick, data);
  assert.equal(added.kind, "applied");
  if (added.kind !== "applied") return;
  assert.deepEqual(added.doc.schedule.map((e) => e.course.code), ["CSE 11"]);
  assert.deepEqual(added.doc.sections["CSE 11"], pick);
  assert.match(added.label, /Added CSE 11/);
  const undone = undoOnDevice(added.doc, added.inverse, data);
  assert.equal(undone.kind, "applied");
  if (undone.kind === "applied") assert.deepEqual(undone.doc.schedule, []);
});

test("a course already planned has its sections switched, not a second copy", () => {
  const first = addOnDevice(null, "CSE 11", null, data);
  assert.equal(first.kind, "applied");
  if (first.kind !== "applied") return;
  const again = addOnDevice(first.doc, "CSE 11", pick, data);
  assert.equal(again.kind, "applied");
  if (again.kind !== "applied") return;
  assert.equal(again.doc.schedule.length, 1);
  assert.deepEqual(again.doc.sections["CSE 11"], pick);
});

test("undo refuses when the plan moved on since", () => {
  const added = addOnDevice(null, "CSE 11", pick, data);
  if (added.kind !== "applied") return assert.fail();
  const changed = { ...added.doc, sections: { "CSE 11": { family: "A", parts: { DI: "A01" } } } };
  assert.deepEqual(undoOnDevice(changed, added.inverse, data), { kind: "handoff", reason: "conflict" });
});

test("a plan saved for another term is left to the Planner, which moves terms", () => {
  assert.deepEqual(addOnDevice({ ...blankPlanner("SP26") }, "CSE 11", pick, data), { kind: "handoff", reason: "term" });
});

test("a pick that no longer matches the sections is handed over, not saved", () => {
  assert.equal(addOnDevice(null, "CSE 11", { family: "B", parts: {} }, data).kind, "handoff");
});
