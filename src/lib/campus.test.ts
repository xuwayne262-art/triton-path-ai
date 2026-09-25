import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  directionsUrl, estimateWalk, firstBusyDay, formatDistance, haversineMeters, legKey, legStatus,
  pinsFor, planDay, previewWalks, troubleLegs, weeklyWalking, type RoutedLeg,
} from "./campus";
import type { Building } from "./plat";
import type { CalEvent } from "./sections";

/** UCSD's own coordinates for these buildings, from buildings.json. */
const B: Record<string, Building> = {
  LEDDN: { n: "Ledden Auditorium", m: "Humanities and Social Sciences", ll: [32.87851, -117.24167] },
  CENTR: { n: "Center Hall", ll: [32.87804, -117.23686] },
  GH: { n: "Galbraith Hall", ll: [32.87383, -117.24092] },
  WLH: { n: "Warren Lecture Hall", ll: [32.88057, -117.23435] },
};

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

describe("distances", () => {
  test("Ledden Auditorium to Center Hall is about 453 m as the crow flies", () => {
    const d = haversineMeters(B.LEDDN.ll, B.CENTR.ll);
    assert.ok(Math.abs(d - 453) < 5, `got ${d}`);
  });

  test("the estimate lands near UCSD's own route for that leg (518 m, 7 min)", () => {
    const w = estimateWalk(B.LEDDN.ll, B.CENTR.ll);
    assert.ok(w.meters > 518 && w.meters < 650, `got ${w.meters} m`);
    assert.ok(w.minutes >= 7 && w.minutes <= 9, `got ${w.minutes} min`);
  });

  test("never claims a walk takes no time", () => {
    assert.equal(estimateWalk(B.CENTR.ll, B.CENTR.ll).minutes, 1);
  });

  test("formats short and long distances", () => {
    assert.equal(formatDistance(518), "520 m");
    assert.equal(formatDistance(3), "10 m");
    assert.equal(formatDistance(1234), "1.2 km");
  });
});

describe("legStatus", () => {
  test("ok with time to spare", () => assert.equal(legStatus(10, 5, false), "ok"));
  test("tight with under three minutes spare", () => assert.equal(legStatus(10, 8, false), "tight"));
  test("late when the walk outlasts the break — UCSD's own warning", () => assert.equal(legStatus(10, 12, false), "late"));
  test("same building needs no walk", () => assert.equal(legStatus(10, 0, true), "same"));
  test("overlapping classes are a clash, not a walk", () => assert.equal(legStatus(-20, 3, false), "clash"));
  test("an unplaced class says nothing it cannot know", () => assert.equal(legStatus(10, null, false), "unknown"));
});

describe("planDay", () => {
  const week = [
    ev({ code: "CSE 11", kind: "DI", day: "Wed", startMin: 780, endMin: 830, buildingCode: "CENTR" }),
    ev({ code: "MATH 20A", day: "Wed", startMin: 540, endMin: 590, buildingCode: "LEDDN" }),
    // Ten minutes after MATH 20A, across campus.
    ev({ code: "CSE 12", day: "Wed", startMin: 600, endMin: 650, buildingCode: "WLH" }),
    ev({ code: "CSE 12", kind: "DI", day: "Wed", startMin: 660, endMin: 710, buildingCode: "WLH" }),
    ev({ code: "CSE 11", day: "Tue", startMin: 570, endMin: 650, buildingCode: "GH" }),
    ev({ code: "CSE 15L", day: "Wed", startMin: 900, endMin: 950, buildingCode: "" }),
    ev({ code: "PHYS 2A", day: "Wed", startMin: 1000, endMin: 1050, ghost: "preview", buildingCode: "GH" }),
  ];

  const plan = planDay(week, "Wed", B);

  test("orders the day by start time and numbers each stop", () => {
    assert.deepEqual(plan.stops.map((s) => `${s.n}:${s.event.code}`), [
      "1:MATH 20A", "2:CSE 12", "3:CSE 12", "4:CSE 11", "5:CSE 15L",
    ]);
  });

  test("leaves previews out of the committed day", () => {
    assert.ok(!plan.stops.some((s) => s.event.ghost));
  });

  test("flags a cross-campus dash with a ten-minute break", () => {
    const dash = plan.legs[0];
    assert.equal(dash.gap, 10);
    assert.ok(dash.walk && dash.walk.minutes > 10, `walk ${dash.walk?.minutes}`);
    assert.equal(dash.status, "late");
    assert.equal(dash.source, "estimate");
    assert.deepEqual(troubleLegs(plan), [dash]);
  });

  test("staying in the same building is free", () => {
    assert.equal(plan.legs[1].status, "same");
    assert.deepEqual(plan.legs[1].walk, { meters: 0, minutes: 0 });
  });

  test("a stop with no location has an unknown walk, not a made-up one", () => {
    const last = plan.legs[3];
    assert.equal(last.status, "unknown");
    assert.equal(last.walk, null);
  });

  test("prefers UCSD's routed walk, and its path, over the estimate", () => {
    const routed: RoutedLeg = {
      day: "Wed", from: "LEDDN", fromStart: 540, to: "WLH", toStart: 600,
      meters: 806, minutes: 10, path: [[32.8785, -117.2416], [32.8805, -117.2344]],
    };
    const routes = new Map([[legKey("Wed", "LEDDN", 540, "WLH", 600), routed]]);
    const leg = planDay(week, "Wed", B, routes).legs[0];
    assert.equal(leg.source, "ucsd");
    assert.deepEqual(leg.walk, { meters: 806, minutes: 10 });
    assert.equal(leg.status, "tight", "10 min walk in a 10 min break");
    assert.equal(leg.path?.length, 2);
  });

  test("a day with one class has no legs", () => {
    assert.deepEqual(planDay(week, "Tue", B).legs, []);
  });

  test("weekly walking totals every leg that is a real walk", () => {
    const total = weeklyWalking([plan]);
    assert.equal(total.minutes, plan.legs.reduce((n, l) => n + (l.walk?.minutes ?? 0), 0));
  });
});

