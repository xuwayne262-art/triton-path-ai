import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEPARTMENTS } from "@/data/ucsdStructure";
import type { GEFile, PlatIndex, SubjectFile } from "@/lib/plat";
import { groupSections } from "@/lib/sections";
import { blankPlanner, planFingerprint } from "@/lib/plan/patch";
import type { ParsedHistory } from "@/lib/history/parse";
import { parseLocal } from "./localParse";
import { resolveGoal, type Goal } from "./requirements";
import { buildPlanOptions, findFitting, type Ask, type DataAccess, type PlanningContext } from "./engine";
import { checkPrerequisites, parsePrereq, studentRecord } from "./eligibility";
import { clashes, configFor, configurations, findRelaxation, pickOptions, search, type SearchCourse } from "./schedule";
import { verified } from "./explain";
import { pofcCourseFit, programById, resolvePofc } from "./warren";
import { NO_CONSTRAINTS, type Constraints } from "./types";
import { final, row, sec } from "./testFixtures";

// ── Real data, read from disk the way the browser reads it over HTTP ─────────

const ROOT = new URL("../../../public/data/plat/", import.meta.url);
const index = JSON.parse(readFileSync(new URL("index.json", ROOT), "utf8")) as PlatIndex;
const ge = JSON.parse(readFileSync(new URL("ge.json", ROOT), "utf8")) as GEFile;
const realRows = new Map(index.courses.map((c) => [c.k, c]));
const subjectFiles = new Map<string, SubjectFile>();

function realData(): DataAccess {
  return {
    term: index.meta.term,
    termName: index.meta.termName,
    rows: index.courses,
    row: (c) => realRows.get(c),
    ge,
    detail: (code) => subjectFiles.get(realRows.get(code)?.s ?? "")?.courses[code],
    async load(subjects) {
      for (const s of subjects) {
        if (subjectFiles.has(s)) continue;
        try {
          subjectFiles.set(s, JSON.parse(readFileSync(new URL(`subject/${s}.json`, ROOT), "utf8")) as SubjectFile);
        } catch { /* no file this term */ }
      }
    },
    seatsAsOf: index.meta.seatsAsOf ?? null,
  };
}

function context(major: string, schedule: { code: string; selection?: { family: string; parts: Record<string, string> } }[] = [], history: ParsedHistory | null = null): PlanningContext {
  const doc = {
    ...blankPlanner(index.meta.term),
    schedule: schedule.map((s) => ({ id: s.code, course: { id: s.code, code: s.code, title: s.code, units: 4 } })),
    sections: Object.fromEntries(schedule.filter((s) => s.selection).map((s) => [s.code, s.selection!])),
  };
  return {
    data: realData(),
    student: { major, college: "warren", history },
    plan: {
      term: index.meta.term,
      schedule: schedule.map((s) => ({ code: s.code, units: 4, title: s.code })),
      selections: doc.sections,
      planned: [],
      fingerprint: planFingerprint(doc),
    },
  };
}

const ask = (over: Partial<Omit<Ask, "constraints">> & { constraints?: Partial<Constraints> }): Ask => ({
  target: { kind: "term", term: index.meta.term, label: index.meta.termName },
  preferences: [],
  goal: null,
  subjects: [],
  courses: [],
  keep: [],
  topic: null,
  ...over,
  constraints: { ...NO_CONSTRAINTS, ...over.constraints },
});

// ── The screenshot ───────────────────────────────────────────────────────────

