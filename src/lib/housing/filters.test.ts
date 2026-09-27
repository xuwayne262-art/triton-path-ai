import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { NO_FILTERS, readFilters, writeFilters } from "./filters";

const KEYS = ["FA26", "WI27", "SP27", "SU27"];

describe("board filters in the address bar", () => {
  test("no query is no filters", () => {
    assert.deepEqual(readFilters("", KEYS), NO_FILTERS);
    assert.equal(writeFilters(NO_FILTERS), "");
  });

  test("what is written reads back the same", () => {
    const f = { quarter: "WI27", space: "shared" as const, rentCap: 1200, sort: "rent" as const };
    assert.equal(writeFilters(f), "quarter=WI27&space=shared&max=1200&sort=rent");
    assert.deepEqual(readFilters(`?${writeFilters(f)}`, KEYS), f);
  });

  test("defaults are left out, so a lightly filtered link stays short", () => {
    assert.equal(writeFilters({ ...NO_FILTERS, space: "private" }), "space=private");
  });

  test("unknown values read as the default", () => {
    assert.deepEqual(readFilters("quarter=WI99&space=constructor&sort=cheapest&max=lots", KEYS), NO_FILTERS);
  });

  test("a quarter no longer offered is not kept", () => {
    assert.equal(readFilters("quarter=SP26", KEYS).quarter, "any");
  });

  test("a cap snaps onto the slider, and its top means no cap", () => {
    assert.equal(readFilters("max=1234", KEYS).rentCap, 1250);
    assert.equal(readFilters("max=120", KEYS).rentCap, 500);
    assert.equal(readFilters("max=2990", KEYS).rentCap, 2950);
    assert.equal(readFilters("max=3000", KEYS).rentCap, null);
    assert.equal(readFilters("max=", KEYS).rentCap, null);
  });
});
