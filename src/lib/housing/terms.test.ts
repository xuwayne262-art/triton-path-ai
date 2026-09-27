import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  QUARTERS, coverage, daysBetween, describeCoverage, formatStay, isIsoDate, quarterByKey, quartersFor,
  todayInSanDiego, upcomingQuarters,
} from "./terms";

const WI27 = quarterByKey("WI27")!;

describe("the calendar", () => {
  test("quarters run in order and never overlap", () => {
    for (let i = 0; i < QUARTERS.length; i++) {
      assert.ok(QUARTERS[i].classes < QUARTERS[i].end, QUARTERS[i].key);
      if (i) assert.ok(QUARTERS[i - 1].end < QUARTERS[i].classes, `${QUARTERS[i - 1].key} / ${QUARTERS[i].key}`);
    }
  });

  test("the Registrar's Winter 2027: classes Jan 4, quarter ends Mar 20", () => {
    assert.equal(WI27.classes, "2027-01-04");
    assert.equal(WI27.end, "2027-03-20");
  });
});

describe("coverage", () => {
  test("a stay from before classes to after finals covers the quarter", () => {
    assert.equal(coverage("2027-01-01", "2027-03-31", WI27), "full");
  });

  test("leaving before finals end is only partial", () => {
    assert.equal(coverage("2027-01-01", "2027-03-15", WI27), "partial");
  });

  test("arriving after the first day of classes is only partial", () => {
    assert.equal(coverage("2027-01-10", "2027-03-31", WI27), "partial");
  });

  test("a few days' overlap is not coverage at all", () => {
    assert.equal(coverage("2026-12-01", "2027-01-08", WI27), "none");
  });

  test("a year's lease lists every quarter it spans", () => {
    const keys = quartersFor("2026-09-01", "2027-08-31").map((q) => `${q.quarter.key}:${q.coverage}`);
    assert.deepEqual(keys, ["FA26:full", "WI27:full", "SP27:full", "SU27:partial"]);
  });
});

describe("coverage in words", () => {
  test("one quarter is named in full", () => {
    assert.equal(describeCoverage("2027-01-01", "2027-03-25"), "Winter 2027");
  });

  test("two quarters in one year share the year", () => {
    assert.equal(describeCoverage("2027-01-02", "2027-06-30"), "Winter & Spring 2027");
  });

  test("two quarters across a new year keep both years", () => {
    assert.equal(describeCoverage("2026-09-01", "2027-03-31"), "Fall 2026 & Winter 2027");
  });

  test("three or more read as a range, with the partial ones after", () => {
    assert.equal(describeCoverage("2026-09-01", "2027-08-31"), "Fall 2026 – Spring 2027, part of Summer 2027");
  });

  test("a stay that only partly covers says so", () => {
    assert.equal(describeCoverage("2027-04-05", "2027-06-11"), "Part of Spring 2027");
    assert.equal(describeCoverage("2027-03-01", "2027-04-30"), "Part of Winter & Spring 2027");
  });

  test("a stay that covers no quarter has nothing to say", () => {
    assert.equal(describeCoverage("2026-12-20", "2027-01-03"), null);
  });
});

describe("dates", () => {
  test("only real calendar dates are accepted", () => {
    assert.ok(isIsoDate("2027-02-28"));
    assert.ok(!isIsoDate("2027-02-30"));
    assert.ok(!isIsoDate("2027-2-3"));
    assert.ok(!isIsoDate(20270203));
  });

  test("a stay reads as a range, with the year once when it can be", () => {
    assert.equal(formatStay("2027-01-01", "2027-06-14"), "Jan 1 – Jun 14, 2027");
    assert.equal(formatStay("2026-12-15", "2027-03-20"), "Dec 15, 2026 – Mar 20, 2027");
  });

  test("today is San Diego's date, not UTC's", () => {
    // 5pm on Sep 30 in San Diego is already Oct 1 in UTC.
    assert.equal(todayInSanDiego(new Date("2026-10-01T00:30:00Z")), "2026-09-30");
  });

  test("upcoming quarters keep the current one until its finals end", () => {
    assert.deepEqual(upcomingQuarters("2026-12-10", 2).map((q) => q.key), ["FA26", "WI27"]);
    assert.deepEqual(upcomingQuarters("2026-12-13", 2).map((q) => q.key), ["WI27", "SP27"]);
  });

  test("days between dates", () => {
    assert.equal(daysBetween("2027-01-01", "2027-01-31"), 30);
    assert.equal(daysBetween("2027-01-31", "2027-01-01"), -30);
  });
});