describe("warren social science pofc with no prerequisites, end to end", () => {
  const vocab = {
    subjects: new Set(index.subjects.map((s) => s.code)),
    codes: new Set(index.courses.map((c) => c.k)),
    areas: ge.areas,
    departments: DEPARTMENTS.map((d) => ({ name: d.name, subjects: d.subjects })),
  };
  const reading = parseLocal("warren social science pofc with no prerequisites", vocab);

  test("asks which Social Sciences program, offering real ones and assuming none", () => {
    const r = resolveGoal(reading.requirement!, { major: "Biology (BS)", college: "warren" }, ge);
    assert.equal(r.kind, "ask");
    if (r.kind !== "ask") return;
    const names = [...r.question.options, ...(r.question.more ?? [])].map((o) => o.label);
    assert.ok(names.includes("Economics") && names.includes("Political Science") && names.includes("Psychology"));
    assert.ok(names.includes("Perspectives of Social Science"), "offered, never assumed");
    assert.notEqual(r.question.options[0].label, "Perspectives of Social Science");
    assert.ok(!names.includes("History"), "humanities programs are not social science ones");
  });

  test("a social science major is told the rule instead of shown courses that would not count", () => {
    const r = resolveGoal(reading.requirement!, { major: "Economics (BA)", college: "warren" }, ge);
    assert.equal(r.kind, "blocked");
    if (r.kind === "blocked") {
      assert.match(r.text, /outside your major's discipline/);
      assert.deepEqual(r.question?.options.map((o) => o.label), ["Humanities and Fine Arts", "Math, Natural Sciences, and Physical Sciences"]);
    }
  });

  test("with Economics chosen: real ECON courses, confirmed no prerequisites, never a verified requirement", async () => {
    const program = programById("economics")!;
    const goal: Goal = { kind: "warren", program, discipline: "social", profile: resolvePofc({ program: "economics" }, "Biology (BS)").profile };
    const result = await findFitting(context("Biology (BS)"), ask({ goal, constraints: { noPrerequisites: true } }), 10);
    const eligible = index.courses.filter((c) => c.s === "ECON" && c.o === 1 && !c.pr && c.u === "4" && parseInt(c.c, 10) < 200 && !/^19[5-9]/.test(c.c));
    if (eligible.length) assert.ok(result.cards.length > 0, "finds the ECON courses the data has");
    for (const card of result.cards) {
      assert.match(card.code, /^ECON /);
      assert.equal(card.units, "4", `${card.code} is a four-unit course`);
      const prereq = card.checks.find((c) => c.code.startsWith("PREREQ_"));
      assert.ok(prereq && ["PREREQ_NONE_STATED", "PREREQ_NONE_LISTED"].includes(prereq.code), `${card.code}: ${prereq?.code}`);
      const req = card.checks.find((c) => c.code === "REQ_RULE");
      assert.ok(req && !verified(req), "a rule-based PofC claim is never shown as verified");
      assert.ok(card.meetings.length > 0, "comes with its sections' times");
    }
  });
});

// ── Sections and clashes (synthetic) ─────────────────────────────────────────

describe("required components and finals", () => {
  const cse = [
    sec("A00", "LE", "MWF", "10:00a", "10:50a", { id: "L1" }), sec("A01", "DI", "Tu", "2:00p", "2:50p"), sec("A02", "DI", "Th", "4:00p", "4:50p"),
    final("2026-12-08", "8:00a", "10:59a", "L1"),
  ];
  const math = [sec("B00", "LE", "MWF", "11:00a", "11:50a", { id: "L2" }), sec("B01", "DI", "Tu", "2:00p", "2:50p"), final("2026-12-08", "8:00a", "10:59a", "L2")];

  test("a configuration always carries its required discussion and its final", () => {
    const configs = configurations("CSE 11", cse, NO_CONSTRAINTS);
    assert.equal(configs.length, 2);
    for (const c of configs) {
      assert.ok(c.selection?.parts.DI, "never a lecture alone");
      assert.equal(c.finals.length, 1);
    }
  });

  test("a discussion clash and a final clash are both clashes, even when lectures don't overlap", () => {
    const a = configFor("CSE 11", cse, { family: "A", parts: { DI: "A01" } })!;
    const b = configFor("MATH 20A", math, { family: "B", parts: { DI: "B01" } })!;
    const kinds = clashes([a, b]).map((c) => c.kind).sort();
    assert.deepEqual(kinds, ["final", "meeting"]);
  });

  test("hard time limits remove configurations instead of being bent", () => {
    assert.equal(configurations("CSE 11", cse, { ...NO_CONSTRAINTS, earliestStart: 11 * 60 }).length, 0);
    assert.equal(configurations("CSE 11", cse, { ...NO_CONSTRAINTS, avoidDays: ["Th"] as never }).length, 2);
    assert.equal(configurations("CSE 11", cse, { ...NO_CONSTRAINTS, avoidDays: ["Thu"] }).length, 1);
  });
});

describe("the bounded search", () => {
  const course = (code: string, sections: ReturnType<typeof sec>[], over: Partial<SearchCourse> = {}, k: Constraints = NO_CONSTRAINTS): SearchCourse => ({
    code, units: 4, configs: configurations(code, sections, k), required: false, relevance: 1, requirement: false, ...over,
  });
  const A = [sec("A00", "LE", "MWF", "9:00a", "9:50a"), sec("A00", "LE", "MWF", "9:00a", "9:50a")];
  const B = [sec("B00", "LE", "TuTh", "11:00a", "12:20p")];
  const C = [sec("C00", "LE", "MWF", "9:00a", "9:50a")];

  test("keeps the kept course, lands in the unit range, and never pairs a clash", () => {
    const kept = course("KEEP 1", B, { required: true });
    const result = search([kept, course("ADD 1", A), course("ADD 2", C)], { min: 8, max: 8 }, []);
    assert.ok(result.solutions.length > 0);
    for (const s of result.solutions) {
      assert.ok(s.configs.some((c) => c.course === "KEEP 1"));
      assert.equal(s.facts.units, 8);
      assert.equal(s.facts.conflicts, 0);
    }
    // ADD 1 and ADD 2 meet at the same time: no draft has both.
    const both = search([kept, course("ADD 1", A), course("ADD 2", C)], { min: 12, max: 12 }, []);
    assert.equal(both.solutions.length, 0);
    assert.equal(both.outcome.exhaustive, true, "it looked at everything, so 'nothing fits' is a real answer");
  });

  test("one possible week is one draft, not three", () => {
    const result = search([course("ONLY 1", B, { required: true })], { min: null, max: null }, []);
    assert.equal(pickOptions(result.solutions, [], []).length, 1);
  });

  test("names the one constraint whose loosening finds a draft", () => {
    const k: Constraints = { ...NO_CONSTRAINTS, earliestStart: 10 * 60, units: { min: 4, max: 4 } };
    const rebuild = (c: Constraints) => [course("ADD 1", A, {}, c)];
    assert.equal(search(rebuild(k), k.units, []).solutions.length, 0);
    assert.deepEqual(findRelaxation(rebuild, k, []), { kind: "earlier_start", to: 9 * 60 });
  });

  test("stops at its caps and says it stopped", () => {
    const many = Array.from({ length: 10 }, (_, i) => course(`X ${i}`, [sec("A00", "LE", "MWF", `${8 + (i % 4)}:00a`, `${8 + (i % 4)}:50a`)]));
    const capped = search(many, { min: 16, max: 16 }, [], { maxStates: 5, maxMs: 1000, maxSubsets: 1000, maxSolutions: 100 });
    assert.equal(capped.outcome.exhaustive, false);
  });
});

// ── Prerequisites ────────────────────────────────────────────────────────────

describe("prerequisites against the saved Academic History", () => {
  const history = (courses: [string, string | null][], transfer: string[] = []): ParsedHistory => ({
    college: null, majors: [], minors: [], warnings: [],
    terms: [{ code: "FA25", label: "Fall Quarter 2025", courses: courses.map(([code, grade]) => ({
      code, subject: code.split(" ")[0], number: code.split(" ")[1], title: code, units: 4, grade, points: null,
      status: grade === null ? "progress" : grade === "F" ? "fail" : grade === "P" ? "pass" : "graded",
    })) }],
    transfer: transfer.map((code) => ({ code, title: code, units: 4, from: "AP", level: null, equivalents: [] })),
    totals: { courses: 0, unitsEarned: 0, unitsInProgress: 0, transferUnits: 0, gpa: null },
  });
  const r = row("BIMM 101", { pr: 1 });
  const check = (pre: string | null, h: ParsedHistory | null, planned: string[] = []) =>
    checkPrerequisites(r, pre, null, studentRecord(h, planned)).find((c) => c.code.startsWith("PREREQ_") || c.code === "RESTRICTED")!;

  test("only unambiguous shapes are evaluated", () => {
    assert.equal(parsePrereq("CSE 12 and CSE 20 or MATH 109"), null);
    assert.deepEqual(parsePrereq("BILD 1 and BILD 4.")?.lines.map((l) => l.map((o) => o.code)), [["BILD 1"], ["BILD 4"]]);
    assert.deepEqual(parsePrereq("CHEM 6B or 6BH.")?.lines.map((l) => l.map((o) => o.code)), [["CHEM 6B", "CHEM 6BH"]]);
    assert.equal(parsePrereq("MATH 20A, MATH 20B"), null, "commas alone could mean either");
  });

  test("met, missing, conditional and unknown are told apart", () => {
    assert.equal(check("BILD 1 and BILD 4.", history([["BILD 1", "A"], ["BILD 4", "B"]])).code, "PREREQ_MET");
    const missing = check("BILD 1 and BILD 4.", history([["BILD 1", "A"]]));
    assert.equal(missing.code, "PREREQ_MISSING");
    assert.equal(missing.detail?.missing, "BILD 4");
    assert.equal(check("BILD 1 and BILD 4.", history([["BILD 1", "A"], ["BILD 4", null]])).code, "PREREQ_PLANNED");
    assert.equal(check("BILD 1 and BILD 4.", history([["BILD 1", "A"]]), ["BILD 4"]).code, "PREREQ_PLANNED");
    assert.equal(check("BILD 1 and BILD 4.", null).code, "PREREQ_NO_RECORD");
    assert.equal(check("CSE 12 and CSE 20 or MATH 109", history([["CSE 12", "A"]])).status, "unknown");
    assert.equal(check("upper-division standing.", history([])).status, "unknown");
    assert.equal(check("consent of instructor.", history([])).code, "PREREQ_CONSENT");
  });

  test("minimum grades, P and transfer credit", () => {
    const pre = "DSC 40A (minimum grade C-) or DSC 40AR (minimum grade C-)";
    assert.equal(check(pre, history([["DSC 40A", "B"]])).code, "PREREQ_MET");
    assert.equal(check(pre, history([["DSC 40A", "D"]])).code, "PREREQ_MISSING");
    assert.equal(check(pre, history([["DSC 40A", "P"]])).code, "PREREQ_MET");
    assert.equal(check("MATH 20A.", history([], ["MATH 20A"])).code, "PREREQ_MET");
  });

  test("'no prerequisites' needs UCSD's own word for it", () => {
    assert.equal(check("none.", null).code, "PREREQ_NONE_STATED");
    assert.equal(checkPrerequisites(row("ECON 1"), null, null, studentRecord(null))[0].code, "PREREQ_NONE_LISTED");
    const retired = checkPrerequisites(row("OLD 1", { ct: 0, o: 0 }), null, null, studentRecord(null))[0];
    assert.equal(retired.code, "PREREQ_NOT_IN_CATALOG");
    assert.equal(retired.status, "unknown", "missing from our data is not 'no prerequisites'");
  });
});

// ── Warren's rule ────────────────────────────────────────────────────────────

describe("Warren's program rule", () => {
  test("B.S. engineering majors follow Area Studies", () => {
    assert.equal(resolvePofc({ discipline: "social" }, "Computer Science (BS)").profile.track, "areaStudy");
    assert.equal(resolvePofc({ discipline: "social" }, "Computer Science (BA)").profile.track, "pofc");
  });

  test("only four-unit department courses count, never MGT or 195", () => {
    const econ = programById("economics")!;
    assert.equal(pofcCourseFit(row("ECON 1"), econ).kind, "counts-by-rule");
    assert.equal(pofcCourseFit(row("ECON 86", { u: "2" }), econ).kind, "excluded");
    assert.equal(pofcCourseFit(row("MGT 3"), econ).kind, "excluded");
    assert.equal(pofcCourseFit(row("ECON 195"), econ).kind, "excluded");
    assert.equal(pofcCourseFit(row("POLI 10"), econ).kind, "excluded");
  });
});

// ── Building a quarter on real data ──────────────────────────────────────────

describe("build my quarter", () => {
  test("a 12–16 unit draft with nothing before 10 keeps a locked course exactly", async () => {
    const data = realData();
    await data.load(["CSE"]);
    const sec11 = data.detail("CSE 11")?.sec ?? [];
    const late = configurations("CSE 11", sec11, { ...NO_CONSTRAINTS, earliestStart: 10 * 60 });
    if (!late.length) return; // this term has no CSE 11 section after 10; nothing to lock
    const lock = late[0].selection!;
    const ctx = context("Computer Science (BS)", [{ code: "CSE 11", selection: lock }]);
    const result = await buildPlanOptions(ctx, ask({ keep: ["CSE 11"], constraints: { units: { min: 12, max: 16 }, earliestStart: 10 * 60 } }), "build");
    for (const p of result.proposals) {
      assert.ok(p.after.units >= 12 && p.after.units <= 16, `${p.title}: ${p.after.units} units`);
      assert.ok(!p.ops.some((o) => o.code === "CSE 11"), "the locked course is untouched");
      assert.equal(p.after.conflicts, 0);
      assert.ok(p.after.earliest == null || p.after.earliest >= 10 * 60);
      for (const card of p.adds) assert.ok(groupSections(data.detail(card.code)?.sec ?? []).length, "new courses come with sections");
    }
    if (!result.proposals.length) assert.ok(result.outcome.relaxation || result.outcome.exhaustive !== undefined);
  });
});

