import { test } from "node:test";
import assert from "node:assert/strict";
import { courseSearchModel, discoveryConfigured, reserveDiscovery } from "./discoveryQuota";

const ENV = ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY", "SUPABASE_SECRET_KEY", "AUTH_SECRET", "NEXTAUTH_SECRET", "AI_GATEWAY_API_KEY", "VERCEL_OIDC_TOKEN", "AI_COURSE_SEARCH_MODEL", "AI_COURSE_SEARCH_ENABLED"] as const;

test("AI search requires explicit opt-in, durable quota credentials, and gateway authentication", () => {
  const before = ENV.map((name) => process.env[name]);
  try {
    for (const name of ENV) delete process.env[name];
    assert.equal(discoveryConfigured(), false);
    const required = { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "test-key", AUTH_SECRET: "test-secret", AI_GATEWAY_API_KEY: "test-gateway-key", AI_COURSE_SEARCH_ENABLED: "true" };
    Object.assign(process.env, required);
    assert.equal(discoveryConfigured(), true);
    for (const [name, value] of Object.entries(required)) {
      delete process.env[name];
      assert.equal(discoveryConfigured(), false, name);
      process.env[name] = value;
    }
  } finally {
    ENV.forEach((name, i) => { if (before[i] === undefined) delete process.env[name]; else process.env[name] = before[i]; });
  }
});

test("AI search uses GPT-5 nano unless AI_COURSE_SEARCH_MODEL names another model", () => {
  const before = process.env.AI_COURSE_SEARCH_MODEL;
  try {
    delete process.env.AI_COURSE_SEARCH_MODEL;
    assert.equal(courseSearchModel(), "openai/gpt-5-nano");
    process.env.AI_COURSE_SEARCH_MODEL = "  ";
    assert.equal(courseSearchModel(), "openai/gpt-5-nano");
    process.env.AI_COURSE_SEARCH_MODEL = " mistral/mistral-small ";
    assert.equal(courseSearchModel(), "mistral/mistral-small");
  } finally {
    if (before === undefined) delete process.env.AI_COURSE_SEARCH_MODEL; else process.env.AI_COURSE_SEARCH_MODEL = before;
  }
});

test("the quota RPC sends only a stable keyed hash and fails closed for storage errors", async (t) => {
  const names = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "AUTH_SECRET"] as const;
  const before = names.map((name) => process.env[name]);
  const owners: string[] = [];
  let status = 200;
  let value: unknown = true;
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.equal(url, "https://example.supabase.co/rest/v1/rpc/reserve_course_search");
    assert.equal(init.cache, "no-store");
    assert.ok(init.signal instanceof AbortSignal);
    const body = JSON.parse(String(init.body));
    assert.deepEqual(Object.keys(body), ["owner_key"]);
    assert.match(body.owner_key, /^[a-f0-9]{64}$/);
    assert.ok(!String(init.body).includes("@"));
    owners.push(body.owner_key);
    return Response.json(value, { status });
  });
  try {
    Object.assign(process.env, { SUPABASE_URL: "https://example.supabase.co/", SUPABASE_SERVICE_ROLE_KEY: "test-key", AUTH_SECRET: "test-secret" });
    assert.equal(await reserveDiscovery(" Student@UCSD.edu "), true);
    assert.equal(await reserveDiscovery("student@ucsd.edu"), true);
    assert.equal(owners[0], owners[1]);
    await reserveDiscovery("other@ucsd.edu");
    assert.notEqual(owners[0], owners[2]);
    value = false;
    assert.equal(await reserveDiscovery("student@ucsd.edu"), false);
    value = { allowed: true };
    await assert.rejects(() => reserveDiscovery("student@ucsd.edu"));
    status = 500;
    await assert.rejects(() => reserveDiscovery("student@ucsd.edu"));
  } finally {
    names.forEach((name, i) => { if (before[i] === undefined) delete process.env[name]; else process.env[name] = before[i]; });
  }
});
