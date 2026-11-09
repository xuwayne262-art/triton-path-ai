import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readAcademicHistory, isEmpty, NO_QUARTER } from "./parse";
import { historyTotals, listAttempts } from "./attempts";
import { readTss, looksLikeTss } from "./tss";
import {
  ROW_OF as ROW, TSS_CRLF_NBSP, TSS_DESCENDING, TSS_FIXTURE, TSS_IDENTITY, TSS_LINE_PER_CELL, TSS_SPACED,
} from "./fixtures";

/** Nov 8, 2026 in San Diego: Fall 2026 under way, Summer Session II 2026 over. */
const TODAY = "2026-11-08";

/** The catalog as far as these tests need it. "MAE 02" really is the catalog's key. */
const CATALOG = new Set([
  "BIEB 102", "ECON 110B", "MGT 160", "MGT 162R", "MGT 180R", "WCWP 10B", "CSE 12", "CSE 11", "MAE 02", "MATH 18",
]);
const has = (code: string) => CATALOG.has(code);

const read = (text: string) => readAcademicHistory(text, { today: TODAY, has });

/** The academic facts every variant of the fixture must agree on. */
function assertFixtureFacts(text: string, label: string) {
  const r = read(text);
  const h = r.history;
  assert.equal(r.report.source, "tss", label);
  assert.deepEqual(h.terms.map((t) => t.code), ["S226", "FA26"], `${label}: two terms, oldest first`);
  const fall = h.terms.find((t) => t.code === "FA26")!;
  const summer = h.terms.find((t) => t.code === "S226")!;
  assert.deepEqual(fall.courses.map((c) => c.code), ["BIEB 102", "ECON 110B", "MGT 160", "MGT 162R"], label);
  assert.deepEqual(summer.courses.map((c) => c.code), ["MGT 180R", "WCWP 10B"], label);
  for (const c of fall.courses) {
    assert.equal(c.grade, null, `${label}: ${c.code} keeps its blank grade`);
    assert.equal(c.units, 4, label);
    assert.equal(c.status, "progress", `${label}: ${c.code} is in progress on Nov 8`);
    assert.equal(c.option, "Letter Grade", label);
  }
  const fin = summer.courses[0];
  assert.equal(fin.grade, "C+", label);
  assert.equal(fin.points, 9.2, `${label}: 9.2000 is grade points`);
  assert.equal(fin.units, 4, `${label}: and never units`);
  assert.equal(fin.cnv, true, `${label}: CNV is a marker on the grading option`);
  assert.equal(fin.option, "Letter Grade", label);
  const wcwp = summer.courses[1];
  assert.equal(wcwp.src, "WCWP-010B", `${label}: the source's own code is kept`);
  assert.equal(wcwp.number, "10B", label);
  assert.equal(wcwp.unmatched, undefined, `${label}: matched to the catalog`);
  assert.equal(r.unplaced.length, 0, label);
  assert.equal(r.report.rows, 6, `${label}: six attempts`);
  const totals = historyTotals(h, TODAY);
  assert.equal(totals.currentUnits, 16, `${label}: 16 units in progress`);
  assert.equal(totals.earnedUnits, 8, `${label}: 8 units earned`);
  assert.equal(totals.courses, 6, label);
  assert.equal(h.totals.gpa, null, `${label}: no GPA is made up`);
  assert.equal(h.college, null, `${label}: no college inferred`);
  assert.deepEqual(h.majors, [], `${label}: no major inferred`);
}

describe("the TSS fixture", () => {
  test("as copied: tab-separated rows", () => assertFixtureFacts(TSS_FIXTURE, "tabs"));
  test("one cell per line, blank cells gone, a title wrapped and the heading split", () =>
    assertFixtureFacts(TSS_LINE_PER_CELL, "line per cell"));
  test("tabs turned into spaces", () => assertFixtureFacts(TSS_SPACED, "spaces"));
  test("CRLF, non-breaking spaces and a header before every row", () => assertFixtureFacts(TSS_CRLF_NBSP, "crlf"));

  test("never produces 24 completed units", () => {
    const t = historyTotals(read(TSS_FIXTURE).history, TODAY);
    assert.equal(t.completed, 2);
    assert.equal(t.inProgress, 4);
    assert.notEqual(t.earnedUnits, 24);
  });

  test("Academic Events after the courses neither stops the read nor adds a course", () => {
    const r = read(TSS_FIXTURE);
    const codes = r.history.terms.flatMap((t) => t.courses.map((c) => c.code));
    assert.ok(!codes.some((c) => /^UC |ENTR/.test(c)), codes.join(", "));
  });

  test("a wrapped title is joined, not split into a second course", () => {
    const econ = read(TSS_LINE_PER_CELL).history.terms.find((t) => t.code === "FA26")!.courses[1];
    assert.equal(econ.title, "Short Run Macroeconomics");
  });

  test("the identity block above the courses is never read into the record", () => {
    const r = read(`${TSS_IDENTITY}\n${TSS_FIXTURE}`);
    const json = JSON.stringify(r.history);
    for (const secret of ["McFixture", "Testy", "A99999999", "tmcfixture", "858-555", "she/her"]) {
      assert.ok(!json.includes(secret), `${secret} leaked into the record`);
    }
    assert.equal(r.report.rows, 6);
  });

  test("descending order still files each course under its own heading", () => {
    const h = read(TSS_DESCENDING).history;
    assert.deepEqual(h.terms.map((t) => [t.code, t.courses.map((c) => c.code)]), [
      ["S226", ["MGT 180R"]],
      ["FA26", ["BIEB 102"]],
    ]);
  });

  test("keeps the printed dates on each term", () => {
    const fall = read(TSS_FIXTURE).history.terms.find((t) => t.code === "FA26")!;
    assert.equal(fall.start, "2026-09-21");
    assert.equal(fall.end, "2026-12-12");
  });
});

