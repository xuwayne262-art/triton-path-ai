import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import type { SectionTuple, SubjectFile } from "./plat";
import { CODE, DAYS, TYPE, groupSections } from "./sections";
import {
  choicePackage, decodeChoice, encodeChoice, familyExams, finalOverview, packageUrl, summarizeChoice,
} from "./sectionChoice";

/** A row in the shape fetch-classplanner.mjs emits. */
function row(
  code: string, type: string, days: string, start: string, end: string,
  over: { id?: string; pkg?: string[]; avail?: number | null; limit?: number | null; room?: string } = {},
): SectionTuple {
  return [
    code, type, days, start, end, "Hall", over.room ?? "HALL 1", "Prof",
    over.avail === undefined ? 5 : over.avail, over.limit === undefined ? 24 : over.limit, 0,
    0, 19, over.id ?? `E ${code}`, over.pkg ?? [], null, null, "HALL", "AC", "", "",
  ];
}

/**
 * Shaped like BILD 4 on Oct 12, 2026: two lectures, each with labs, each
 * lecture's final keyed to the lecture's own TSS section id. The dates are
 * the fixture's, not the live schedule's.
 */
const BILD = [
  row("A00", "LE", "M", "6:00p", "7:20p", { id: "E LA", pkg: ["100", "101", "102"] }),
  row("2026-12-07", "FI", "2026-12-07", "7:00p", "9:59p", { id: "E LA" }),
  row("A01", "LA", "W", "9:00a", "11:50a", { id: "E A1", pkg: ["100"] }),
  row("A02", "LA", "W", "9:00a", "11:50a", { id: "E A2", pkg: ["101", "900", "901"], avail: 0 }),
  row("B00", "LE", "M", "5:00p", "6:20p", { id: "E LB", pkg: ["200", "201", "202"] }),
  row("2026-12-10", "FI", "2026-12-10", "7:00p", "9:59p", { id: "E LB" }),
  row("B01", "LA", "W", "1:00p", "3:50p", { id: "E B1", pkg: ["200"] }),
  row("B03", "LA", "W", "1:00p", "3:50p", { id: "E B3", pkg: ["202"], avail: 1 }),
];
const TSS = "https://tss.ucsd.edu/fiori#ZUSModule-display?TileType=MYMOD&/Detail/EventPackage/SM/1495/00000000/0/0/0/00000000-0000-0000-0000-000000000000/100/2026/2/?";

describe("a course's final before a lecture is chosen", () => {
  test("is not one date when the lectures sit different finals", () => {
    const o = finalOverview(BILD, groupSections(BILD));
    assert.equal(o.kind, "varies");
    if (o.kind !== "varies") return;
    assert.deepEqual(o.byFamily.map((f) => [f.key, f.finals.map((s) => s[DAYS])]), [
      ["A", ["2026-12-07"]],
      ["B", ["2026-12-10"]],
    ]);
  });

  test("is the course's when every lecture sits the same one", () => {
    const same = [
      row("A00", "LE", "MWF", "9:00a", "9:50a", { id: "E 1" }),
      row("2026-12-09", "FI", "2026-12-09", "8:00a", "10:59a", { id: "E 1", room: "WLH 2001" }),
      row("B00", "LE", "MWF", "1:00p", "1:50p", { id: "E 2" }),
      row("2026-12-09", "FI", "2026-12-09", "8:00a", "10:59a", { id: "E 2", room: "WLH 2005" }),
    ];
    const o = finalOverview(same, groupSections(same));
    assert.equal(o.kind, "same");
  });

  test("varies when one lecture lists a final and another lists none", () => {
    const partial = [
      row("A00", "LE", "MWF", "9:00a", "9:50a", { id: "E 1" }),
      row("2026-12-09", "FI", "2026-12-09", "8:00a", "10:59a", { id: "E 1" }),
      row("D00", "LE", "", "", "", { id: "E 4" }),
    ];
    assert.equal(finalOverview(partial, groupSections(partial)).kind, "varies");
  });

  test("is 'none listed', not an invented date, when the schedule has none", () => {
    const none = [row("A00", "SE", "F", "3:00p", "4:50p")];
    assert.deepEqual(finalOverview(none, groupSections(none)), { kind: "none" });
  });
});

