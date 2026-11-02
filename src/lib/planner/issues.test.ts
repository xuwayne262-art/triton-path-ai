import { test } from "node:test";
import assert from "node:assert/strict";
import { examIssues, issueCourses, issueText, overlapIssues } from "./issues";
import { final } from "@/lib/planAi/testFixtures";
import type { CalEvent } from "@/lib/sections";

const ev = (code: string, section: string, kind: string, day: CalEvent["day"], startMin: number, endMin: number, ghost = false): CalEvent => ({
  key: `${code}-${section}-${day}`, code, title: code, sectionCode: section, sectionId: "", kind, kindLabel: kind === "LE" ? "Lecture" : "Discussion",
  day, startMin, endMin, where: "", buildingCode: "", building: "", instructor: "", role: "major", conflict: true,
  ...(ghost ? { ghost: "option" as CalEvent["ghost"] } : {}),
});

test("an overlap names both meetings, the day and the exact window", () => {
  const issues = overlapIssues([
    ev("CSE 11", "A00", "LE", "Tue", 570, 650),
    ev("MATH 20C", "B00", "LE", "Tue", 600, 680),
    ev("CSE 11", "A00", "LE", "Thu", 570, 650),
  ]);
  assert.equal(issues.length, 1);
  assert.equal(issueText(issues[0]), "CSE 11 Lecture A00 and MATH 20C Lecture B00 overlap on Tuesday, 10 AM to 10:50 AM.");
  // The same clash on two days is one issue.
  const twice = overlapIssues([
    ev("CSE 11", "A00", "LE", "Thu", 570, 650), ev("USP 15", "A00", "LE", "Thu", 570, 650),
    ev("CSE 11", "A00", "LE", "Tue", 570, 650), ev("USP 15", "A00", "LE", "Tue", 570, 650),
  ]);
  assert.equal(twice.length, 1);
  assert.match(issueText(twice[0]), /overlap on Tuesdays and Thursdays, 9:30 AM to 10:50 AM/);
  assert.deepEqual(issueCourses(issues[0]), ["CSE 11", "MATH 20C"]);
});

test("meetings that only touch, options on the calendar, and one course's own rows are not clashes", () => {
  assert.deepEqual(overlapIssues([
    ev("CSE 11", "A00", "LE", "Mon", 540, 590),
    ev("CSE 12", "A00", "LE", "Mon", 590, 640),
    ev("ECON 1", "A01", "DI", "Mon", 540, 600, true),
    ev("CSE 11", "A01", "DI", "Mon", 545, 585),
  ]), []);
});

test("two finals at once are an issue with their shared window", () => {
  const issues = examIssues([
    { code: "CSE 11", label: "Final", row: final("2026-12-10", "8:00a", "10:59a", "1") },
    { code: "MATH 20C", label: "Final", row: final("2026-12-10", "10:00a", "12:59p", "2") },
    { code: "ECON 1", label: "Final", row: final("2026-12-11", "8:00a", "10:59a", "3") },
  ]);
  assert.equal(issues.length, 1);
  assert.match(issueText(issues[0]), /CSE 11 Final and MATH 20C Final are both on .*Dec 10, 10 AM to 10:59 AM\./);
});

test("incomplete and unknown courses say why they are not checked", () => {
  assert.equal(issueText({ kind: "incomplete", code: "CSE 11", missing: ["discussion"], started: true }), "CSE 11 still needs a discussion.");
  assert.match(issueText({ kind: "unknown", code: "CSE 198", why: "tba" }), /TBA/);
});