describe("blank grades and the word Active", () => {
  const past = [
    "2025/2026 Spring Quarter",
    "03/30/2026 - 06/12/2026",
    "Active",
    ROW("CSE-12", "Basic Data Structures", "4.00", "Letter Grade", "", ""),
    "2026/2027 Fall Quarter",
    "Active",
    ROW("CSE-11", "Accel Intro to Programming", "4.00", "Letter Grade", "", ""),
  ].join("\n");

  test("a blank grade in a past term is missing, not completed and not in progress", () => {
    const a = listAttempts(read(past).history, TODAY);
    const cse12 = a.find((x) => x.course.code === "CSE 12")!;
    assert.equal(cse12.status, "missing");
    assert.equal(cse12.standing, "missing-grade");
    const t = historyTotals(read(past).history, TODAY);
    assert.equal(t.earnedUnits, 0, "Active on a past card earned nothing");
    assert.equal(t.currentUnits, 4, "only Fall 2026 is in progress");
  });

  test("the same blank grade reads as in progress while its term runs", () => {
    const a = listAttempts(read(past).history, "2026-05-01");
    assert.equal(a.find((x) => x.course.code === "CSE 12")!.standing, "in-progress");
  });
});

describe("marks that earn nothing, and marks it does not know", () => {
  const marks = [
    "2025/2026 Winter Quarter",
    ROW("CSE-11", "Accel Intro", "4.00", "Letter Grade", "F", "0.0000"),
    ROW("MATH-18", "Linear Algebra", "4.00", "Pass/No Pass", "NP", ""),
    ROW("MGT-160", "Experiments in Firms", "4.00", "Letter Grade", "W", ""),
    ROW("MGT-162R", "Negotiations", "4.00", "Letter Grade", "I", ""),
    ROW("BIEB-102", "Intro Eclgy", "4.00", "Letter Grade", "XQ", ""),
  ].join("\n");

  test("F, NP, W, I and an unknown mark earn no units", () => {
    const r = read(marks);
    const t = historyTotals(r.history, TODAY);
    assert.equal(t.earnedUnits, 0);
    assert.equal(t.completed, 0);
    const byCode = new Map(listAttempts(r.history, TODAY).map((a) => [a.course.code, a.standing]));
    assert.equal(byCode.get("CSE 11"), "no-credit");
    assert.equal(byCode.get("MATH 18"), "no-credit");
    assert.equal(byCode.get("MGT 160"), "withdrawn");
    assert.equal(byCode.get("MGT 162R"), "incomplete");
    assert.equal(byCode.get("BIEB 102"), "needs-review", "an unknown mark is never a pass");
  });

  test("an unknown mark is kept as printed and reported", () => {
    const r = read(marks);
    const bieb = r.history.terms[0].courses.find((c) => c.code === "BIEB 102")!;
    assert.equal(bieb.grade, "XQ");
    assert.deepEqual(bieb.review, ["unknown-grade"]);
    assert.ok(r.report.messages.some((m) => m.code === "UNKNOWN_GRADE"));
  });

  test("grade points that disagree with the grade flag the row for review", () => {
    const r = read(["2025/2026 Winter Quarter", ROW("CSE-11", "Accel Intro", "2.00", "Letter Grade", "A", "16.0000")].join("\n"));
    assert.deepEqual(r.history.terms[0].courses[0].review, ["points-mismatch"]);
    assert.equal(historyTotals(r.history, TODAY).earnedUnits, 0, "a row under review counts for nothing");
  });
});

