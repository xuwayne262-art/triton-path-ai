import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { DEPARTMENT_OFFERINGS, freshNote } from "./departmentOfferings";

describe("a department's note about its offerings", () => {
  test("drops a promise to update by a date that has passed", () => {
    assert.equal(freshNote("Will be updated by 4/16"), null);
    assert.equal(freshNote("Will be updated for 2026-27 AY in late Spring"), null);
    assert.equal(
      freshNote("FA26: DOC 1 and DOC 100D, WI27: DOC 2, SP27: DOC 3. Will be updated May/June"),
      "FA26: DOC 1 and DOC 100D, WI27: DOC 2, SP27: DOC 3",
    );
  });

  test("keeps everything else as written", () => {
    assert.equal(freshNote("Tentative; check with the department."), "Tentative; check with the department");
    assert.equal(freshNote(null), null);
  });

  test("no note shown on a department page still promises a spring update", () => {
    for (const d of DEPARTMENT_OFFERINGS) {
      assert.doesNotMatch(freshNote(d.note) ?? "", /will be updated/i, d.department);
    }
  });
});
