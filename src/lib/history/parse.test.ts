import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { gradeStatus, isEmpty, parseAcademicHistory, termCode, termOrder } from "./parse";

/** A record in the shape TritonLink prints, as a select-all copy produces it. */
const PAGE = `
Academic History
Name: Student, Example
PID: A12345678
College: Sixth College
Major: Computer Science
Minor: Mathematics

Transfer Credit
AP CA4 Calculus AB
College Board 8.00 P SP24 LD MATH 20A
MATH 20B
PSYC 1A General Psychology
Grossmont College 6.00 P SP24 LD PSYC 1

Term: Fall Quarter 2025
CSE 11 Accel Intro to Programming 4.00 A 16.00
MATH 20C Calculus & Analytic Geometry 4.00 B+ 13.20
CAT 1 Culture Art and Technology 4.00 P 0.00
Term GPA: 3.65 Term Units: 12.00

Term: Winter Quarter 2026
CSE 12 Basic Data Structures 4.00 A- 14.80
CSE 15L Software Tools 2.00 W 0.00
MATH 18 Linear Algebra 4.00 IP

Cumulative GPA: 3.70
`;

describe("termCode", () => {
  test("maps the three main quarters", () => {
    assert.equal(termCode("Fall Quarter 2025"), "FA25");
    assert.equal(termCode("Winter Quarter 2026"), "WI26");
    assert.equal(termCode("Spring Qtr 2026"), "SP26");
  });

  test("keeps summer sessions apart — they are different terms", () => {
    assert.equal(termCode("Summer Session I 2025"), "S125");
    assert.equal(termCode("Summer Session II 2025"), "S225");
    assert.equal(termCode("Sum Ses III 2025"), "S325");
  });

  test("returns null rather than guessing at anything else", () => {
    for (const s of ["", "Transfer Credit", "Cumulative GPA: 3.7", "2025"]) {
      assert.equal(termCode(s), null, s);
    }
  });
});

describe("termOrder", () => {
  test("sorts by real time, not alphabetically", () => {
    const sorted = ["SP26", "FA25", "WI26", "S125"].sort((a, b) => termOrder(a) - termOrder(b));
    // An academic year runs Fall -> Winter -> Spring, so Fall 2025 precedes
    // Winter 2026 — but Summer 2025 is earlier still, because it happens in
    // mid-2025 and belongs to the year before.
    assert.deepEqual(sorted, ["S125", "FA25", "WI26", "SP26"]);
  });

  test("puts a summer session after the spring it follows", () => {
    const sorted = ["FA26", "S126", "SP26"].sort((a, b) => termOrder(a) - termOrder(b));
    assert.deepEqual(sorted, ["SP26", "S126", "FA26"]);
  });

  test("parks unrecognised codes at the end instead of at the start", () => {
    assert.ok(termOrder("XFER") > termOrder("FA99"));
  });
});

describe("gradeStatus", () => {
  test("separates passing, failing, withdrawn and in-progress", () => {
    assert.equal(gradeStatus("A-"), "graded");
    assert.equal(gradeStatus("F"), "fail");
    assert.equal(gradeStatus("P"), "pass");
    assert.equal(gradeStatus("NP"), "fail");
    assert.equal(gradeStatus("W"), "withdrawn");
    assert.equal(gradeStatus("IP"), "progress");
    assert.equal(gradeStatus(null), "progress");
  });
});

