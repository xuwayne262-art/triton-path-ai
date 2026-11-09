import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  addManualCourse, addManualTransfer, addPaste, editCourse, emptyDraft, hasDraft, keepCourse, placeCourse,
  previewDraft, removeCourse, savePayload, setPlanStart,
} from "./importFlow";
import { sanitizeHistory } from "./record";
import { ROW_OF as ROW, TSS_FIXTURE, TSS_IDENTITY } from "./fixtures";
import type { ParsedHistory } from "./types";

const TODAY = "2026-11-08";
const CATALOG = new Set(["BIEB 102", "ECON 110B", "MGT 160", "MGT 162R", "MGT 180R", "WCWP 10B", "CSE 11", "CSE 12"]);
const opts = { today: TODAY, has: (c: string) => CATALOG.has(c) };

/** What the server would hand back after a save of `history`. */
const stored = (history: ParsedHistory) => sanitizeHistory(history, TODAY)!;

describe("a first import", () => {
  test("paste, review, save: six attempts, 16 units in progress and 8 earned", () => {
    const { draft, added } = addPaste(emptyDraft(), TSS_FIXTURE, opts);
    assert.equal(added, 6);
    const p = previewDraft(null, draft, TODAY);
    assert.equal(p.changes, true);
    assert.equal(p.diff.added.length, 6);
    assert.equal(p.totals.currentUnits, 16);
    assert.equal(p.totals.earnedUnits, 8);
    const saved = stored(savePayload(null, p).history);
    assert.equal(saved.totals.unitsInProgress, 16);
    assert.equal(saved.totals.unitsEarned, 8);
  });

  test("nothing from the paste but its courses reaches the request", () => {
    const { draft } = addPaste(emptyDraft(), `${TSS_IDENTITY}\n${TSS_FIXTURE}`, opts);
    const body = JSON.stringify(savePayload(null, previewDraft(null, draft, TODAY)));
    for (const secret of ["McFixture", "Testy", "A99999999", "tmcfixture", "858-555", "Academic Events", "UC ENTR"]) {
      assert.ok(!body.includes(secret), `${secret} would be sent`);
    }
  });

  test("a paste with no courses leaves the draft as it was and says what to do", () => {
    const first = addPaste(emptyDraft(), TSS_FIXTURE, opts).draft;
    const { draft, report, added } = addPaste(first, "My Academic History\n2026/2027 Fall Quarter\nActive", opts);
    assert.equal(added, 0);
    assert.deepEqual(draft.incoming, first.incoming);
    assert.equal(report.messages[0].code, "NO_ROWS_TSS");
  });

  test("a second paste of more quarters adds to the first", () => {
    let { draft } = addPaste(emptyDraft(), TSS_FIXTURE, opts);
    draft = addPaste(draft, ["2025/2026 Spring Quarter", ROW("CSE-12", "Basic Data Structures", "4.00", "Letter Grade", "B", "12.0000")].join("\n"), opts).draft;
    assert.deepEqual(draft.incoming.terms.map((t) => t.code), ["SP26", "S226", "FA26"]);
  });
});

