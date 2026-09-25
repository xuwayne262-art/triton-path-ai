import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { MAX_SECTIONS, parseRouteRequest, scheduleRef, shapeRoutes } from "./walkRoutes";

const params = (q: Record<string, string>) => new URLSearchParams(q);

describe("scheduleRef", () => {
  // A ref UCSD's Class Planner accepted on 2026-09-26: CSE 11 A00/A01/A02 plus
  // MATH 20A A00/A01/A02. Byte-for-byte what its own share links produce.
  const ACCEPTED =
    "CS2eyJzIjpbIkUgMDAwMDA5NTkiLCJFIDAwMDAxNTc5IiwiRSAwMDAwMTU4MiIsIkUgMDAwMDE1ODMiLCJF"
    + "IDAwMDAzOTkxIiwiRSAwMDAwMzk5MiJdLCJ0IjoiRkEyNiJ9";
  const IDS = ["E 00000959", "E 00001579", "E 00001582", "E 00001583", "E 00003991", "E 00003992"];

  test("matches a ref Class Planner accepted", () => {
    assert.equal(scheduleRef(IDS, "FA26"), ACCEPTED);
  });

  test("is canonical whatever order the ids arrive in — the server refuses unsorted refs", () => {
    assert.equal(scheduleRef([...IDS].reverse(), "FA26"), ACCEPTED);
  });

  test("drops duplicates, which a section meeting in two rooms would otherwise add", () => {
    assert.equal(scheduleRef([...IDS, IDS[0], IDS[3]], "FA26"), ACCEPTED);
  });

  test("carries no base64 padding", () => {
    assert.ok(!scheduleRef(["E 00000959"], "FA26").endsWith("="));
  });
});

describe("parseRouteRequest", () => {
  test("accepts both shapes of TSS section id and sorts them", () => {
    const r = parseRouteRequest(params({ term: "FA26", ids: "EX00001234,E 00000959" }));
    assert.deepEqual(r, { ok: true, term: "FA26", ids: ["E 00000959", "EX00001234"] });
  });

  test("trims stray whitespace around ids", () => {
    const r = parseRouteRequest(params({ term: "FA26", ids: " E 00000959 , E 00003991" }));
    assert.equal(r.ok, true);
  });

  for (const [why, q] of [
    ["a missing term", { ids: "E 00000959" }],
    ["a malformed term", { term: "fall", ids: "E 00000959" }],
    ["no ids", { term: "FA26", ids: "" }],
    ["an id that is not a TSS id", { term: "FA26", ids: "E 00000959,../../admin" }],
    ["an id with a slash smuggled in", { term: "FA26", ids: "E 0000/959" }],
  ] as const) {
    test(`refuses ${why}`, () => {
      assert.equal(parseRouteRequest(params(q as Record<string, string>)).ok, false);
    });
  }

  test("refuses more sections than any week needs", () => {
    const ids = Array.from({ length: MAX_SECTIONS + 1 }, (_, i) => `E ${String(i).padStart(8, "0")}`);
    assert.equal(parseRouteRequest(params({ term: "FA26", ids: ids.join(",") })).ok, false);
  });
});

describe("shapeRoutes", () => {
  /** The shape Class Planner returned for Wednesday on 2026-09-26, trimmed. */
  const upstream = {
    section_ids: ["E 00000959"],
    map_data: {
      locations: [
        { key: "LEDDN", building_code: "LEDDN", display_name: "Humanities and Social Sciences" },
        { key: "CENTR", building_code: "CENTR", display_name: "Center Hall" },
      ],
      days: [
        {
          day_code: "W",
          stops: [
            { sequence: 1, location_key: "LEDDN", start_minutes: 540, end_minutes: 590 },
            { sequence: 2, location_key: "CENTR", start_minutes: 780, end_minutes: 830 },
          ],
          transitions: [
            {
              from_sequence: 1,
              to_sequence: 2,
              distance_meters: 518.4,
              estimated_minutes: 7,
              gap_minutes: 190,
              geometry: {
                type: "LineString",
                coordinates: [[-117.241619, 32.878504], [-117.2416204, 32.8786481]],
              },
            },
          ],
        },
        { day_code: "S", stops: [], transitions: [] },
      ],
    },
  };

  test("keeps each routed leg, keyed by building code and start minute", () => {
    const [leg, ...rest] = shapeRoutes(upstream);
    assert.equal(rest.length, 0);
    assert.equal(leg.day, "Wed");
    assert.equal(leg.from, "LEDDN");
    assert.equal(leg.fromStart, 540);
    assert.equal(leg.to, "CENTR");
    assert.equal(leg.toStart, 780);
    assert.equal(leg.meters, 518);
    assert.equal(leg.minutes, 7);
  });

  test("turns GeoJSON's [lng, lat] into [lat, lng], rounded to about a metre", () => {
    const [leg] = shapeRoutes(upstream);
    assert.deepEqual(leg.path, [[32.8785, -117.24162], [32.87865, -117.24162]]);
  });

  test("passes on nothing but the walk", () => {
    const [leg] = shapeRoutes(upstream);
    assert.deepEqual(Object.keys(leg).sort(), ["day", "from", "fromStart", "meters", "minutes", "path", "to", "toStart"]);
  });

  test("survives missing or malformed map data", () => {
    assert.deepEqual(shapeRoutes(null), []);
    assert.deepEqual(shapeRoutes({}), []);
    assert.deepEqual(shapeRoutes({ map_data: { days: "nope" } }), []);
    assert.deepEqual(
      shapeRoutes({ map_data: { days: [{ day_code: "M", stops: [{ sequence: 1 }], transitions: [{ from_sequence: 1, to_sequence: 9 }] }] } }),
      [],
    );
  });

  test("keeps a leg with no drawable path, so its minutes still count", () => {
    const noPath = structuredClone(upstream);
    noPath.map_data.days[0].transitions[0].geometry = { type: "Point", coordinates: [[0, 0]] };
    const [leg] = shapeRoutes(noPath);
    assert.deepEqual(leg.path, []);
    assert.equal(leg.minutes, 7);
  });
});
