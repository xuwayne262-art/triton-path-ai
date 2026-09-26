import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  LIBRARY_WALK, clockLabel, earliestStart, formatDuration, formatHours, perQuarter, transitUrl, trip,
  weekCommute,
} from "./commute";
import type { Building } from "../plat";
import type { CalEvent } from "../sections";
import type { LatLng } from "../campus";

/** UCSD's own coordinates, from buildings.json. */
const B: Record<string, Building> = {
  CENTR: { n: "Center Hall", ll: [32.87804, -117.23686] },
  PCYNH: { n: "Pepper Canyon Hall", ll: [32.87835, -117.23374] },
  YORK: { n: "York Hall", ll: [32.87451, -117.24] },
  WLH: { n: "Warren Lecture Hall", ll: [32.88057, -117.23435] },
};

/** 3990 Nobel Dr, as the Census geocoder places it. */
const NOBEL: LatLng = [32.86802, -117.22013];

function ev(over: Partial<CalEvent> & Pick<CalEvent, "code" | "day" | "startMin" | "endMin">): CalEvent {
  return {
    key: `${over.code}-${over.day}-${over.startMin}-${over.ghost ?? ""}`,
    title: over.code,
    sectionCode: "A00",
    sectionId: "E 00000001",
    kind: "LE",
    kindLabel: "Lecture",
    where: "",
    buildingCode: "",
    building: "",
    instructor: "",
    role: "major",
    conflict: false,
    ...over,
  };
}

describe("trip", () => {
  test("Nobel Drive to Center Hall is a real walk, and a short ride", () => {
    const walk = trip(NOBEL, B.CENTR.ll, "walk");
    const bike = trip(NOBEL, B.CENTR.ll, "bike");
    // ~1.9 km as the crow flies, ~2.6 km on paths.
    assert.ok(walk.meters > 2400 && walk.meters < 2900, `got ${walk.meters} m`);
    assert.ok(walk.minutes >= 30 && walk.minutes <= 37, `got ${walk.minutes} min walking`);
    assert.ok(bike.minutes >= 9 && bike.minutes <= 12, `got ${bike.minutes} min cycling`);
    assert.equal(walk.meters, bike.meters, "the distance does not depend on the mode");
  });

  test("never claims a trip takes no time", () => {
    assert.equal(trip(B.CENTR.ll, B.CENTR.ll, "bike").minutes, 1);
  });
});

describe("weekCommute", () => {
  const week = [
    ev({ code: "CSE 11", day: "Mon", startMin: 480, endMin: 530, buildingCode: "CENTR" }),
    ev({ code: "MATH 20A", day: "Mon", startMin: 600, endMin: 650, buildingCode: "YORK" }),
    ev({ code: "CSE 11", day: "Wed", startMin: 480, endMin: 530, buildingCode: "CENTR" }),
    // Tuesday's first class has no room yet; the trip goes to the first one that does.
    ev({ code: "COGS 1", day: "Tue", startMin: 540, endMin: 590, buildingCode: "" }),
    ev({ code: "PHYS 2A", day: "Tue", startMin: 660, endMin: 740, buildingCode: "PCYNH" }),
    // Thursday has classes, none of them placeable.
    ev({ code: "MUS 4", day: "Thu", startMin: 600, endMin: 650, buildingCode: "NOWHERE" }),
    // A preview is not part of the week.
    ev({ code: "BILD 1", day: "Fri", startMin: 480, endMin: 530, buildingCode: "WLH", ghost: "option" }),
  ];

  const w = weekCommute(NOBEL, week, B, "walk");

  test("one entry per day with a placeable class, in weekday order", () => {
    assert.deepEqual(w.days.map((d) => d.day), ["Mon", "Tue", "Wed"]);
    assert.deepEqual(w.unmapped, ["Thu"]);
  });

  test("the morning trip goes to the first class, the trip home leaves from the last", () => {
    const mon = w.days[0];
    assert.equal(mon.first.event.code, "CSE 11");
    assert.equal(mon.last.event.code, "MATH 20A");
    assert.equal(mon.there.minutes, trip(NOBEL, B.CENTR.ll, "walk").minutes);
    assert.equal(mon.back.minutes, trip(B.YORK.ll, NOBEL, "walk").minutes);
  });

  test("leave-by is the first class's start minus the trip", () => {
    const mon = w.days[0];
    assert.equal(mon.leaveBy, 480 - mon.there.minutes);
  });

  test("an unplaced class is carried alongside, not dropped", () => {
    const tue = w.days[1];
    assert.equal(tue.first.event.code, "PHYS 2A");
    assert.deepEqual(tue.unplaced.map((e) => e.code), ["COGS 1"]);
  });

  test("the week sums one round trip per day", () => {
    const sum = w.days.reduce((n, d) => n + d.there.minutes + d.back.minutes, 0);
    assert.equal(w.minutes, sum);
    assert.equal(perQuarter(w), sum * 10);
  });

  test("the earliest departure is Monday's or Wednesday's 8am", () => {
    const d = earliestStart(w);
    assert.ok(d && (d.day === "Mon" || d.day === "Wed"));
  });

  test("a place closer to campus costs less of the week", () => {
    const near = weekCommute([32.8765, -117.2345], week, B, "walk");
    assert.ok(near.minutes < w.minutes);
  });

  test("no schedule, no trips", () => {
    const none = weekCommute(NOBEL, [], B, "bike");
    assert.equal(none.days.length, 0);
    assert.equal(none.minutes, 0);
    assert.equal(earliestStart(none), null);
  });
});

describe("formatting", () => {
  test("durations", () => {
    assert.equal(formatDuration(45), "45 min");
    assert.equal(formatDuration(120), "2 h");
    assert.equal(formatDuration(200), "3 h 20 min");
  });

  test("hours a quarter", () => {
    assert.equal(formatHours(50), "50 min");
    assert.equal(formatHours(95), "1.6 h");
    assert.equal(formatHours(1860), "31 h");
  });

  test("clock labels, including a departure before midnight's wrap", () => {
    assert.equal(clockLabel(458), "7:38a");
    assert.equal(clockLabel(720), "12:00p");
    assert.equal(clockLabel(-10), "11:50p");
  });

  test("transit directions go to Google with both ends", () => {
    const url = new URL(transitUrl(NOBEL, LIBRARY_WALK));
    assert.equal(url.searchParams.get("travelmode"), "transit");
    assert.equal(url.searchParams.get("origin"), "32.86802,-117.22013");
    assert.equal(url.searchParams.get("destination"), "32.8795,-117.2375");
  });
});
