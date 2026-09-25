import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { GET } from "./route";

/**
 * /api/walk never talks to the real Class Planner here: `fetch` is replaced for
 * every test, and the ones about refusal prove it is never reached at all.
 */

const realFetch = globalThis.fetch;
let calls: string[] = [];
let answer: () => Promise<Response>;

beforeEach(() => {
  calls = [];
  answer = async () => Response.json(UPSTREAM);
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    calls.push(String(input));
    return answer();
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

const req = (query: string) => new Request(`https://ucsdplans.test/api/walk?${query}`);

/** The module keeps a memo, so every test asks about its own schedule. */
let serial = 100;
const freshIds = () => {
  serial += 2;
  return [`E ${String(serial).padStart(8, "0")}`, `E ${String(serial + 1).padStart(8, "0")}`];
};

const UPSTREAM = {
  map_data: {
    locations: [{ key: "GH", building_code: "GH" }, { key: "CENTR", building_code: "CENTR" }],
    days: [{
      day_code: "T",
      stops: [
        { sequence: 1, location_key: "GH", start_minutes: 570 },
        { sequence: 2, location_key: "CENTR", start_minutes: 660 },
      ],
      transitions: [{
        from_sequence: 1, to_sequence: 2, distance_meters: 982, estimated_minutes: 12,
        geometry: { type: "LineString", coordinates: [[-117.2409, 32.8738], [-117.2369, 32.878]] },
      }],
    }],
  },
  // Everything below is upstream detail the proxy must not pass on.
  timed_events: [{ section: { instructors_text: "Joe Politz", seats_available: 0 } }],
  course_details: { "cse-011": { module_id: "8509" } },
};

describe("GET /api/walk — refusals never reach UCSD", () => {
  for (const [why, query] of [
    ["no term", "ids=E%2000000959"],
    ["a bad term", "term=../x&ids=E%2000000959"],
    ["no ids", "term=FA26"],
    ["a non-TSS id", "term=FA26&ids=E%2000000959,http://evil.test"],
  ] as const) {
    test(`400 for ${why}`, async () => {
      const res = await GET(req(query));
      assert.equal(res.status, 400);
      assert.equal(res.headers.get("Cache-Control"), "no-store");
      assert.equal(calls.length, 0, "Class Planner must not be contacted");
    });
  }
});

describe("GET /api/walk — routing", () => {
  test("asks Class Planner for the canonical ref and returns only the legs", async () => {
    const ids = freshIds();
    const res = await GET(req(`term=FA26&ids=${encodeURIComponent([...ids].reverse().join(","))}`));
    assert.equal(res.status, 200);
    assert.match(res.headers.get("Cache-Control") ?? "", /^private/);

    assert.equal(calls.length, 1);
    const url = new URL(calls[0]);
    assert.equal(url.origin, "https://classplanner.apps.ucsd.edu");
    assert.match(url.pathname, /^\/api\/v1\/schedules\/CS2[A-Za-z0-9+/]+$/);
    const ref = url.pathname.split("/").pop()!.slice(3);
    assert.deepEqual(JSON.parse(atob(ref)), { s: ids, t: "FA26" });

    const body = await res.json();
    assert.deepEqual(Object.keys(body), ["legs"]);
    assert.equal(body.legs.length, 1);
    assert.equal(body.legs[0].day, "Tue");
    assert.equal(body.legs[0].minutes, 12);
    assert.ok(!JSON.stringify(body).includes("Politz"), "no upstream detail leaks through");
  });

  test("answers a schedule it has already routed without asking again", async () => {
    const ids = freshIds();
    await GET(req(`term=FA26&ids=${encodeURIComponent(ids.join(","))}`));
    const again = await GET(req(`term=FA26&ids=${encodeURIComponent([...ids].reverse().join(","))}`));
    assert.equal(again.status, 200);
    assert.equal(calls.length, 1, "the second, reordered request is the same schedule");
  });

  test("502 with a code the page can act on when UCSD errors", async () => {
    answer = async () => new Response("down", { status: 503 });
    const res = await GET(req(`term=FA26&ids=${encodeURIComponent(freshIds().join(","))}`));
    assert.equal(res.status, 502);
    assert.equal(res.headers.get("Cache-Control"), "no-store");
    assert.equal((await res.json()).code, "ROUTES_UNAVAILABLE");
  });

  test("502 when UCSD cannot be reached at all", async () => {
    answer = async () => { throw new TypeError("fetch failed"); };
    const res = await GET(req(`term=FA26&ids=${encodeURIComponent(freshIds().join(","))}`));
    assert.equal(res.status, 502);
  });

  test("does not remember a failure — the next ask tries again", async () => {
    const ids = freshIds();
    answer = async () => new Response("down", { status: 500 });
    await GET(req(`term=FA26&ids=${encodeURIComponent(ids.join(","))}`));
    answer = async () => Response.json(UPSTREAM);
    const res = await GET(req(`term=FA26&ids=${encodeURIComponent(ids.join(","))}`));
    assert.equal(res.status, 200);
    assert.equal(calls.length, 2);
  });
});