describe("parseAcademicHistory", () => {
  const h = parseAcademicHistory(PAGE);

  test("reads the college, major and minor", () => {
    assert.equal(h.college, "Sixth College");
    assert.deepEqual(h.majors, ["Computer Science"]);
    assert.deepEqual(h.minors, ["Mathematics"]);
  });

  test("groups coursework under its own term, in chronological order", () => {
    assert.deepEqual(h.terms.map((t) => t.code), ["FA25", "WI26"]);
    assert.deepEqual(h.terms[0].courses.map((c) => c.code), ["CSE 11", "MATH 20C", "CAT 1"]);
  });

  test("keeps the grade exactly as printed", () => {
    const cse12 = h.terms[1].courses.find((c) => c.code === "CSE 12");
    assert.equal(cse12?.grade, "A-");
    assert.equal(cse12?.units, 4);
    assert.equal(cse12?.points, 14.8);
  });

  test("reads a row that has no grade yet rather than dropping it", () => {
    const m18 = h.terms[1].courses.find((c) => c.code === "MATH 18");
    assert.ok(m18, "MATH 18 survived having no points column");
    assert.equal(m18?.grade, "IP");
    assert.equal(m18?.status, "progress");
  });

  test("counts P toward units earned but never toward GPA", () => {
    // FA25: CSE 11 (A, 4u) + MATH 20C (B+, 4u) + CAT 1 (P, 4u)
    // WI26: CSE 12 (A-, 4u); CSE 15L withdrawn; MATH 18 in progress
    assert.equal(h.totals.unitsEarned, 16);
    assert.equal(h.totals.unitsInProgress, 4);
    // GPA over the 12 graded units only: (4*4 + 3.3*4 + 3.7*4) / 12
    assert.equal(h.totals.gpa, 3.67);
  });

  test("excludes a withdrawal from both units and GPA", () => {
    const w = h.terms[1].courses.find((c) => c.code === "CSE 15L");
    assert.equal(w?.status, "withdrawn");
    assert.ok(!h.totals.unitsEarned.toString().includes("18"), "2 withdrawn units not earned");
  });

  test("recognises transfer credit from a college, not just AP", () => {
    const from = h.transfer.map((t) => t.from);
    assert.ok(from.includes("Grossmont College"), `community-college row read: ${from.join(" | ")}`);
    assert.ok(from.includes("College Board"), "AP row read");
    assert.equal(h.totals.transferUnits, 14);
  });

  test("collects every UCSD equivalent a transfer row lists", () => {
    const ap = h.transfer.find((t) => t.from === "College Board");
    assert.deepEqual(ap?.equivalents, ["MATH 20A", "MATH 20B"]);
  });

  test("does not mistake a Roman numeral for a subject code", () => {
    const parsed = parseAcademicHistory("Term: Fall Quarter 2025\nII 6 Calculus 6.00 A 24.00");
    assert.equal(parsed.terms.length, 0, "no course invented from 'Calculus II'");
  });

  test("reports two rows joined into one line instead of inventing a course", () => {
    // A PDF extractor does this when a column overflows. Accepting it would
    // keep CSE 11 with a nonsense title and lose MATH 20C entirely.
    const parsed = parseAcademicHistory(
      "Term: Fall Quarter 2025\nCSE 11 Accel Intro 4.00 A 16.00 MATH 20C Calculus 4.00 B+ 13.20\n",
    );
    assert.equal(parsed.terms.length, 0, "no half-read course kept");
    assert.equal(parsed.warnings.length, 1);
    assert.match(parsed.warnings[0], /MATH 20C/);
  });

  test("ignores page furniture", () => {
    assert.ok(!h.warnings.some((w) => /PID|Cumulative|Term GPA/i.test(w)), h.warnings.join(" | "));
  });

  test("treats a paste that is not an Academic History as empty", () => {
    const junk = parseAcademicHistory("hello world\nthis is not a transcript");
    assert.equal(isEmpty(junk), true);
    assert.equal(isEmpty(h), false);
  });

  test("survives empty and non-string input", () => {
    for (const bad of ["", null, undefined, 42]) {
      const parsed = parseAcademicHistory(bad as unknown as string);
      assert.equal(isEmpty(parsed), true);
      assert.equal(parsed.totals.gpa, null);
    }
  });

  test("reads the same record out of PDF-extracted spacing", () => {
    // A PDF extractor pads columns with runs of spaces and non-breaking spaces.
    const pdf = PAGE.replace(/ /g, "   ");
    const p = parseAcademicHistory(pdf);
    assert.deepEqual(p.terms.map((t) => t.code), ["FA25", "WI26"]);
    assert.equal(p.totals.unitsEarned, 16);
  });

  test("handles a term header that lost its 'Term:' label in the copy", () => {
    const p = parseAcademicHistory("Fall Quarter 2025\nCSE 11 Accel Intro 4.00 A 16.00");
    assert.deepEqual(p.terms.map((t) => t.code), ["FA25"]);
  });
});
