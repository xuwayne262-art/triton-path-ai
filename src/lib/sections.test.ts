import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  autoPick, buildEvents, clashingCourses, compactRange, forcedSelection, groupSections,
  isChoosable, isWaitlistOnly, oneOffsFor, sectionBuildingCode, sectionWhere, selectedSections,
  shortWhen,
} from "./sections";
import type { SectionTuple } from "./plat";

/** A row in the shape fetch-classplanner.mjs emits, all 19 positions. */
function row(
  code: string, type: string, days: string, start: string, end: string,
  over: { room?: string; building?: string; bcode?: string; id?: string; status?: string; avail?: number } = {},
): SectionTuple {
  return [
    code, type, days, start, end,
    over.building ?? "Center Hall", over.room ?? "CENTR 214", "Joe Politz",
    over.avail ?? 5, 100, 0,
    0, 95, over.id ?? `E ${code}`, ["1"], null, null,
    over.bcode ?? "CENTR", over.status ?? "AC",
  ];
}

describe("which rows are choices", () => {
  test("a full section still taking a waitlist IS a choice", () => {
    // Every CSE 11 section was `waitlist_only` on 2026-09-25 and the old build
    // filed them as cancelled, leaving the planner nothing to offer.
    const s = row("A01", "DI", "W", "1:00p", "1:50p", { status: "waitlist_only", avail: 0 });
    assert.equal(isChoosable(s), true);
    assert.equal(isWaitlistOnly(s), true);
  });

  test("finals, midterms and other dated one-offs are not", () => {
    assert.equal(isChoosable(row("2026-12-10", "FI", "2026-12-10", "8:00a", "10:59a")), false);
    assert.equal(isChoosable(row("2026-10-19", "MI", "2026-10-19", "8:00p", "8:50p")), false);
    // MGT 18's evening session: type OT, like weekly "other" sections, but dated.
    assert.equal(isChoosable(row("2026-10-19", "OT", "2026-10-19", "8:00p", "8:50p")), false);
    assert.equal(isChoosable(row("A00", "OT", "TuTh", "8:00p", "8:50p")), true);
  });

  test("a dated row never becomes a weekly block", () => {
    const events = buildEvents([{
      code: "MATH 20A", title: "Calculus", role: "major",
      sections: [row("2026-10-19", "MI", "2026-10-19", "8:00p", "8:50p")],
    }]);
    assert.equal(events.length, 0);
  });
});

describe("groupSections", () => {
  // BENG 110's lecture meets in two patterns; its lab meets twice in two rooms.
  const sec = [
    row("A00", "LE", "MWF", "9:00a", "9:50a", { room: "PETER 108", bcode: "PETER", id: "E 1" }),
    row("A00", "LE", "Tu", "5:00p", "5:50p", { room: "WLH 2001", bcode: "WLH", id: "E 1" }),
    row("A01", "LA", "Tu", "2:00p", "4:50p", { room: "EBU2 105", bcode: "EBU2", id: "E 2" }),
    row("A01", "LA", "Th", "2:00p", "4:50p", { room: "PFBH 161", bcode: "PFBH", id: "E 2" }),
    row("A02", "LA", "W", "2:00p", "4:50p", { id: "E 3" }),
    row("2026-12-10", "FI", "2026-12-10", "8:00a", "10:59a", { id: "E 1" }),
  ];
  const [family] = groupSections(sec);

  test("a lecture meeting in two patterns is one lecture, not a lecture plus a sub-choice", () => {
    assert.equal(family.lectureRows.length, 2);
    assert.deepEqual(family.parts.map((p) => p.type), ["LA"]);
  });

  test("a lab published as two rows is one option", () => {
    const lab = family.parts[0];
    assert.deepEqual(lab.sections.map((s) => s[0]), ["A01", "A02"]);
    assert.equal(lab.rows.A01.length, 2);
  });

  test("choosing it puts every meeting on the calendar", () => {
    const chosen = selectedSections([family], { family: "A", parts: { LA: "A01" } });
    assert.equal(chosen.length, 4);
    const events = buildEvents([{ code: "BENG 110", title: "", role: "major", sections: chosen }]);
    assert.deepEqual(
      [...new Set(events.map((e) => e.buildingCode))].sort(),
      ["EBU2", "PETER", "PFBH", "WLH"],
    );
  });

  test("auto-pick plans around every meeting of a section, not just its first", () => {
    // Busy Thursday afternoon: A01's second meeting clashes, so A02 must win.
    const pick = autoPick(sec, [{ day: "Thu", startMin: 14 * 60, endMin: 15 * 60 }]);
    assert.deepEqual(pick, { family: "A", parts: { LA: "A02" } });
  });

  test("the final is found by the section id it shares with the lecture", () => {
    const chosen = selectedSections([family], { family: "A", parts: { LA: "A02" } });
    const dates = oneOffsFor(sec, chosen);
    assert.deepEqual(dates.map((s) => s[1]), ["FI"]);
  });
});

