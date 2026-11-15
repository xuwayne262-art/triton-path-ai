import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { GET } from "./route";
import { resetSeatStore } from "@/lib/seats/store";

const realFetch = globalThis.fetch;
const realEnv = { ...process.env };
const ask = () => GET(new Request("https://ucsdplans.test/api/seats?course=CSE%2012&term=WI27"));

/** Supabase answering every request the same way. */
function supabaseAnswers(status: number, body: string) {
  globalThis.fetch = (async () => new Response(body, { status })) as typeof fetch;
}

describe("/api/seats", () => {
  let errors: string[];
  const realError = console.error;

  beforeEach(() => {
    process.env.SUPABASE_URL = "https://example.supabase.test";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
    resetSeatStore();
    errors = [];
    console.error = (...args: unknown[]) => { errors.push(args.join(" ")); };
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    process.env = { ...realEnv };
    resetSeatStore();
    console.error = realError;
  });

  test("answers an empty history, not a 502, while seat_history was never created", async () => {
    supabaseAnswers(404, JSON.stringify({ code: "PGRST205", message: "Could not find the table 'public.seat_history' in the schema cache" }));
    const res = await ask();
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { term: "WI27", points: [] });
    await ask();
    assert.ok(errors.length <= 1, "the missing table is logged once, not on every visit");
    assert.match(errors.join(" "), /004_seat_history\.sql/);
  });

  test("still answers 502 when the database itself fails", async () => {
    supabaseAnswers(500, "upstream exploded");
    const res = await ask();
    assert.equal(res.status, 502);
    assert.match(errors.join(" "), /history failed/);
  });

  test("returns the stored points when the table exists", async () => {
    supabaseAnswers(200, JSON.stringify([{ day: "2026-11-16", enrolled: 10, capacity: 395, waitlist: 0 }]));
    const res = await ask();
    assert.equal(res.status, 200);
    assert.deepEqual((await res.json()).points, [{ day: "2026-11-16", enrolled: 10, capacity: 395, waitlist: 0 }]);
  });
});
