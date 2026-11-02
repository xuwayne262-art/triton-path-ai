import { test } from "node:test";
import assert from "node:assert/strict";
import { PHOTOS_PER_HOUR, reservePhoto } from "./photoRate";

test("asks the shared store, so every instance sees one count", async () => {
  const saved = { ...process.env };
  process.env.SUPABASE_URL = "https://db.example";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
  const calls: string[] = [];
  const replies = [{ ok: true, remaining: 1 }, { ok: false, retry_after: 120 }];
  const fake = (async (url: string, init: RequestInit) => {
    calls.push(`${url} ${init.body}`);
    return new Response(JSON.stringify(replies.shift()), { status: 200 });
  }) as unknown as typeof fetch;
  try {
    assert.deepEqual(await reservePhoto("owner_abcdef12", new Date(), fake), { ok: true });
    assert.deepEqual(await reservePhoto("owner_abcdef12", new Date(), fake), { ok: false, retryAfter: 120 });
    assert.match(calls[0], /rpc\/reserve_housing_photo/);
    assert.match(calls[0], new RegExp(`"per_hour":${PHOTOS_PER_HOUR}`));
  } finally {
    process.env = saved;
  }
});

test("an unreachable store refuses the upload rather than running unlimited", async () => {
  const saved = { ...process.env };
  process.env.SUPABASE_URL = "https://db.example";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
  const fake = (async () => new Response("", { status: 500 })) as unknown as typeof fetch;
  try {
    assert.deepEqual(await reservePhoto("owner_abcdef12", new Date(), fake), { ok: false, unavailable: true });
  } finally {
    process.env = saved;
  }
});