describe("forcedSelection", () => {
  test("makes the choices that are not really choices", () => {
    const sec = [
      row("A00", "LE", "MWF", "8:00a", "8:50a"),
      row("A01", "DI", "M", "4:00p", "4:50p"),
    ];
    assert.deepEqual(forcedSelection(groupSections(sec)), { family: "A", parts: { DI: "A01" } });
  });

  test("leaves a real choice of discussion open", () => {
    const sec = [
      row("A00", "LE", "MWF", "8:00a", "8:50a"),
      row("A01", "DI", "M", "4:00p", "4:50p"),
      row("A02", "DI", "M", "5:00p", "5:50p"),
    ];
    assert.deepEqual(forcedSelection(groupSections(sec)), { family: "A", parts: {} });
  });

  test("never picks between two lectures", () => {
    const sec = [row("A00", "LE", "TuTh", "9:30a", "10:50a"), row("B00", "LE", "MW", "6:30p", "7:50p")];
    assert.equal(forcedSelection(groupSections(sec)), null);
  });
});

describe("formatting", () => {
  test("compact ranges write the meridiem once when they can", () => {
    assert.equal(compactRange("1:00p", "1:50p"), "1:00–1:50p");
    assert.equal(compactRange("11:00a", "12:20p"), "11:00a–12:20p");
    assert.equal(compactRange("", ""), "TBA");
  });

  test("short times carry their days", () => {
    assert.equal(shortWhen(row("A01", "DI", "TuTh", "9:30a", "10:50a")), "TuTh 9:30–10:50a");
    assert.equal(shortWhen(row("A01", "DI", "", "", "")), "Time TBA");
  });

  test("where is the room as posted on the door, not the building twice", () => {
    assert.equal(sectionWhere(row("A01", "DI", "W", "1:00p", "1:50p")), "CENTR 214");
    assert.equal(sectionWhere(row("A01", "DI", "W", "1:00p", "1:50p", { room: "", building: "Remote", bcode: "" })), "Remote");
  });

  test("a row from before building codes still finds its building from the room", () => {
    const legacy = row("A01", "DI", "W", "1:00p", "1:50p", { room: "MYR-A 2702" }).slice(0, 17) as SectionTuple;
    assert.equal(sectionBuildingCode(legacy), "MYR-A");
  });
});

describe("clashingCourses", () => {
  test("names what an option would collide with, ignoring ghosts and itself", () => {
    const events = buildEvents([
      { code: "MATH 20A", title: "", role: "major", sections: [row("A00", "LE", "MWF", "9:00a", "9:50a")] },
      { code: "CSE 11", title: "", role: "major", sections: [row("A00", "LE", "W", "9:30a", "10:20a")] },
    ]);
    const clash = clashingCourses([{ day: "Wed", startMin: 9 * 60 + 15, endMin: 10 * 60 }], events, "CSE 11");
    assert.deepEqual(clash, ["MATH 20A"]);
  });
});
