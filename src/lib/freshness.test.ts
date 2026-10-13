import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  SEAT_STALE_HOURS, seatAge, seatAgeSentence, seatDay, seatMoment, seatSpan, spanLabel, sumSeatsAt,
} from "./freshness";
import type { PlatIndex } from "./plat";

const at = "2026-09-21T13:01Z"; // 6:01 AM in San Diego
const hours = (h: number) => Date.parse(at) + h * 3_600_000;

describe("how old a seat count is", () => {
  test("is judged from when UCSD counted it, at the documented threshold", () => {
    assert.equal(seatAge(at, hours(1)).kind, "recent");
    assert.equal(seatAge(at, hours(SEAT_STALE_HOURS - 0.01)).kind, "recent");
    assert.deepEqual(seatAge(at, hours(SEAT_STALE_HOURS)), { kind: "old", at, days: 1 });
    assert.deepEqual(seatAge(at, hours(22 * 24 + 3)), { kind: "old", at, days: 22 });
  });

  test("is unknown, not zero and not fresh, when no time was given", () => {
    assert.deepEqual(seatAge(null, hours(1)), { kind: "unknown" });
    assert.deepEqual(seatAge("", hours(1)), { kind: "unknown" });
    assert.deepEqual(seatAge("not a time", hours(1)), { kind: "unknown" });
  });

  test("is written in San Diego time, with the zone named", () => {
    assert.equal(seatDay(at), "Sep 21");
    assert.equal(seatMoment(at), "Mon, Sep 21, 2026, 6:01 AM PT");
    // 11:30 PM in San Diego is the next day in UTC; the day shown is San Diego's.
    assert.equal(seatDay("2026-10-13T06:30Z"), "Oct 12");
  });

  test("says an old count may be out of date and points to TSS, and never says live", () => {
    const old = seatAgeSentence(seatAge(at, hours(22 * 24)), hours(22 * 24));
    assert.match(old, /22 days ago/);
    assert.match(old, /may be out of date/);
    assert.match(old, /TSS/);
    assert.doesNotMatch(old, /\blive\b(?! count)/);
    assert.match(seatAgeSentence({ kind: "unknown" }, hours(1)), /did not say when/);
  });

  test("counts hours, not 'today', for a count taken the day before", () => {
    assert.match(seatAgeSentence(seatAge(at, hours(12.5)), hours(12.5)), /12 hours ago/);
    assert.match(seatAgeSentence(seatAge(at, hours(0.2)), hours(0.2)), /under an hour ago/);
    assert.match(seatAgeSentence(seatAge(at, hours(30)), hours(30)), /30 hours ago/);
  });
});

describe("the time a sum of sections carries", () => {
  test("is the oldest of its counts", () => {
    assert.equal(sumSeatsAt(["2026-10-12T21:31Z", "2026-09-21T13:01Z"], null), "2026-09-21T13:01Z");
  });

  test("falls back on the course's oldest count, never a sibling's newer one, when a part is undated", () => {
    assert.equal(sumSeatsAt(["2026-10-12T21:31Z", null], "2026-09-20T23:00Z"), "2026-09-20T23:00Z");
    assert.equal(sumSeatsAt(["2026-10-12T21:31Z", null], null), null);
    assert.equal(sumSeatsAt([], null), null);
  });
});

describe("a span of counts", () => {
  test("reads as one day or a range", () => {
    assert.equal(spanLabel(seatSpan([at, "2026-09-21T15:43Z"])!), "Sep 21");
    assert.equal(spanLabel(seatSpan(["2026-10-12T21:31Z", at, null])!), "Sep 21 – Oct 12");
    assert.equal(seatSpan([null, undefined, "nope"]), null);
  });
});

describe("the published dataset", () => {
  const index = JSON.parse(
    readFileSync(new URL("../../public/data/plat/index.json", import.meta.url), "utf8"),
  ) as PlatIndex;

  test("dates a list row's seats only with a real time, inside the term's span", () => {
    const { seatsAsOf, seatsNewest } = index.meta;
    for (const r of index.courses) {
      if (r.sat === undefined) continue;
      assert.ok(Number.isFinite(Date.parse(r.sat)), `${r.k}: ${r.sat}`);
      assert.ok(r.sl != null, `${r.k} is dated but has no seats`);
      if (seatsAsOf) assert.ok(Date.parse(r.sat) >= Date.parse(seatsAsOf), `${r.k} is older than the oldest count`);
      if (seatsNewest) assert.ok(Date.parse(r.sat) <= Date.parse(seatsNewest), `${r.k} is newer than the newest count`);
    }
  });

  test("never presents the time it read Class Planner as a seat time", () => {
    const { retrieved } = index.meta;
    if (!retrieved) return;
    for (const r of index.courses) assert.notEqual(r.sat, retrieved, r.k);
  });
});
