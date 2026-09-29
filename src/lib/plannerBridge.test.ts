import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { completedCourses, isArrangedCourse, recommend, requirementCategories } from "./plannerBridge";
import type { GradeStatus, HistoryCourse } from "./history/parse";
import type { CourseRow } from "./plat";

function course(k: string, over: Partial<CourseRow> = {}): CourseRow {
  const [s, c] = k.split(" ");
  return {
    k, s, c, t: k, u: "4", g: 3.2, a: 40, r: 6, o: 1, pr: 0,
    sa: 10, sl: 100, d: "MWF", st: "9:00a", en: "9:50a", b: null,
    p: null, pq: null, pn: null, pa: null, pd: null, pg: null,
    ...over,
  };
}

const CS = new Set(["CSE", "ECE"]);

describe("requirementCategories", () => {
  test("a major subject counts toward its division", () => {
    assert.deepEqual(requirementCategories(course("CSE 12"), CS, null), ["Lower Division"]);
    assert.deepEqual(requirementCategories(course("CSE 101"), CS, null), ["Upper Division"]);
    assert.deepEqual(requirementCategories(course("CSE 291"), CS, null), []);
  });

  test("only the student's own college's GE list counts", () => {
    const astro = course("ASTR 3", { ge: ["marshall:Natural Science", "revelle:Natural Science"] });
    assert.deepEqual(requirementCategories(astro, CS, "revelle"), ["Science"]);
    assert.deepEqual(requirementCategories(astro, CS, "erc"), [], "Marshall's list is not ERC's");
  });

  test("a college's core sequence is recognised by its subject", () => {
    assert.deepEqual(requirementCategories(course("HUM 1"), CS, "revelle"), ["Humanities (HUM)"]);
    assert.deepEqual(requirementCategories(course("HUM 88"), CS, "revelle"), [], "a seminar, not the sequence");
    assert.deepEqual(requirementCategories(course("HUM 1"), CS, "muir"), []);
  });
});

describe("recommend", () => {
  const rows = [
    course("CSE 11", { sl: 400 }),
    course("CSE 12", { sl: 300 }),
    course("CSE 8A", { sl: 200, o: 0 }), // not offered this term
    course("CSE 100", { sl: 250 }),
    course("HUM 1", { sl: 500 }),
    course("MATH 20A", { sl: 900, ge: ["revelle:Mathematics"] }),
  ];
  const targets = { "Lower Division": 20, "Upper Division": 36, "Humanities (HUM)": 24, Math: 12 };

  test("offers only what runs this term and is not already on the schedule", () => {
    const groups = recommend(rows, targets, {}, new Set(["CSE 12"]), CS, "revelle", true);
    const codes = groups.flatMap((g) => g.items.map((i) => i.row.k));
    assert.ok(!codes.includes("CSE 8A"));
    assert.ok(!codes.includes("CSE 12"));
    assert.ok(codes.includes("CSE 11"));
  });

  test("files each course once, under what has the most left to earn", () => {
    const groups = recommend(rows, targets, {}, new Set(), CS, "revelle", true);
    assert.deepEqual(groups.map((g) => g.category), ["Upper Division", "Humanities (HUM)", "Lower Division", "Math"]);
    assert.deepEqual(groups.find((g) => g.category === "Lower Division")?.items.map((i) => i.row.k), ["CSE 11", "CSE 12"]);
  });

  test("independent study, internships and seminars are never recommended", () => {
    // CSE 199's many one-student sections out-seat every lecture on popularity.
    const withStudy = [...rows, course("CSE 199", { sl: 5000 }), course("CSE 198", { sl: 3000 }), course("CSE 87", { sl: 900 })];
    const codes = recommend(withStudy, targets, {}, new Set(), CS, "revelle", true).flatMap((g) => g.items.map((i) => i.row.k));
    assert.ok(!codes.some((c) => ["CSE 199", "CSE 198", "CSE 87"].includes(c)), codes.join(", "));
    assert.ok(codes.includes("CSE 100"));
    assert.equal(isArrangedCourse(course("CSE 190")), false, "a topics course is a real course");
  });

  test("a met requirement recommends nothing more", () => {
    const groups = recommend(rows, targets, { Math: 12 }, new Set(), CS, "revelle", true);
    assert.ok(!groups.some((g) => g.category === "Math"));
  });

  test("a major without modelled requirements still sees its popular courses, labelled as such", () => {
    const econ = new Set(["ECON"]);
    const groups = recommend([course("ECON 1", { sl: 600 }), course("ECON 100A")], {}, {}, new Set(), econ, null, false);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].category, null);
    assert.deepEqual(groups[0].items.map((i) => i.row.k), ["ECON 1"]);
  });
});

describe("completedCourses — what an Academic History adds to degree progress", () => {
  const taken = (code: string, grade: string | null, status: GradeStatus, units = 4): HistoryCourse => {
    const [subject, number] = code.split(" ");
    return { code, subject, number, title: code, units, grade, points: null, status };
  };
  const history = (...courses: HistoryCourse[]) => ({ terms: [{ code: "FA24", label: "Fall Quarter 2024", courses }] });
  const catalog = new Map([["CSE 12", course("CSE 12")], ["CSE 30", course("CSE 30")], ["CSE 100", course("CSE 100")]]);
  const rowFor = (code: string) => catalog.get(code);

  test("counts a passing grade and a P — not an F, a W, or a course still in progress", () => {
    const done = completedCourses(
      history(taken("CSE 12", "B+", "graded"), taken("CSE 30", "P", "pass"),
        taken("CSE 100", "F", "fail"), taken("CSE 101", "W", "withdrawn"), taken("CSE 105", null, "progress")),
      rowFor, CS,
    );
    assert.deepEqual(done.map((c) => c.code), ["CSE 12", "CSE 30"]);
  });

  test("uses the units actually earned, and the catalog's requirement categories", () => {
    const [cse12] = completedCourses(history(taken("CSE 12", "A", "graded", 2)), rowFor, CS);
    assert.equal(cse12.units, 2);
    assert.deepEqual(cse12.categories, ["Lower Division"]);
  });

  test("counts a repeated course once", () => {
    const done = completedCourses(
      { terms: [
        { code: "FA24", label: "Fall Quarter 2024", courses: [taken("CSE 12", "D", "graded")] },
        { code: "WI25", label: "Winter Quarter 2025", courses: [taken("CSE 12", "A", "graded")] },
      ] },
      rowFor, CS,
    );
    assert.equal(done.length, 1);
  });

  test("keeps a course the catalog does not know, so the totals still count it", () => {
    const [odd] = completedCourses(history(taken("PHYS 1AL", "A", "graded", 2)), rowFor, CS);
    assert.equal(odd.code, "PHYS 1AL");
    assert.equal(odd.units, 2);
    assert.equal(odd.categories, undefined);
  });

  test("adds nothing without a saved history", () => {
    assert.deepEqual(completedCourses(null, rowFor, CS), []);
  });
});