describe("a chosen lecture and lab", () => {
  const families = groupSections(BILD);

  test("brings the chosen lecture's final, never lecture A's", () => {
    const s = summarizeChoice(BILD, families, { family: "B", parts: { LA: "B03" } });
    assert.ok(s);
    assert.equal(s.complete, true);
    assert.deepEqual(s.exams.map((e) => [e[TYPE], e[DAYS]]), [["FI", "2026-12-10"]]);
  });

  test("says what is still missing until the lab is picked", () => {
    const s = summarizeChoice(BILD, families, { family: "B", parts: {} });
    assert.ok(s);
    assert.equal(s.complete, false);
    assert.deepEqual(s.missing, ["lab"]);
    // The final is known from the lecture alone.
    assert.deepEqual(s.exams.map((e) => e[DAYS]), ["2026-12-10"]);
  });

  test("ignores a lab that belongs to another lecture", () => {
    // Switching B to A must not keep B03: A has no B03, so A is incomplete.
    const s = summarizeChoice(BILD, families, { family: "A", parts: { LA: "B03" } });
    assert.ok(s);
    assert.equal(s.complete, false);
    assert.deepEqual(s.chosen, []);
    assert.deepEqual(s.exams.map((e) => e[DAYS]), ["2026-12-07"]);
  });

  test("names the full sections in the choice, so planning one is a decision", () => {
    const s = summarizeChoice(BILD, families, { family: "A", parts: { LA: "A02" } });
    assert.ok(s);
    assert.deepEqual(s.full.map((x) => x[CODE]), ["A02"]);
  });

  test("names no lecture of the course as null", () => {
    assert.equal(summarizeChoice(BILD, families, { family: "Z", parts: {} }), null);
    assert.equal(summarizeChoice(BILD, families, undefined), null);
  });
});

describe("the TSS package for a choice", () => {
  const families = groupSections(BILD);
  const pkg = (family: string, parts: Record<string, string>) =>
    choicePackage(summarizeChoice(BILD, families, { family, parts })!);

  test("is the one package every chosen section shares", () => {
    assert.equal(pkg("B", { LA: "B03" }), "202");
  });

  test("is found for a lab that belongs to several packages", () => {
    // A02 lists 101, 900 and 901; only 101 is also lecture A's. Linking from the
    // lab alone used to fall back to the course's default package — another lab.
    assert.equal(pkg("A", { LA: "A02" }), "101");
  });

  test("is not offered for an incomplete choice", () => {
    assert.equal(pkg("B", {}), null);
  });

  test("swaps into the course's TSS route, and refuses a link in another shape", () => {
    assert.match(packageUrl(TSS, "202"), /\/202\/2026\/2\/\?$/);
    assert.equal(packageUrl("https://tss.ucsd.edu/elsewhere", "202"), "");
    assert.equal(packageUrl(TSS, "20/2"), "");
    assert.equal(packageUrl(null, "202"), "");
  });
});

describe("a choice in a link", () => {
  const families = groupSections(BILD);

  test("round-trips", () => {
    const sel = { family: "B", parts: { LA: "B03" } };
    assert.equal(encodeChoice(sel), "B,LA:B03");
    assert.deepEqual(decodeChoice(encodeChoice(sel), families), sel);
  });

  test("drops a section the course does not have, and refuses a lecture it does not have", () => {
    assert.deepEqual(decodeChoice("B,LA:A01", families), { family: "B", parts: {} });
    assert.deepEqual(decodeChoice("B,LA:B99,XX:B03", families), { family: "B", parts: {} });
    assert.equal(decodeChoice("Q", families), null);
    assert.equal(decodeChoice("<script>", families), null);
    assert.equal(decodeChoice("", families), null);
    assert.equal(decodeChoice(null, families), null);
  });
});

describe("over the real schedule", () => {
  const dir = new URL("../../public/data/plat/subject/", import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(new URL(f, dir), "utf8")) as SubjectFile);

  test("every lecture's choice brings only finals keyed to that lecture", () => {
    let checked = 0;
    for (const file of files) {
      for (const c of Object.values(file.courses)) {
        if (!c.offered || !c.sec?.length) continue;
        const families = groupSections(c.sec);
        for (const f of families) {
          const summary = summarizeChoice(c.sec, families, { family: f.key, parts: {} });
          assert.ok(summary);
          const ids = new Set(f.lectureRows.map((r) => r[13]));
          for (const e of summary.exams) assert.ok(ids.has(e[13]), `${c.t} ${f.key}: an exam from another section`);
          assert.deepEqual(summary.exams, familyExams(c.sec, f));
          checked++;
        }
      }
    }
    assert.ok(checked > 1000, `checked ${checked} lectures`);
  });

  test("a course whose lectures sit different finals never reads as having one final", () => {
    for (const file of files) {
      for (const [code, c] of Object.entries(file.courses)) {
        if (!c.offered || !c.sec?.length) continue;
        const families = groupSections(c.sec);
        const finals = new Set(families.map((f) => familyExams(c.sec, f).filter((s) => s[TYPE] === "FI")
          .map((s) => `${s[DAYS]}|${s[3]}|${s[4]}`).sort().join(";")));
        const o = finalOverview(c.sec, families);
        if (families.length > 1 && finals.size > 1) assert.equal(o.kind, "varies", code);
        if (o.kind === "same") assert.ok(finals.size <= 1, code);
      }
    }
  });
});
