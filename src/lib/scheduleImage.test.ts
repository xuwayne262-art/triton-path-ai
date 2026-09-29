import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  IMAGE_HOUR_PX, blockLines, cell, imageFileName, layoutImage, scheduleImageInput, type CourseSource,
} from "./scheduleImage";
import { buildEvents, groupSections, selectedSections } from "./sections";
import type { SectionTuple } from "./plat";

/** A row in the shape fetch-classplanner.mjs emits. */
function row(
  code: string, type: string, days: string, start: string, end: string,
  over: { room?: string; id?: string; instructor?: string } = {},
): SectionTuple {
  return [
    code, type, days, start, end,
    "Center Hall", over.room ?? "CENTR 214", over.instructor ?? "Joe Politz",
    5, 100, 0,
    0, 95, over.id ?? `E ${code}`, ["1"], null, null,
    "CENTR", "AC",
  ];
}

const cse12: SectionTuple[] = [
  row("A00", "LE", "MWF", "8:00a", "8:50a", { room: "WLH 2001", id: "E 1", instructor: "Paul Cao" }),
  row("2026-12-07", "FI", "2026-12-07", "8:00a", "10:59a", { room: "WLH 2001", id: "E 1" }),
  row("A01", "DI", "M", "4:00p", "4:50p", { id: "E 2" }),
  row("A02", "DI", "W", "4:00p", "4:50p", { id: "E 3" }),
];
const math: SectionTuple[] = [
  row("A00", "LE", "TuTh", "9:30a", "10:50a", { room: "PETER 108", id: "E 9" }),
  row("B00", "LE", "TuTh", "2:00p", "3:20p", { room: "PETER 110", id: "E 8" }),
  row("2026-12-07", "FI", "2026-12-07", "8:00a", "10:59a", { id: "E 9" }),
];

function source(code: string, sec: SectionTuple[] | undefined, selection: CourseSource["selection"]): CourseSource {
  return { code, title: `${code} title`, units: 4, role: "major", instructor: null, sec, selection };
}

function input(courses: CourseSource[]) {
  const events = buildEvents(courses.map((c) => ({
    code: c.code,
    title: c.title,
    role: c.role,
    sections: c.sec ? selectedSections(groupSections(c.sec), c.selection) : [],
  })));
  const exams = courses.flatMap((c) =>
    (c.sec ?? []).filter((r) => r[1] === "FI").map((r) => ({ code: c.code, role: c.role, row: r })));
  return scheduleImageInput({ termName: "Fall 2026", courses, events, exams });
}

describe("what the picture says about each course", () => {
  test("names the sections chosen and who teaches them", () => {
    const out = input([source("CSE 12", cse12, { family: "A", parts: { DI: "A01" } })]);
    assert.deepEqual(out.courses[0], {
      code: "CSE 12", title: "CSE 12 title", units: 4, role: "major",
      sections: "Lecture A00 · Discussion A01", instructor: "Paul Cao", note: "",
    });
  });

  test("says what is still to pick rather than passing for a full week", () => {
    const out = input([
      source("CSE 12", cse12, { family: "A", parts: {} }),
      source("MATH 20A", math, undefined),
      source("VIS 1", undefined, undefined),
    ]);
    assert.deepEqual(out.courses.map((c) => c.note), [
      "Discussion not picked yet",
      "Section not picked yet",
      "No sections published this term",
    ]);
  });

  test("lists finals by date and flags two at the same time", () => {
    const out = input([
      source("CSE 12", cse12, { family: "A", parts: { DI: "A01" } }),
      source("MATH 20A", math, { family: "A", parts: {} }),
    ]);
    assert.equal(out.exams.length, 2);
    assert.equal(out.exams[0].date, "Mon, Dec 7");
    assert.equal(out.exams[0].time, "8:00–10:59a");
    assert.deepEqual(out.exams.map((x) => x.clash), [true, true]);
    assert.match(out.exams[0].label, /Final Exam$/);
  });

  test("leaves out one-off dates that are already over", () => {
    const courses = [source("CSE 12", cse12, { family: "A", parts: { DI: "A01" } })];
    const events = buildEvents([{ code: "CSE 12", title: "", role: "major", sections: [cse12[0]] }]);
    const exams = [{ code: "CSE 12", role: "major" as const, row: cse12[1] }];
    const before = scheduleImageInput({ termName: "Fall 2026", courses, events, exams, today: "2026-12-07" });
    const after = scheduleImageInput({ termName: "Fall 2026", courses, events, exams, today: "2026-12-08" });
    assert.equal(before.exams.length, 1);
    assert.equal(after.exams.length, 0);
  });

  test("takes only committed blocks, never options or previews", () => {
    const events = buildEvents([{ code: "CSE 12", title: "", role: "major", sections: [cse12[0]] }]);
    const ghost = { ...events[0], key: "ghost", ghost: "option" as const };
    const out = scheduleImageInput({ termName: "", courses: [], events: [...events, ghost], exams: [] });
    assert.equal(out.events.length, 3);
    assert.equal(out.termName, "This term");
  });
});

