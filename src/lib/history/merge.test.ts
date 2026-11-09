import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { changesSomething, mergeHistory } from "./merge";
import { readAcademicHistory } from "./parse";
import { historyTotals } from "./attempts";
import { ROW_OF as ROW, TSS_FIXTURE } from "./fixtures";
import type { ParsedHistory } from "./types";

const TODAY = "2026-11-08";
const read = (text: string) => readAcademicHistory(text, { today: TODAY }).history;

const OLDER = read([
  "2025/2026 Winter Quarter",
  ROW("CSE-11", "Accel Intro", "4.00", "Letter Grade", "A", "16.0000"),
  "2025/2026 Spring Quarter",
  ROW("CSE-12", "Basic Data Structures", "4.00", "Letter Grade", "I", ""),
].join("\n"));

const codesOf = (h: ParsedHistory) => h.terms.map((t) => `${t.code}:${t.courses.map((c) => `${c.code}=${c.grade ?? "-"}`).join(",")}`);

describe("mergeHistory", () => {
  test("a first import adds every attempt", () => {
    const { result, diff } = mergeHistory(null, read(TSS_FIXTURE));
    assert.equal(diff.added.length, 6);
    assert.deepEqual(diff.addedTerms, ["S226", "FA26"]);
    assert.equal(result.terms.length, 2);
  });

  test("merging the same paste again is a no-op", () => {
    const first = mergeHistory(null, read(TSS_FIXTURE)).result;
    const { result, diff } = mergeHistory(first, read(TSS_FIXTURE));
    assert.equal(changesSomething(diff), false);
    assert.equal(diff.unchanged, 6);
    assert.deepEqual(codesOf(result), codesOf(first));
  });

  test("a shorter paste keeps the quarters it leaves out", () => {
    const saved = mergeHistory(OLDER, read(TSS_FIXTURE)).result;
    const fallOnly = read(["2026/2027 Fall Quarter", ROW("BIEB-102", "Intro Eclgy", "4.00", "Letter Grade", "", "")].join("\n"));
    const { result, diff } = mergeHistory(saved, fallOnly);
    assert.deepEqual(result.terms.map((t) => t.code), ["WI26", "SP26", "S226", "FA26"]);
    assert.equal(diff.untouched.length, 7, "the seven attempts not in the paste are listed as kept");
    assert.equal(changesSomething(diff), false);
  });

  test("a grade posted later updates the same attempt instead of adding one", () => {
    const saved = mergeHistory(null, read(TSS_FIXTURE)).result;
    const graded = read(["2026/2027 Fall Quarter", ROW("BIEB-102", "Intro Eclgy/Organisms&Habitats", "4.00", "Letter Grade", "A-", "14.8000")].join("\n"));
    const { result, diff } = mergeHistory(saved, graded);
    const fall = result.terms.find((t) => t.code === "FA26")!;
    assert.equal(fall.courses.length, 4);
    assert.equal(fall.courses.find((c) => c.code === "BIEB 102")!.grade, "A-");
    assert.deepEqual(diff.updated, [{ term: "FA26", code: "BIEB 102", changes: ["grade A- (was blank)"] }]);
  });

  test("an incomplete resolved to a grade is reconciled", () => {
    const later = read(["2025/2026 Spring Quarter", ROW("CSE-12", "Basic Data Structures", "4.00", "Letter Grade", "B", "12.0000")].join("\n"));
    const { result, diff } = mergeHistory(OLDER, later);
    assert.equal(result.terms.find((t) => t.code === "SP26")!.courses[0].grade, "B");
    assert.match(diff.updated[0].changes[0], /grade B \(was I\)/);
  });

  test("a blank grade in a new paste never erases a saved grade", () => {
    const saved = mergeHistory(null, read(TSS_FIXTURE)).result;
    const blank = read(["2025/2026 Summer Session 2", ROW("MGT-180R", "Business Finance", "4.00", "CNV - Letter Grade", "", "")].join("\n"));
    const { result } = mergeHistory(saved, blank);
    assert.equal(result.terms.find((t) => t.code === "S226")!.courses[0].grade, "C+");
  });

  test("a retake in another quarter is a second attempt, not an update", () => {
    const retake = read(["2026/2027 Fall Quarter", ROW("CSE-11", "Accel Intro", "4.00", "Letter Grade", "", "")].join("\n"));
    const { result, diff } = mergeHistory(OLDER, retake);
    assert.equal(diff.added.length, 1);
    assert.equal(result.terms.filter((t) => t.courses.some((c) => c.code === "CSE 11")).length, 2);
  });

  test("replacing names every attempt it removes", () => {
    const saved = mergeHistory(OLDER, read(TSS_FIXTURE)).result;
    const { result, diff } = mergeHistory(saved, read(TSS_FIXTURE), "replace");
    assert.deepEqual(diff.untouched.map((a) => `${a.term}|${a.code}`).sort(), ["SP26|CSE 12", "WI26|CSE 11"]);
    assert.equal(changesSomething(diff, "replace"), true);
    assert.deepEqual(result.terms.map((t) => t.code), ["S226", "FA26"]);
  });

  test("a chosen removal takes out exactly that attempt", () => {
    const saved = mergeHistory(OLDER, read(TSS_FIXTURE)).result;
    const { result, diff } = mergeHistory(saved, read(""), "merge", ["FA26|MGT 162R"]);
    assert.deepEqual(diff.removed, [{ term: "FA26", code: "MGT 162R" }]);
    assert.equal(result.terms.find((t) => t.code === "FA26")!.courses.length, 3);
    assert.equal(historyTotals(result, TODAY).currentUnits, 12);
  });

  test("transfer credit survives a TSS paste, even when replacing", () => {
    const legacy = readAcademicHistory("Transfer Credit\nAP CA4 Calculus AB\nCollege Board 8.00 P SP24 LD MATH 20A\n", { today: TODAY }).history;
    assert.equal(legacy.transfer.length, 1);
    const { result, diff } = mergeHistory(legacy, read(TSS_FIXTURE), "replace");
    assert.equal(result.transfer.length, 1);
    assert.equal(diff.transferRemoved, 0);
  });

  test("the plan's year anchor is kept unless the new copy sets one", () => {
    const saved = { ...mergeHistory(null, read(TSS_FIXTURE)).result, planStart: 2025 };
    assert.equal(mergeHistory(saved, read(TSS_FIXTURE)).result.planStart, 2025);
    assert.equal(mergeHistory(saved, { ...read(TSS_FIXTURE), planStart: 2024 }).result.planStart, 2024);
  });
});