describe("against a saved copy", () => {
  const saved = stored(addPaste(emptyDraft(), [
    TSS_FIXTURE,
    "2025/2026 Spring Quarter", ROW("CSE-12", "Basic Data Structures", "4.00", "Letter Grade", "B", "12.0000"),
  ].join("\n"), opts).draft.incoming);

  test("a shorter paste keeps every saved quarter it leaves out", () => {
    const { draft } = addPaste(emptyDraft(), ["2026/2027 Fall Quarter", ROW("BIEB-102", "Intro Eclgy", "4.00", "Letter Grade", "", "")].join("\n"), opts);
    const p = previewDraft(saved, draft, TODAY);
    assert.deepEqual(p.result.terms.map((t) => t.code), ["SP26", "S226", "FA26"]);
    assert.equal(p.changes, false, "nothing new, nothing lost");
  });

  test("replacing lists what it would remove before anything is saved", () => {
    const { draft } = addPaste(emptyDraft(), TSS_FIXTURE, opts);
    const p = previewDraft(saved, { ...draft, mode: "replace" }, TODAY);
    assert.deepEqual(p.diff.untouched.map((a) => a.code), ["CSE 12"]);
    assert.equal(p.result.terms.some((t) => t.code === "SP26"), false);
  });

  test("a saved row can be removed, and the removal undone", () => {
    let draft = removeCourse(emptyDraft(), saved, "FA26", "MGT 162R");
    assert.equal(hasDraft(draft), true);
    let p = previewDraft(saved, draft, TODAY);
    assert.deepEqual(p.diff.removed, [{ term: "FA26", code: "MGT 162R" }]);
    assert.equal(p.totals.currentUnits, 12);
    draft = keepCourse(draft, "FA26", "MGT 162R");
    p = previewDraft(saved, draft, TODAY);
    assert.equal(p.changes, false);
  });

  test("correcting a saved grade updates that attempt and clears its flag", () => {
    const flagged = stored({
      ...saved,
      terms: saved.terms.map((t) => t.code === "SP26" ? { ...t, courses: t.courses.map((c) => ({ ...c, grade: "XQ", review: ["unknown-grade" as const] })) } : t),
    });
    const draft = editCourse(emptyDraft(), flagged, "SP26", "CSE 12", { grade: "B+" }, TODAY);
    const p = previewDraft(flagged, draft, TODAY);
    const cse12 = p.result.terms.find((t) => t.code === "SP26")!.courses[0];
    assert.equal(cse12.grade, "B+");
    assert.equal(cse12.review, undefined);
    assert.equal(cse12.manual, true);
    assert.equal(p.diff.updated[0].code, "CSE 12");
  });

  test("the plan's year is saved with the history and kept when unchanged", () => {
    const withYear = stored({ ...saved, planStart: 2024 });
    const p = previewDraft(withYear, addPaste(emptyDraft(), TSS_FIXTURE, opts).draft, TODAY);
    assert.equal(p.result.planStart, 2024);
    const changed = previewDraft(withYear, setPlanStart(emptyDraft(), 2023), TODAY);
    assert.equal(changed.changes, true);
    assert.equal(changed.result.planStart, 2023);
  });

  test("the request names the saved copy it was built on", () => {
    const p = previewDraft(saved, emptyDraft(), TODAY);
    assert.equal(savePayload(saved, p).base, saved.savedAt);
  });
});

describe("rows the student places or adds", () => {
  test("a row with no quarter is saved only once the student picks one", () => {
    const text = ["Current Bookings", ROW("BIEB-102", "Intro Eclgy", "4.00", "Letter Grade")].join("\n");
    let { draft } = addPaste(emptyDraft(), text, opts);
    assert.equal(draft.unplaced.length, 1);
    assert.equal(draft.suggestedTerm, "FA26");
    assert.equal(previewDraft(null, draft, TODAY).result.terms.length, 0, "not saved while unplaced");
    draft = placeCourse(draft, 0, "FA26", TODAY);
    const p = previewDraft(null, draft, TODAY);
    assert.equal(p.result.terms[0].courses[0].code, "BIEB 102");
    assert.equal(p.result.terms[0].courses[0].review, undefined);
    assert.equal(p.totals.currentUnits, 4);
  });

  test("a course typed in is checked like a pasted one", () => {
    const bad = addManualCourse(emptyDraft(), { term: "FA25", code: "Intro to stuff", title: "", units: "4", grade: "" }, TODAY, opts.has);
    assert.match(bad.error!, /course code/);
    const grade = addManualCourse(emptyDraft(), { term: "FA25", code: "CSE 11", title: "", units: "4", grade: "Z" }, TODAY, opts.has);
    assert.match(grade.error!, /grade/);
    const ok = addManualCourse(emptyDraft(), { term: "FA25", code: "cse-11", title: "Accel Intro", units: "4", grade: "a-" }, TODAY, opts.has);
    assert.equal(ok.error, null);
    const c = ok.draft.incoming.terms[0].courses[0];
    assert.deepEqual([c.code, c.grade, c.status, c.manual], ["CSE 11", "A-", "graded", true]);
  });

  test("transfer credit keeps its units and invents no UCSD course", () => {
    const { draft, error } = addManualTransfer(emptyDraft(), { from: "AP", title: "Macroeconomics", units: "4", equivalent: "" });
    assert.equal(error, null);
    const p = previewDraft(null, draft, TODAY);
    assert.equal(p.result.transfer[0].code, null);
    assert.equal(p.totals.transferUnits, 4);
    assert.equal(p.totals.earnedUnits, 0, "transfer units are not UCSD courses earned");
    const named = addManualTransfer(emptyDraft(), { from: "Grossmont College", title: "Calculus I", units: "5", equivalent: "math-20a" });
    assert.equal(named.draft.incoming.transfer[0].code, "MATH 20A");
  });
});
