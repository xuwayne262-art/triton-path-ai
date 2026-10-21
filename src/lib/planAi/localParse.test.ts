import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEPARTMENTS } from "@/data/ucsdStructure";
import type { GEFile, PlatIndex } from "@/lib/plat";
import { isComplete, parseLocal, type ParseVocab } from "./localParse";

const index = JSON.parse(readFileSync(new URL("../../../public/data/plat/index.json", import.meta.url), "utf8")) as PlatIndex;
const ge = JSON.parse(readFileSync(new URL("../../../public/data/plat/ge.json", import.meta.url), "utf8")) as GEFile;

const vocab: ParseVocab = {
  subjects: new Set(index.subjects.map((s) => s.code)),
  codes: new Set(index.courses.map((c) => c.k)),
  areas: ge.areas,
  departments: DEPARTMENTS.map((d) => ({ name: d.name, subjects: d.subjects })),
};
const parse = (text: string) => parseLocal(text, vocab);

describe("the screenshot query", () => {
  test("reads PofC as Warren's requirement, never as a word to search for", () => {
    const p = parse("warren social science pofc with no prerequisites");
    assert.equal(p.kind, "find_fitting_course");
    assert.deepEqual(p.requirement, { kind: "warren_pofc", discipline: "social", program: null });
    assert.equal(p.constraints.noPrerequisites, true);
    assert.equal(p.topic, null);
    assert.deepEqual(p.leftover, []);
    assert.ok(isComplete(p), "needs no model call");
    const words = [p.topic ?? "", ...p.leftover, ...p.subjects, ...p.courses, ...p.unknownCodes].join(" ").toLowerCase();
    assert.ok(!words.includes("pofc"), "no literal pofc in any keyword, subject or course");
  });

  test("survives the spellings students use", () => {
    for (const text of [
      "Warren Social Sciences PoFC, no prereqs",
      "earl warren college soc sci program of concentration without prerequisites",
      "warren social science p.o.f.c. no prereq",
    ]) {
      const p = parse(text);
      assert.equal(p.requirement?.kind, "warren_pofc", text);
      assert.equal(p.requirement?.kind === "warren_pofc" && p.requirement.discipline, "social", text);
      assert.equal(p.constraints.noPrerequisites, true, text);
      assert.ok(isComplete(p), `${text}: ${p.leftover.join(",")}`);
    }
  });

  test("a named program is the program, not the discipline's other twenty-seven", () => {
    const p = parse("economics pofc");
    assert.deepEqual(p.requirement, { kind: "warren_pofc", discipline: "social", program: "economics" });
    assert.deepEqual(p.subjects, []);
  });
});

describe("the brief's example requests", () => {
  test("build a quarter with units, kept courses and a start time", () => {
    const p = parse("Build a 12–16 unit quarter around the courses I already chose. No classes before 10.");
    assert.equal(p.kind, "build_quarter");
    assert.deepEqual(p.constraints.units, { min: 12, max: 16 });
    assert.equal(p.constraints.earliestStart, 600);
    assert.equal(p.keepAll, true);
    assert.ok(isComplete(p), p.leftover.join(","));
  });

  test("find a PofC course that fits", () => {
    const p = parse("Find a Warren social science PofC course that fits my current schedule.");
    assert.equal(p.kind, "find_fitting_course");
    assert.equal(p.requirement?.kind, "warren_pofc");
    assert.ok(isComplete(p), p.leftover.join(","));
  });

  test("keep two courses, fewer gaps", () => {
    const p = parse("Keep these two courses and give me fewer gaps between classes.");
    assert.equal(p.kind, "improve_plan");
    assert.deepEqual(p.preferences, ["fewer_gaps"]);
    assert.equal(p.ask, "these-courses");
    assert.ok(isComplete(p), p.leftover.join(","));
  });

  test("add the second option to Winter is an explicit command", () => {
    for (const text of ["Add the second option to my Winter plan.", "add option 2 to winter", "Add the 2nd one to Winter"]) {
      const p = parse(text);
      assert.equal(p.kind, "add_course", text);
      assert.equal(p.optionRef, 2, text);
      assert.equal(p.quarter?.season, "Winter", text);
      assert.equal(p.explicit, true, text);
      assert.ok(isComplete(p), `${text}: ${p.leftover.join(",")}`);
    }
  });

  test("what-if questions about a move are not moves", () => {
    const p = parse("What changes if I move this prerequisite to Spring?");
    assert.equal(p.kind, "move_course");
    assert.equal(p.explicit, false);
    assert.equal(p.quarter?.season, "Spring");
    assert.ok(isComplete(p), p.leftover.join(","));
  });

  test("undo", () => {
    for (const text of ["Undo that change.", "undo", "undo the last change"]) {
      const p = parse(text);
      assert.equal(p.kind, "undo", text);
      assert.equal(p.explicit, true, text);
      assert.ok(isComplete(p), text);
    }
  });

  test("make it easier asks what easier means", () => {
    const p = parse("Make it easier");
    assert.equal(p.kind, "clarify");
    assert.equal(p.ask, "easier");
  });

  test("the empty state's placeholder", () => {
    const p = parse("Keep my current courses and find a GE after 10 a.m.");
    assert.equal(p.kind, "find_fitting_course");
    assert.equal(p.keepAll, true);
    assert.equal(p.requirement?.kind, "college_ge");
    assert.equal(p.constraints.earliestStart, 600);
    assert.ok(isComplete(p), p.leftover.join(","));
  });
});

