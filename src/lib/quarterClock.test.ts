import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { QUARTERS, quarterByKey } from "./housing/terms";
import {
  clockQuarter, milestones, positionOf, quarterSpan, readClock, sanDiegoMidnight, splitDuration, stageOn, weekStarts,
} from "./quarterClock";

const DAY = 86_400_000;
const HOUR = 3_600_000;
const at = (iso: string) => Date.parse(iso);
const FA26 = quarterByKey("FA26")!;
const WI27 = quarterByKey("WI27")!;
const SP27 = quarterByKey("SP27")!;

describe("San Diego's midnight", () => {
  test("is 7am UTC in daylight time and 8am in standard time", () => {
    assert.equal(sanDiegoMidnight("2026-09-21"), at("2026-09-21T07:00:00Z"));
    assert.equal(sanDiegoMidnight("2026-12-13"), at("2026-12-13T08:00:00Z"));
  });

  test("lands on the right hour on the days the clocks change", () => {
    // Clocks fall back at 2am on Nov 1, 2026: that midnight is still daylight time.
    assert.equal(sanDiegoMidnight("2026-11-01"), at("2026-11-01T07:00:00Z"));
    assert.equal(sanDiegoMidnight("2026-11-02"), at("2026-11-02T08:00:00Z"));
    // They spring forward at 2am on Mar 14, 2027: that midnight is still standard time.
    assert.equal(sanDiegoMidnight("2027-03-14"), at("2027-03-14T08:00:00Z"));
    assert.equal(sanDiegoMidnight("2027-03-15"), at("2027-03-15T07:00:00Z"));
  });

  test("a date that does not exist is no instant at all", () => {
    assert.ok(Number.isNaN(sanDiegoMidnight("2026-02-30")));
  });
});

describe("the Registrar's quarters", () => {
  test("match blink.ucsd.edu's Academic and Administrative Calendars", () => {
    const fa26 = { begins: "2026-09-21", classes: "2026-09-24", lastClass: "2026-12-04", end: "2026-12-12" };
    assert.deepEqual({ begins: FA26.begins, classes: FA26.classes, lastClass: FA26.lastClass, end: FA26.end }, fa26);
    assert.equal(WI27.begins, "2027-01-04");
    assert.equal(SP27.begins, "2027-03-24");
    assert.equal(quarterByKey("FA27")!.begins, "2027-09-20");
    assert.equal(quarterByKey("WI28")!.begins, "2028-01-05");
    assert.equal(quarterByKey("SP28")!.begins, "2028-03-29");
  });

  test("each begins on or before its first class and ends after its last", () => {
    for (const q of QUARTERS) {
      assert.ok(q.begins <= q.classes, q.key);
      if (q.lastClass) assert.ok(q.classes < q.lastClass && q.lastClass < q.end, q.key);
      for (const day of Object.keys(q.holidayNames ?? {})) assert.ok(q.begins <= day && day <= q.end, `${q.key} ${day}`);
    }
  });

  test("every last day of instruction is the Friday of Week 10", () => {
    for (const q of QUARTERS.filter((x) => x.lastClass)) {
      assert.equal(new Date(`${q.lastClass}T12:00:00Z`).getUTCDay(), 5, q.key);
      assert.deepEqual(stageOn(q, q.lastClass!), { kind: "week", week: 10, of: 10 }, q.key);
    }
  });
});

describe("Fall 2026", () => {
  const { start, end } = quarterSpan(FA26);

  test("runs from midnight on Sep 21 to the end of Dec 12, San Diego time", () => {
    assert.equal(start, at("2026-09-21T07:00:00Z"));
    assert.equal(end, at("2026-12-13T08:00:00Z"));
  });

  test("is 83 days and one hour long, because the clocks fall back inside it", () => {
    assert.equal(end - start, 83 * DAY + HOUR);
  });

  test("is 0% gone at its first instant, and nearly all gone at its last second", () => {
    assert.equal(readClock(start)!.fraction, 0);
    const last = readClock(end - 1000)!;
    assert.equal(last.quarter.key, "FA26");
    assert.equal(last.remaining, 1000);
    assert.ok(last.fraction < 1 && last.fraction > 0.9999);
  });

  test("counts real elapsed time to the second", () => {
    // 3pm on Fri, Oct 9 in San Diego: 18 days and 15 hours in.
    const r = readClock(at("2026-10-09T22:00:00Z"))!;
    assert.equal(r.elapsed, 18 * DAY + 15 * HOUR);
    assert.equal(r.remaining, end - start - r.elapsed);
    assert.equal(r.fraction, (18 * 24 + 15) / (83 * 24 + 1));
    assert.deepEqual(splitDuration(r.remaining), { days: 64, hours: 10, minutes: 0, seconds: 0 });
  });

  test("reads San Diego's date and time, whatever the device's time zone", () => {
    const instant = at("2026-10-09T21:30:00Z"); // 5:30am on Sat, Oct 10 in Shanghai
    const before = readClock(instant);
    const saved = process.env.TZ;
    try {
      process.env.TZ = "Asia/Shanghai";
      const shanghai = readClock(instant);
      assert.deepEqual(shanghai, before);
      assert.equal(shanghai!.today, "2026-10-09");
    } finally {
      if (saved === undefined) delete process.env.TZ;
      else process.env.TZ = saved;
    }
  });
});

