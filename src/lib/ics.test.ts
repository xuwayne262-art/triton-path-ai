import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildIcs, escapeText, foldLine, icsFileName } from "./ics";
import type { CalEvent } from "./sections";
import type { SectionTuple } from "./plat";

const FA26 = {
  key: "FA26", name: "Fall 2026", classes: "2026-09-24", lastClass: "2026-12-04",
  holidays: ["2026-11-11", "2026-11-26", "2026-11-27"],
};

const ev = (day: CalEvent["day"], over: Partial<CalEvent> = {}): CalEvent => ({
  key: `k-${day}`, code: "CSE 12", title: "Basic Data Structures", sectionCode: "A00", sectionId: "E1",
  kind: "LE", kindLabel: "Lecture", day, startMin: 480, endMin: 530, where: "WLH 2001",
  buildingCode: "WLH", building: "Warren Lecture Hall", instructor: "Paul Cao", role: "major", conflict: false,
  ...over,
});

const final: SectionTuple = ["2026-12-07", "FI", "2026-12-07", "8:00a", "10:59a", "Warren Lecture Hall", "WLH 2001", "", null, null, 0, 0, null, "E1", [], 480, 659];

/** The file's lines, with folded ones joined back up. */
const lines = (ics: string) => ics.replace(/\r\n /g, "").split("\r\n");

describe("the calendar file", () => {
  const ics = buildIcs({
    quarter: FA26,
    events: [ev("Mon"), ev("Wed"), ev("Fri"), ev("Mon", { key: "d", sectionCode: "A01", kind: "DI", kindLabel: "Discussion", startMin: 960, endMin: 1010 })],
    exams: [{ code: "CSE 12", title: "Basic Data Structures", row: final }],
    now: new Date("2026-10-01T12:00:00Z"),
  });
  const all = lines(ics);
  const events = ics.split("BEGIN:VEVENT").slice(1);

  test("makes one weekly event per meeting pattern, plus one per final", () => {
    assert.equal(events.length, 3);
    assert.ok(all.includes("RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;UNTIL=20261205T075900Z"));
    assert.ok(all.includes("SUMMARY:CSE 12 Lecture A00"));
    assert.ok(all.includes("SUMMARY:CSE 12 Discussion A01"));
    assert.ok(all.includes("SUMMARY:CSE 12 Final Exam"));
  });

  test("starts on the first class day that falls on one of its days", () => {
    // Instruction begins Thursday Sep 24, so a MWF lecture first meets Friday Sep 25.
    assert.ok(all.includes("DTSTART;TZID=America/Los_Angeles:20260925T080000"));
    // A Monday discussion first meets Monday Sep 28.
    assert.ok(all.includes("DTSTART;TZID=America/Los_Angeles:20260928T160000"));
  });

  test("skips the holidays that fall on its days", () => {
    // Veterans Day (Wed) and Thanksgiving Friday for MWF; Thanksgiving Thursday is not a MWF day.
    assert.ok(all.includes("EXDATE;TZID=America/Los_Angeles:20261111T080000,20261127T080000"));
  });

  test("puts the final on its own date and time, in San Diego's time zone", () => {
    assert.ok(all.includes("DTSTART;TZID=America/Los_Angeles:20261207T080000"));
    assert.ok(all.includes("DTEND;TZID=America/Los_Angeles:20261207T105900"));
    assert.ok(all.includes("BEGIN:VTIMEZONE"));
  });

  test("is valid line by line: CRLF endings and no line over 75 octets", () => {
    assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
    for (const l of ics.split("\r\n")) assert.ok(new TextEncoder().encode(l).length <= 75, l);
  });
});

describe("calendar text", () => {
  test("escapes the characters the format reserves", () => {
    assert.equal(escapeText("a, b; c\\d\ne"), "a\\, b\\; c\\\\d\\ne");
  });

  test("folds long lines with a leading space", () => {
    const folded = foldLine(`DESCRIPTION:${"x".repeat(120)}`);
    assert.ok(folded.includes("\r\n "));
    assert.equal(folded.replace(/\r\n /g, ""), `DESCRIPTION:${"x".repeat(120)}`);
  });

  test("names the file after the term", () => {
    assert.equal(icsFileName("Fall 2026"), "ucsdplans-fall-2026.ics");
  });
});
