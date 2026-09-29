import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { departmentForSubject, unmappedSubjects } from "./ucsdStructure";
import type { GEFile, PlatIndex } from "@/lib/plat";

const read = <T,>(name: string) =>
  JSON.parse(readFileSync(new URL(`../../public/data/plat/${name}`, import.meta.url), "utf8")) as T;
const index = read<PlatIndex>("index.json");
const ge = read<GEFile>("ge.json");

describe("every course has a place to be browsed", () => {
  test("every subject in the dataset belongs to a department or college page", () => {
    // Sixteen School of Medicine prefixes (184 courses) were reachable only by
    // search, because no department listed them.
    assert.deepEqual(unmappedSubjects(index.subjects.map((s) => s.code)), []);
    assert.equal(departmentForSubject("SURG")?.id, "medicine");
    assert.equal(departmentForSubject("PSY")?.id, "medicine", "Psychiatry, not Psychology's PSYC");
  });
});

describe("the GE lists", () => {
  const codes = new Set(index.courses.map((c) => c.k));

  test("name courses by the codes the dataset uses", () => {
    // "POLI 13R" is POLI 13DR since Political Science added the D; matching the
    // old text exactly dropped it from Eighth College's social-science list.
    assert.ok(ge.lists["eighth:Breadth · Social Sci"].includes("POLI 13DR"));
    for (const [area, list] of Object.entries(ge.lists)) {
      for (const k of list) {
        if (codes.has(k)) continue;
        const withD = k.replace(/^(\S+ \d+)/, "$1D");
        assert.ok(!codes.has(withD), `${area}: ${k} should have resolved to ${withD}`);
      }
    }
  });

  test("list each course once per area", () => {
    for (const [area, list] of Object.entries(ge.lists)) {
      assert.equal(new Set(list).size, list.length, area);
    }
  });
});