describe("weeks of instruction", () => {
  test("Fall's Thursday start is Week 0, and its Mondays count from there", () => {
    assert.deepEqual(stageOn(FA26, "2026-09-22"), { kind: "before-instruction" });
    assert.deepEqual(stageOn(FA26, "2026-09-24"), { kind: "week", week: 0, of: 10 });
    assert.deepEqual(stageOn(FA26, "2026-09-27"), { kind: "week", week: 0, of: 10 });
    assert.deepEqual(stageOn(FA26, "2026-09-28"), { kind: "week", week: 1, of: 10 });
    assert.deepEqual(stageOn(FA26, "2026-10-10"), { kind: "week", week: 2, of: 10 });
    assert.deepEqual(stageOn(FA26, "2026-12-05"), { kind: "finals" });
    assert.deepEqual(stageOn(FA26, "2026-12-12"), { kind: "finals" });
  });

  test("a Monday start is Week 1", () => {
    assert.deepEqual(stageOn(WI27, "2027-01-04"), { kind: "week", week: 1, of: 10 });
    assert.deepEqual(stageOn(SP27, "2027-03-24"), { kind: "before-instruction" });
    assert.deepEqual(stageOn(SP27, "2027-03-29"), { kind: "week", week: 1, of: 10 });
  });

  test("ten numbered weeks, each starting on a Monday", () => {
    assert.deepEqual(weekStarts(FA26), [
      "2026-09-28", "2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26",
      "2026-11-02", "2026-11-09", "2026-11-16", "2026-11-23", "2026-11-30",
    ]);
    assert.equal(weekStarts(WI27)[0], "2027-01-04");
    assert.equal(weekStarts(WI27).length, 10);
  });
});

describe("named days", () => {
  test("Fall 2026's, in order, with Thanksgiving as one run", () => {
    assert.deepEqual(
      milestones(FA26).map((m) => `${m.from}..${m.to} ${m.label}`),
      [
        "2026-09-21..2026-09-21 Fall Quarter begins",
        "2026-09-24..2026-09-24 Instruction begins",
        "2026-11-11..2026-11-11 Veterans Day Holiday",
        "2026-11-26..2026-11-27 Thanksgiving Holiday",
        "2026-12-04..2026-12-04 Instruction ends",
        "2026-12-05..2026-12-12 Final exams",
        "2026-12-12..2026-12-12 Fall Quarter ends",
      ],
    );
  });

  test("a quarter whose classes start on its first day names both at once", () => {
    assert.equal(milestones(WI27)[0].label, "Winter Quarter and instruction begin");
  });

  test("the next one is still ahead, or under way today", () => {
    assert.equal(readClock(at("2026-10-09T22:00:00Z"))!.next!.label, "Veterans Day Holiday");
    assert.equal(readClock(at("2026-11-27T20:00:00Z"))!.next!.label, "Thanksgiving Holiday");
    assert.equal(readClock(at("2026-12-07T20:00:00Z"))!.next!.label, "Final exams");
  });

  test("sit along the bar where their day starts", () => {
    const { start, end } = quarterSpan(FA26);
    assert.equal(positionOf("2026-09-21", start, end), 0);
    assert.equal(positionOf("2026-12-13", start, end), 1);
    assert.ok(Math.abs(positionOf("2026-09-24", start, end) - (3 * DAY) / (83 * DAY + HOUR)) < 1e-12);
  });
});

describe("between quarters", () => {
  test("after Fall's last final, the clock counts down to Winter", () => {
    const r = readClock(at("2026-12-13T08:00:00Z"))!;
    assert.equal(r.quarter.key, "WI27");
    assert.equal(r.started, false);
    assert.equal(r.fraction, 0);
    assert.equal(r.remaining, at("2027-01-04T08:00:00Z") - at("2026-12-13T08:00:00Z"));
    assert.equal(r.next!.label, "Winter Quarter and instruction begin");
  });

  test("Summer is skipped: after Spring, the clock counts down to Fall", () => {
    assert.equal(clockQuarter(at("2027-07-15T19:00:00Z"))!.quarter.key, "FA27");
  });

  test("once the calendar runs out there is nothing to show", () => {
    assert.equal(readClock(at("2028-07-01T19:00:00Z")), null);
  });
});

describe("durations", () => {
  test("split into whole days, hours, minutes and seconds", () => {
    assert.deepEqual(splitDuration(83 * DAY + HOUR + 61_999), { days: 83, hours: 1, minutes: 1, seconds: 1 });
    assert.deepEqual(splitDuration(-5), { days: 0, hours: 0, minutes: 0, seconds: 0 });
  });
});