describe("commands", () => {
  test("course codes in any spacing or case", () => {
    for (const text of ["add cse11", "Add CSE-11", "add Cse 11 please"]) {
      const p = parse(text);
      assert.equal(p.kind, "add_course", text);
      assert.deepEqual(p.courses, ["CSE 11"], text);
      assert.equal(p.explicit, true, text);
    }
  });

  test("replace, remove and move", () => {
    const r = parse("replace CSE 11 with CSE 12");
    assert.equal(r.kind, "replace_course");
    assert.deepEqual(r.courses, ["CSE 11"]);
    assert.equal(r.replacement, "CSE 12");
    assert.equal(r.explicit, true);
    const d = parse("drop math 20a");
    assert.equal(d.kind, "remove_course");
    assert.deepEqual(d.courses, ["MATH 20A"]);
    const m = parse("move MATH 20A to year 2 winter");
    assert.equal(m.kind, "move_course");
    assert.deepEqual(m.quarter, { relative: null, season: "Winter", year: null, planYear: 2 });
    assert.equal(m.explicit, true);
  });

  test("a code the catalog lacks is named, never guessed", () => {
    const p = parse("add math 20 and cse 11");
    assert.deepEqual(p.courses, ["CSE 11"]);
    assert.deepEqual(p.unknownCodes, ["MATH 20"]);
    assert.ok(!parse("add CSE 999").courses.length);
  });

  test("a question is not a command", () => {
    assert.equal(parse("should I add CSE 11?").explicit, false);
    assert.equal(parse("can you add CSE 11").explicit, true);
  });

  test("one-word replies", () => {
    assert.equal(parse("yes").reply, "yes");
    assert.equal(parse("Sounds good!").reply, "yes");
    assert.equal(parse("never mind").reply, "no");
  });
});

describe("constraints", () => {
  test("days and times", () => {
    const p = parse("no classes on fridays and nothing after 3pm");
    assert.deepEqual(p.constraints.avoidDays, ["Fri"]);
    assert.equal(p.constraints.latestEnd, 15 * 60);
    assert.deepEqual(parse("only tuth").constraints.avoidDays, ["Mon", "Wed", "Fri"]);
    assert.equal(parse("12 to 16 units, no 8ams").constraints.earliestStart, 9 * 60);
    assert.equal(parse("no morning classes").constraints.earliestStart, 12 * 60);
  });

  test("units", () => {
    assert.deepEqual(parse("at least 12 units").constraints.units, { min: 12, max: null });
    assert.deepEqual(parse("no more than 16 units").constraints.units, { min: null, max: 16 });
    assert.deepEqual(parse("between 12 and 14 units").constraints.units, { min: 12, max: 14 });
  });

  test("university and college requirements", () => {
    assert.deepEqual(parse("dei courses this quarter").requirement, { kind: "university", list: "campus:DEI" });
    const sixth = parse("sixth humanities ge");
    assert.equal(sixth.requirement?.kind === "college_ge" && sixth.requirement.area, "sixth:Modes of Inquiry · Humanities");
    const revelle = parse("revelle math GE");
    assert.equal(revelle.requirement?.kind === "college_ge" && revelle.requirement.area, "revelle:Mathematics");
  });

  test("anything unread is named, so it can go to the model or back to the student", () => {
    const p = parse("find a course about climate change");
    assert.ok(p.leftover.includes("climate"));
    assert.equal(isComplete(p), false);
  });
});
