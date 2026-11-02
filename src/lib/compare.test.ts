import { test } from "node:test";
import assert from "node:assert/strict";
import { compareHref, normalizeCode, parseCompare, withCode, withoutCode } from "./compare";

test("codes are normalized however they are typed", () => {
  assert.equal(normalizeCode("cse11"), "CSE 11");
  assert.equal(normalizeCode(" math 20a "), "MATH 20A");
  assert.equal(normalizeCode("hello"), null);
});

test("an address keeps at most three known courses, once each, and names the rest", () => {
  const known = new Set(["CSE 11", "CSE 12", "MATH 20A", "ECON 1"]);
  const r = parseCompare("CSE 11,cse11,FAKE 999,CSE 12,MATH 20A,ECON 1", (c) => known.has(c));
  assert.deepEqual(r.codes, ["CSE 11", "CSE 12", "MATH 20A"]);
  assert.deepEqual(r.dropped, ["FAKE 999"]);
  assert.deepEqual(parseCompare(null).codes, []);
});

test("the address round-trips", () => {
  const href = compareHref(["CSE 11", "MATH 20A"]);
  assert.equal(href, "/compare?c=CSE%2011,MATH%2020A");
  assert.deepEqual(parseCompare(new URL(href, "https://x").searchParams.get("c")).codes, ["CSE 11", "MATH 20A"]);
});

test("adding past three drops the oldest; removing keeps the order", () => {
  assert.deepEqual(withCode(["A 1", "B 1", "C 1"], "D 1"), ["B 1", "C 1", "D 1"]);
  assert.deepEqual(withCode(["A 1"], "A 1"), ["A 1"]);
  assert.deepEqual(withoutCode(["A 1", "B 1", "C 1"], "B 1"), ["A 1", "C 1"]);
});
