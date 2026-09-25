import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { sanitizeHistory } from "./record";
import { storageKey } from "./store";

const oneTerm = (courses: unknown[]) => ({
  terms: [{ code: "FA25", label: "Fall Quarter 2025", courses }],
});

describe("sanitizeHistory", () => {
  test("keeps a well-formed record", () => {
    const r = sanitizeHistory(oneTerm([
      { subject: "CSE", number: "11", title: "Accel Intro", units: 4, grade: "A", status: "graded" },
    ]));
    assert.equal(r?.terms[0].courses[0].code, "CSE 11");
    assert.equal(r?.totals.unitsEarned, 4);
    assert.equal(r?.totals.gpa, 4);
  });

  test("recomputes totals rather than believing the ones it was sent", () => {
    // A caller that could set its own totals could put any GPA on the
    // student's own dashboard.
    const r = sanitizeHistory({
      ...oneTerm([
        { subject: "CSE", number: "11", title: "x", units: 4, grade: "C", status: "graded" },
      ]),
      totals: { courses: 999, unitsEarned: 900, unitsInProgress: 900, transferUnits: 900, gpa: 4 },
    });
    assert.equal(r?.totals.gpa, 2);
    assert.equal(r?.totals.unitsEarned, 4);
    assert.equal(r?.totals.courses, 1);
    assert.equal(r?.totals.transferUnits, 0);
  });

  test("refuses a body with no coursework at all", () => {
    for (const bad of [null, undefined, 42, "x", {}, { terms: [] }, { terms: "no" }]) {
      assert.equal(sanitizeHistory(bad), null, JSON.stringify(bad));
    }
  });

  test("drops a course with no subject or number instead of storing a blank", () => {
    const r = sanitizeHistory(oneTerm([
      { subject: "", number: "11", title: "x", units: 4 },
      { subject: "CSE", number: "", title: "x", units: 4 },
      { subject: "CSE", number: "12", title: "ok", units: 4, grade: "B", status: "graded" },
    ]));
    assert.equal(r?.terms[0].courses.length, 1);
    assert.equal(r?.terms[0].courses[0].code, "CSE 12");
  });

  test("caps units so one row cannot dominate a GPA", () => {
    const r = sanitizeHistory(oneTerm([
      { subject: "CSE", number: "11", title: "x", units: 100000, grade: "A", status: "graded" },
    ]));
    assert.ok((r?.terms[0].courses[0].units ?? 0) <= 30);
  });

  test("turns NaN, Infinity and negative units into zero", () => {
    const r = sanitizeHistory(oneTerm([
      { subject: "CSE", number: "11", title: "x", units: Number.NaN, grade: "A", status: "graded" },
      { subject: "CSE", number: "12", title: "x", units: -5, grade: "A", status: "graded" },
      { subject: "CSE", number: "13", title: "x", units: "Infinity", grade: "A", status: "graded" },
    ]));
    for (const c of r?.terms[0].courses ?? []) assert.equal(c.units, 0, c.code);
    assert.equal(r?.totals.unitsEarned, 0);
    assert.equal(r?.totals.gpa, null, "no graded units means no GPA, not 0.00");
  });

  test("rejects an unknown status rather than trusting the label", () => {
    const r = sanitizeHistory(oneTerm([
      { subject: "CSE", number: "11", title: "x", units: 4, grade: "A", status: "definitely-earned" },
    ]));
    assert.equal(r?.terms[0].courses[0].status, "other");
    assert.equal(r?.totals.unitsEarned, 0, "an unrecognised status earns nothing");
  });

  test("truncates long text instead of storing it", () => {
    const r = sanitizeHistory(oneTerm([
      { subject: "CSE", number: "11", title: "x".repeat(50_000), units: 4, grade: "A", status: "graded" },
    ]));
    assert.ok((r?.terms[0].courses[0].title.length ?? 0) <= 120);
  });

  test("bounds the number of terms, courses and transfer rows", () => {
    const many = Array.from({ length: 500 }, (_, i) => ({
      code: `FA${i % 99}`,
      label: "t",
      courses: [{ subject: "CSE", number: String(i), title: "x", units: 1, grade: "A", status: "graded" }],
    }));
    const r = sanitizeHistory({
      terms: many,
      transfer: Array.from({ length: 500 }, () => ({ title: "x", from: "y", units: 1 })),
    });
    assert.ok((r?.terms.length ?? 0) <= 40);
    assert.ok((r?.transfer.length ?? 0) <= 80);
  });

  test("stamps its own savedAt — a caller cannot backdate a record", () => {
    const r = sanitizeHistory({
      ...oneTerm([{ subject: "CSE", number: "11", title: "x", units: 4, grade: "A", status: "graded" }]),
      savedAt: "1999-01-01T00:00:00.000Z",
      v: 99,
    });
    assert.notEqual(r?.savedAt, "1999-01-01T00:00:00.000Z");
    assert.equal(r?.v, 1);
  });
});

describe("storageKey", () => {
  test("is stable for one address and different for another", () => {
    assert.equal(storageKey("alice@ucsd.edu", "s"), storageKey("alice@ucsd.edu", "s"));
    assert.notEqual(storageKey("alice@ucsd.edu", "s"), storageKey("bob@ucsd.edu", "s"));
  });

  test("ignores casing and surrounding space, as sign-in does", () => {
    assert.equal(storageKey("  Alice@UCSD.EDU ", "s"), storageKey("alice@ucsd.edu", "s"));
  });

  test("never contains the address", () => {
    const key = storageKey("alice@ucsd.edu", "s");
    assert.ok(!key.includes("alice"));
    assert.ok(!key.includes("@"));
    assert.match(key, /^hist:[0-9a-f]{40}$/);
  });

  test("depends on the secret, so keys cannot be precomputed from a name list", () => {
    assert.notEqual(storageKey("alice@ucsd.edu", "secret-one"), storageKey("alice@ucsd.edu", "secret-two"));
  });

  test("refuses to build a key with no address", () => {
    for (const bad of ["", "   ", null, undefined]) {
      assert.throws(() => storageKey(bad as unknown as string, "s"));
    }
  });
});