describe("previewWalks", () => {
  const committed = [
    ev({ code: "MATH 20A", day: "Wed", startMin: 540, endMin: 590, buildingCode: "LEDDN" }),
    ev({ code: "CHEM 6A", day: "Wed", startMin: 900, endMin: 950, buildingCode: "GH" }),
  ];

  test("finds the class before and after an option on its day", () => {
    const option = [ev({ code: "CSE 11", kind: "DI", day: "Wed", startMin: 600, endMin: 650, buildingCode: "CENTR", ghost: "preview" })];
    const [w] = previewWalks(option, committed, B);
    assert.equal(w.before?.event.code, "MATH 20A");
    assert.equal(w.before?.gap, 10);
    assert.equal(w.after?.event.code, "CHEM 6A");
    assert.equal(w.after?.status, "ok");
  });

  test("ignores the option's own course", () => {
    const option = [ev({ code: "MATH 20A", kind: "DI", day: "Wed", startMin: 600, endMin: 650, buildingCode: "CENTR", ghost: "preview" })];
    const [w] = previewWalks(option, committed, B);
    assert.equal(w.before, null);
  });
});

describe("pinsFor", () => {
  test("one pin per building, courses listed once, unplaced meetings kept", () => {
    const { pins, unplaced } = pinsFor([
      ev({ code: "CSE 11", day: "Wed", startMin: 780, endMin: 830, buildingCode: "CENTR" }),
      ev({ code: "CSE 11", day: "Fri", startMin: 780, endMin: 830, buildingCode: "CENTR" }),
      ev({ code: "MATH 20A", day: "Mon", startMin: 540, endMin: 590, buildingCode: "CENTR" }),
      ev({ code: "CSE 199", day: "Mon", startMin: 600, endMin: 650, buildingCode: "" }),
      ev({ code: "SIO 1", day: "Mon", startMin: 700, endMin: 750, buildingCode: "OAR" }),
    ], B);
    assert.equal(pins.length, 1);
    assert.deepEqual(pins[0].courses, ["MATH 20A", "CSE 11"], "in weekly order");
    assert.equal(pins[0].events.length, 3);
    assert.deepEqual(unplaced.map((e) => e.code), ["CSE 199", "SIO 1"]);
  });
});

describe("helpers", () => {
  test("opens on today when today has class, else the first busy day", () => {
    const week = [
      ev({ code: "A", day: "Tue", startMin: 600, endMin: 650 }),
      ev({ code: "B", day: "Thu", startMin: 600, endMin: 650 }),
    ];
    assert.equal(firstBusyDay(week, "Thu"), "Thu");
    assert.equal(firstBusyDay(week, "Mon"), "Tue");
    assert.equal(firstBusyDay([], "Mon"), null);
  });

  test("walking directions go to Google Maps with coordinates, not a search", () => {
    const url = new URL(directionsUrl(B.CENTR.ll));
    assert.equal(url.hostname, "www.google.com");
    assert.equal(url.searchParams.get("destination"), "32.87804,-117.23686");
    assert.equal(url.searchParams.get("travelmode"), "walking");
  });
});