describe("copies of the same attempt, and real repeats", () => {
  test("Current Bookings and Academic History listing the same course keep it once", () => {
    const text = [
      "Current Bookings",
      "2026/2027 Fall Quarter",
      ROW("Course", "Course Title", "Units", "Grading Option"),
      ROW("BIEB-102", "Intro Eclgy/Organisms&Habitats", "4.00", "Letter Grade"),
      ROW("MGT-160", "Experiments in Firms", "4.00", "Letter Grade"),
      "Academic History",
      TSS_FIXTURE,
    ].join("\n");
    const r = read(text);
    const fall = r.history.terms.find((t) => t.code === "FA26")!;
    assert.equal(fall.courses.length, 4);
    assert.equal(r.report.duplicates, 2);
    assert.equal(historyTotals(r.history, TODAY).currentUnits, 16);
  });

  test("pasting the same page twice changes nothing", () => {
    const once = read(TSS_FIXTURE).history;
    const twice = read(`${TSS_FIXTURE}\n${TSS_FIXTURE}`).history;
    assert.deepEqual(twice.terms, once.terms);
  });

  test("a course taken in two quarters keeps both attempts and earns its units once", () => {
    const text = [
      "2025/2026 Winter Quarter",
      ROW("CSE-12", "Basic Data Structures", "4.00", "Letter Grade", "F", "0.0000"),
      "2025/2026 Spring Quarter",
      ROW("CSE-12", "Basic Data Structures", "4.00", "Letter Grade", "B", "12.0000"),
      "2025/2026 Summer Session 1",
      ROW("CSE-12", "Basic Data Structures", "4.00", "Letter Grade", "A", "16.0000"),
    ].join("\n");
    const h = read(text).history;
    const attempts = listAttempts(h, TODAY).filter((a) => a.course.code === "CSE 12");
    assert.deepEqual(attempts.map((a) => a.term), ["WI26", "SP26", "S126"]);
    assert.ok(attempts.every((a) => a.repeated));
    const t = historyTotals(h, TODAY);
    assert.equal(t.earnedUnits, 4, "credit for a repeat is not counted twice");
    assert.deepEqual(t.repeated, ["CSE 12"]);
  });

  test("two different grades for one attempt are flagged, not resolved by guessing", () => {
    const text = [
      "2025/2026 Winter Quarter",
      ROW("CSE-12", "Basic Data Structures", "4.00", "Letter Grade", "B", "12.0000"),
      "2025/2026 Winter Quarter",
      ROW("CSE-12", "Basic Data Structures", "4.00", "Letter Grade", "C", "8.0000"),
    ].join("\n");
    const c = read(text).history.terms[0].courses;
    assert.equal(c.length, 1);
    assert.deepEqual(c[0].review, ["conflicting-copies"]);
  });
});

describe("codes", () => {
  test("ECON-110B, ECON 110B and a wrapped ECON- / 110B are one course", () => {
    for (const cell of ["ECON-110B", "ECON 110B", "ECON-\n110B"]) {
      const text = `2026/2027 Fall Quarter\n${cell}\tShort Run Macroeconomics\t4.00\tLetter Grade\t\t`;
      assert.deepEqual(read(text).history.terms[0].courses.map((c) => c.code), ["ECON 110B"], JSON.stringify(cell));
    }
  });

  test("a leading zero is only dropped when the catalog says so", () => {
    const text = [
      "2025/2026 Winter Quarter",
      ROW("MAE-02", "Intro Engineering Graphics", "4.00", "Letter Grade", "A", "16.0000"),
      ROW("WCWP-010B", "The Writing Course B", "4.00", "Letter Grade", "A", "16.0000"),
      ROW("HIST-099Z", "A Retired Course", "4.00", "Letter Grade", "A", "16.0000"),
    ].join("\n");
    const [mae, wcwp, old] = read(text).history.terms[0].courses;
    assert.equal(mae.code, "MAE 02", "MAE 02 is the catalog's own key");
    assert.equal(wcwp.code, "WCWP 10B");
    assert.equal(old.code, "HIST 099Z", "an unmatched course keeps its printed code");
    assert.equal(old.unmatched, true);
    assert.equal(old.src, "HIST-099Z");
    assert.equal(historyTotals(read(text).history, TODAY).earnedUnits, 12, "a retired course still earned its units");
  });
});