describe("layout", () => {
  test("always draws the academic day, and grows for an evening class", () => {
    const day = layoutImage(input([source("CSE 12", cse12, { family: "A", parts: { DI: "A01" } })]));
    assert.equal(day.grid.startMin, 8 * 60);
    assert.equal(day.grid.endMin, 18 * 60);
    assert.equal(day.grid.h, 10 * IMAGE_HOUR_PX);

    const late = [row("A00", "LE", "MW", "6:30p", "7:50p")];
    const evening = layoutImage(input([source("MUS 4", late, { family: "A", parts: {} })]));
    assert.equal(evening.grid.endMin, 20 * 60);
    assert.ok(evening.height > day.height);
  });

  test("makes room for the exam list only when there are exams", () => {
    const withExams = layoutImage(input([source("CSE 12", cse12, { family: "A", parts: { DI: "A01" } })]));
    const noExams = layoutImage(input([source("MUS 4", [row("A00", "LE", "MW", "1:00p", "1:50p")], { family: "A", parts: {} })]));
    assert.notEqual(withExams.examsY, null);
    assert.equal(noExams.examsY, null);
    assert.ok(withExams.footerY > withExams.examsY!);
  });
});

describe("what fits in a block", () => {
  const [lecture] = buildEvents([{ code: "CSE 12", title: "", role: "major", sections: [cse12[0]] }]);

  test("a 50-minute class shows its code, times and room", () => {
    const lines = blockLines(lecture, (50 * IMAGE_HOUR_PX) / 60 - 3);
    assert.deepEqual(lines.map((l) => l.text), ["CSE 12", "8:00–8:50a", "WLH 2001"]);
  });

  test("an 80-minute class also says which section it is", () => {
    const lines = blockLines(lecture, (80 * IMAGE_HOUR_PX) / 60 - 3);
    assert.deepEqual(lines.map((l) => l.text), ["CSE 12", "Lecture A00", "8:00–8:50a", "WLH 2001"]);
  });

  test("a sliver keeps the code, and the room before the time", () => {
    assert.deepEqual(blockLines(lecture, 20).map((l) => l.text), ["CSE 12"]);
    assert.deepEqual(blockLines(lecture, 36).map((l) => l.text), ["CSE 12", "WLH 2001"]);
  });
});

test("two-column lists read down the left column first, so dates stay in order", () => {
  assert.deepEqual([0, 1, 2, 3, 4].map((i) => cell(i, 5)), [
    { col: 0, row: 0 }, { col: 0, row: 1 }, { col: 0, row: 2 }, { col: 1, row: 0 }, { col: 1, row: 1 },
  ]);
  assert.deepEqual(cell(0, 1), { col: 0, row: 0 });
});

test("the file is named for the term", () => {
  assert.equal(imageFileName("Fall 2026"), "ucsdplans-fall-2026-schedule.png");
  assert.equal(imageFileName(""), "ucsdplans-term-schedule.png");
});
