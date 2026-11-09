import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { buildSuggestions, candidates, subjectsFor, type SuggestionInput } from "./suggest";
import { studentRecord } from "@/lib/planAi/eligibility";
import { readAcademicHistory } from "./parse";
import { ROW_OF as ROW, TSS_FIXTURE } from "./fixtures";
import type { CourseRow } from "@/lib/plat";

const TODAY = "2026-11-08";

function row(k: string, over: Partial<CourseRow> = {}): CourseRow {
  const [s, c] = k.split(" ");
  return {
    k, s, c, t: k, u: "4", g: 3.2, a: 40, r: 6, o: 1, pr: 1,
    sa: 10, sl: 100, d: "MWF", st: "9:00a", en: "9:50a", b: null,
    p: null, pq: null, pn: null, pa: null, pd: null, pg: null,
    ...over,
  };
}

/** A small Economics department with the prerequisites UCSD writes for it. */
const PRE: Record<string, string | null> = {
  "ECON 110A": "ECON 1 and ECON 3.",
  "ECON 120B": "ECON 120A.",
  "ECON 121": "ECON 110B.",
  "ECON 125": "ECON 120A and ECON 110A or consent of instructor.",
  "ECON 130": "ECON 109 (minimum grade C-) or MATH 18 with upper-division standing.",
  "ECON 2": "none.",
  "ECON 100": "ECON 99.",
};
const ROWS = Object.keys(PRE).map((k) => row(k));
const detail = (code: string) => (code in PRE ? { pre: PRE[code], res: null } : undefined);

const history = readAcademicHistory([
  "2025/2026 Fall Quarter",
  ROW("ECON-1", "Principles of Micro", "4.00", "Letter Grade", "A", "16.0000"),
  ROW("ECON-3", "Principles of Macro", "4.00", "Letter Grade", "B", "12.0000"),
  "2025/2026 Spring Quarter",
  ROW("ECON-120A", "Econometrics A", "4.00", "Letter Grade", "", ""),
  TSS_FIXTURE,
].join("\n"), { today: TODAY }).history;

const input = (over: Partial<SuggestionInput> = {}): SuggestionInput => ({
  rows: ROWS,
  targets: { "Upper Division": 40, "Lower Division": 8 },
  covered: {},
  exclude: new Set(["ECON 1", "ECON 3", "ECON 110B"]),
  majorSubjects: new Set(["ECON"]),
  collegeSlug: null,
  majorModelled: true,
  ...over,
});

type Items = ReturnType<typeof buildSuggestions>["items"];
const bucketOf = (code: string, list: Items) => list.find((s) => s.row.k === code)?.bucket ?? "left out";

describe("suggestions", () => {
  const groups = candidates(input());
  const record = studentRecord(history, [], TODAY);
  const { items: list } = buildSuggestions(groups, detail, record);

  test("a passed prerequisite makes a course ready", () => {
    assert.equal(bucketOf("ECON 110A", list), "ready");
    assert.match(list.find((s) => s.row.k === "ECON 110A")!.prereqText, /ECON 1, ECON 3/);
  });

  test("a prerequisite under way now is conditional, and says on what", () => {
    const s = list.find((x) => x.row.k === "ECON 121")!;
    assert.equal(s.bucket, "conditional");
    assert.equal(s.condition, "Once you pass ECON 110B (in progress now).");
  });

  test("a prerequisite with no grade after its term ended is never confirmed", () => {
    // ECON 120A sat in Spring 2026 with a blank grade: by November that is a missing grade.
    const s = list.find((x) => x.row.k === "ECON 120B")!;
    assert.equal(s.bucket, "review");
    assert.equal(s.prereq.code, "PREREQ_GRADE_UNKNOWN");
  });

  test("a prerequisite UCSD words ambiguously, or with standing or consent, needs a check", () => {
    // ECON 125 names ECON 120A, which the record has (with no grade yet): it can't be ruled in or out.
    assert.equal(bucketOf("ECON 125", list), "review");
  });

  test("a prerequisite that can't be read but names only courses the record lacks is left out", () => {
    // ECON 130 names ECON 109 and MATH 18; the record shows neither.
    assert.equal(bucketOf("ECON 130", list), "left out");
  });

  test("a course whose prerequisite the history shows missing is left out", () => {
    assert.equal(bucketOf("ECON 100", list), "left out");
  });

  test("UCSD's own 'none' is ready", () => {
    assert.equal(bucketOf("ECON 2", list), "ready");
  });

  test("anything passed, under way, scheduled or planned is never suggested again", () => {
    const again = buildSuggestions(candidates(input({ exclude: new Set(["ECON 1", "ECON 3", "ECON 110B", "ECON 110A", "ECON 2"]) })), detail, record).items;
    assert.equal(bucketOf("ECON 110A", again), "left out");
    assert.equal(bucketOf("ECON 2", again), "left out");
  });

  test("a course not on the quarter's schedule is not suggested for it", () => {
    const off = buildSuggestions(candidates(input({ rows: [row("ECON 110A", { o: 0 })] })), detail, record);
    assert.equal(off.items.length, 0);
  });

  test("without a saved history nothing is called ready unless UCSD lists no prerequisites", () => {
    const none = buildSuggestions(groups, detail, studentRecord(null, [], TODAY)).items;
    assert.deepEqual(none.filter((s) => s.bucket === "ready").map((s) => s.row.k), ["ECON 2"]);
  });

  test("a course whose details did not load is never ready", () => {
    const blind = buildSuggestions(groups, () => undefined, record).items;
    assert.ok(blind.every((s) => s.bucket === "review"));
  });

  test("a major with no modelled requirements gets exploration, not requirements", () => {
    const explore = candidates(input({ targets: {}, majorModelled: false }));
    assert.equal(explore[0].category, null);
    const { items } = buildSuggestions(explore, detail, record);
    assert.ok(items.every((s) => s.requirement === null));
  });

  test("a tangled prerequisite naming none of the student's courses is left out, and counted", () => {
    const pre: Record<string, string | null> = { ...PRE, "ECON 140": "ECON 199 or MATH 999 and ECON 998; restricted to majors." };
    const rows = [...ROWS, row("ECON 140")];
    const r = buildSuggestions(candidates(input({ rows })), (c) => (c in pre ? { pre: pre[c], res: null } : undefined), record);
    assert.equal(bucketOf("ECON 140", r.items), "left out");
    assert.ok(r.notYet >= 1);
  });

  test("UCSD's every-undergraduate restriction is a note; a graduate-only course is never suggested", () => {
    const res: Record<string, string> = {
      "ECON 110A": "Limited to class level: Freshman, Junior, Sophomore, Senior",
      "ECON 2": "Limited to academic level: Graduate",
    };
    const r = buildSuggestions(groups, (c) => (c in PRE ? { pre: PRE[c], res: res[c] ?? null } : undefined), record).items;
    const e110a = r.find((s) => s.row.k === "ECON 110A")!;
    assert.equal(e110a.bucket, "ready");
    assert.deepEqual(e110a.notes, ["Open to undergraduates."]);
    assert.equal(bucketOf("ECON 2", r), "left out");
  });

  test("a Junior/Senior restriction cannot be checked, so the course needs a check", () => {
    const r = buildSuggestions(groups, (c) => (c in PRE ? { pre: PRE[c], res: c === "ECON 110A" ? "Limited to class level: Junior, Senior" : null } : undefined), record).items;
    assert.equal(bucketOf("ECON 110A", r), "review");
  });

  test("asks only for the subjects its candidates need", () => {
    assert.deepEqual(subjectsFor(groups), ["ECON"]);
  });
});