describe("terms", () => {
  test("Winter, Spring and summer headings take the academic year's second year", () => {
    const text = [
      "2026/2027 Winter Quarter", ROW("CSE-11", "A", "4.00", "Letter Grade", "", ""),
      "2026/2027 Spring Quarter", ROW("CSE-12", "B", "4.00", "Letter Grade", "", ""),
      "2026/2027 Summer Session 1", ROW("MATH-18", "C", "4.00", "Letter Grade", "", ""),
      "2026/2027 Summer Session 2", ROW("MGT-160", "D", "4.00", "Letter Grade", "", ""),
      "2026/2027 Special Session", ROW("BIEB-102", "E", "4.00", "Letter Grade", "", ""),
    ].join("\n");
    assert.deepEqual(read(text).history.terms.map((t) => t.code), ["WI27", "SP27", "S127", "SS27", "S227"]);
  });

  test("printed dates that do not fit the heading are reported and the heading wins", () => {
    const text = ["2026/2027 Fall Quarter", "01/04/2027 - 03/20/2027", ROW("CSE-11", "A", "4.00", "Letter Grade", "", "")].join("\n");
    const r = read(text);
    assert.equal(r.history.terms[0].code, "FA26");
    assert.ok(r.report.messages.some((m) => m.code === "DATES_CONFLICT"));
  });
});

describe("rows the paste did not place", () => {
  test("rows before any heading are kept for the student to place, never guessed into a term", () => {
    const text = [
      "Current Bookings",
      ROW("Course", "Course Title", "Units", "Grading Option"),
      ROW("BIEB-102", "Intro Eclgy/Organisms&Habitats", "4.00", "Letter Grade"),
    ].join("\n");
    const r = read(text);
    assert.equal(r.history.terms.length, 0);
    assert.equal(r.unplaced.length, 1);
    assert.deepEqual(r.unplaced[0].review, ["no-quarter"]);
    assert.equal(r.report.suggestedTerm, "FA26", "the quarter under way is offered, not applied");
    assert.ok(r.report.messages.some((m) => m.code === "NO_QUARTER"));
    assert.equal(NO_QUARTER, "NOQTR");
  });

  test("a course row after Academic Events is not filed under the quarter before it", () => {
    const text = `${TSS_FIXTURE}\n${ROW("CSE-11", "Stray Row", "4.00", "Letter Grade", "A", "16.0000")}`;
    const r = read(text);
    assert.ok(!r.history.terms.some((t) => t.courses.some((c) => c.code === "CSE 11")));
    assert.equal(r.unplaced[0]?.code, "CSE 11");
  });

  test("External Work rows are never read as UCSD courses", () => {
    const text = [
      TSS_FIXTURE,
      "External Work",
      "2019/2020 Fall Quarter",
      ROW("External", "Grade", "Internal", "Grade"),
      ROW("AP35", "5", "ECON-1", "TR"),
      "Admissions",
    ].join("\n");
    const r = read(text);
    assert.ok(!r.history.terms.some((t) => t.code === "FA19"));
    assert.ok(!JSON.stringify(r.history.terms).includes("ECON 1\""));
    assert.ok(r.report.messages.some((m) => m.code === "EXTERNAL_NOT_READ"));
    assert.equal(readTss(text).externalRows, 2);
  });
});

describe("pastes with nothing to import", () => {
  test("a TSS page with no course rows says what to do in TSS, without blaming the copy", () => {
    const r = read("My Academic History\nAcademic History\nUndergraduate\nBy Quarter\n2026/2027 Fall Quarter\n09/21/2026 - 12/12/2026\nActive\n");
    assert.equal(isEmpty(r.history), true);
    const first = r.report.messages[0];
    assert.equal(first.code, "NO_ROWS_TSS");
    assert.match(first.text, /By Quarter/);
    assert.doesNotMatch(first.text, /whole page/i);
  });

  test("a degree audit is not read as completed courses", () => {
    const audit = [
      "Degree Audit Report",
      "Major in Business Economics",
      "NEEDS: 1 COURSE",
      "SELECT FROM: MATH 18, MATH 31AH, ECON 120A",
      "Upper-division writing requirement complete",
    ].join("\n");
    const r = read(audit);
    assert.equal(isEmpty(r.history), true);
    assert.equal(r.report.messages[0].code, "AUDIT_TEXT");
  });

  test("random text is not an Academic History", () => {
    const r = read("hello world\nthis is not a transcript");
    assert.equal(r.report.source, "unknown");
    assert.equal(r.report.messages[0].code, "NOT_HISTORY");
  });

  test("an enormous paste is cut short and says so, rather than freezing the page", () => {
    const big = TSS_FIXTURE + "\n" + "x".repeat(500_000);
    const r = read(big);
    assert.ok(r.report.messages.some((m) => m.code === "TRUNCATED"));
    assert.equal(r.report.rows, 6);
  });
});

describe("source detection", () => {
  test("TSS pages are recognised and TritonLink pages are not", () => {
    assert.equal(looksLikeTss(TSS_FIXTURE), true);
    assert.equal(looksLikeTss("Term: Fall Quarter 2025\nCSE 11 Accel Intro 4.00 A 16.00"), false);
  });
});
