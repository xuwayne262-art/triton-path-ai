import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { hint, KV_PUT_SCRIPT, ownerTag, planKey, planStore, resetPlanStore, type PlanStore } from "./store";
import { storageKey } from "@/lib/history/store";
import { ownerKey } from "@/lib/housing/store";
import { EMPTY_DOCS, type PlanDocs } from "./record";

const SECRET = "test-secret";

describe("plan keys and owner tags", () => {
  test("stable per address, case-insensitive, and not the address", () => {
    const k = planKey("Alex@UCSD.edu", SECRET);
    assert.equal(k, planKey(" alex@ucsd.edu ", SECRET));
    assert.match(k, /^plan:[0-9a-f]{40}$/);
    assert.match(ownerTag("alex@ucsd.edu", SECRET), /^[0-9a-f]{16}$/);
    assert.ok(!k.includes("alex"));
  });

  test("differ by secret, so they cannot be precomputed from a list of addresses", () => {
    assert.notEqual(planKey("alex@ucsd.edu", SECRET), planKey("alex@ucsd.edu", "other"));
    assert.notEqual(ownerTag("alex@ucsd.edu", SECRET), ownerTag("alex@ucsd.edu", "other"));
  });

  test("share nothing with each other or with the student's other records", () => {
    const hex = (s: string) => s.slice(s.indexOf(":") + 1);
    const plan = hex(planKey("alex@ucsd.edu", SECRET));
    assert.ok(!plan.startsWith(ownerTag("alex@ucsd.edu", SECRET)), "the browser's tag is not a prefix of the key");
    assert.notEqual(plan, hex(storageKey("alex@ucsd.edu", SECRET)));
    assert.notEqual(plan, hex(ownerKey("alex@ucsd.edu", SECRET)));
  });

  test("refuse an empty address", () => {
    assert.throws(() => planKey("  ", SECRET));
    assert.throws(() => ownerTag("", SECRET));
  });
});

describe("hint", () => {
  test("a missing table points at the migration; a rejected key asks for the service role", () => {
    assert.match(hint(404, '{"code":"PGRST205","message":"Could not find the table"}'), /003_student_plan\.sql/);
    assert.match(hint(401, "JWT expired"), /SERVICE ROLE/);
    assert.equal(hint(500, "boom"), "");
  });
});

const plan: PlanDocs = { planner: null, shortlist: ["CSE 11"], ratings: {} };

/** Runs `fn` against a driver whose REST calls go to `reply` instead of the network. */
async function against<T>(
  vars: Record<string, string>,
  reply: (url: string, init: RequestInit) => Response,
  fn: (s: PlanStore, calls: { url: string; init: RequestInit }[]) => Promise<T>,
): Promise<T> {
  const realFetch = globalThis.fetch;
  const saved = { ...process.env };
  const calls: { url: string; init: RequestInit }[] = [];
  for (const k of Object.keys(process.env)) {
    if (/^(NEXT_PUBLIC_)?SUPABASE_|^KV_REST_API_|^UPSTASH_REDIS_REST_/.test(k)) delete process.env[k];
  }
  Object.assign(process.env, vars);
  resetPlanStore();
  globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    calls.push({ url: String(input), init });
    return reply(String(input), init);
  }) as typeof fetch;
  try {
    return await fn(planStore()!, calls);
  } finally {
    globalThis.fetch = realFetch;
    process.env = { ...saved };
    resetPlanStore();
  }
}

describe("the Supabase driver, against a stand-in for its REST API", () => {
  const supabase = { SUPABASE_URL: "https://proj.supabase.test/", SUPABASE_SERVICE_ROLE_KEY: "service-key" };
  const row = (rev: number, docs: unknown = plan) => ({ rev, record: docs, updated_at: "2026-09-29T00:00:00+00:00" });
  const TABLE = "https://proj.supabase.test/rest/v1/student_plan";

  test("reads one row with the service key, and cleans what it read", async () => {
    const got = await against(supabase, () => Response.json([row(3, { ...plan, junk: 1 })]), async (s, calls) => {
      assert.equal(s.name, "supabase");
      const p = await s.get("plan:abc");
      assert.equal(calls[0].url, `${TABLE}?key=eq.plan%3Aabc&select=rev,record,updated_at&limit=1`);
      const h = calls[0].init.headers as Record<string, string>;
      assert.equal(h.apikey, "service-key");
      assert.equal(h.authorization, "Bearer service-key");
      return p;
    });
    assert.deepEqual(got, { rev: 3, savedAt: "2026-09-29T00:00:00+00:00", docs: plan });
  });

  test("nothing saved reads as null", async () => {
    assert.equal(await against(supabase, () => Response.json([]), (s) => s.get("plan:abc")), null);
  });

  test("the first save is an insert that does nothing if a row appeared meanwhile", async () => {
    await against(supabase, () => Response.json([row(1)]), async (s, calls) => {
      const r = await s.put("plan:abc", 0, plan);
      assert.ok(r.ok && r.plan.rev === 1);
      assert.equal(calls[0].init.method, "POST");
      assert.equal(calls[0].url, `${TABLE}?select=rev,record,updated_at`);
      assert.match((calls[0].init.headers as Record<string, string>).prefer, /resolution=ignore-duplicates/);
      assert.match((calls[0].init.headers as Record<string, string>).prefer, /return=representation/);
      const [sent] = JSON.parse(String(calls[0].init.body));
      assert.equal(sent.key, "plan:abc");
      assert.equal(sent.rev, 1);
      assert.deepEqual(sent.record, plan);
    });
  });

  test("a later save only lands on the revision it was based on", async () => {
    await against(supabase, () => Response.json([row(4)]), async (s, calls) => {
      const r = await s.put("plan:abc", 3, plan);
      assert.ok(r.ok && r.plan.rev === 4);
      assert.equal(calls[0].init.method, "PATCH");
      assert.equal(calls[0].url, `${TABLE}?key=eq.plan%3Aabc&rev=eq.3&select=rev,record,updated_at`);
      assert.equal(JSON.parse(String(calls[0].init.body)).rev, 4);
    });
  });

  test("a save based on an old revision changes nothing and returns what is there", async () => {
    const newer = { ...plan, shortlist: ["MATH 20A"] };
    const reply = (_url: string, init: RequestInit) =>
      Response.json(init.method === "PATCH" || init.method === "POST" ? [] : [row(7, newer)]);
    for (const base of [0, 3]) {
      const r = await against(supabase, reply, (s) => s.put("plan:abc", base, plan));
      assert.deepEqual(r, { ok: false, current: { rev: 7, savedAt: "2026-09-29T00:00:00+00:00", docs: newer } });
    }
  });

  test("a database without the migration says which file to run", async () => {
    const reply = () => new Response('{"code":"PGRST205","message":"Could not find the table"}', { status: 404 });
    await assert.rejects(against(supabase, reply, (s) => s.get("plan:abc")), /003_student_plan\.sql/);
  });
});

describe("the KV driver, against a stand-in for its REST API", () => {
  const kv = { KV_REST_API_URL: "https://kv.test", KV_REST_API_TOKEN: "kv-token" };

  test("saves with one compare-and-set script", async () => {
    await against(kv, () => Response.json({ result: [1] }), async (s, calls) => {
      assert.equal(s.name, "kv");
      const r = await s.put("plan:abc", 2, plan);
      assert.ok(r.ok && r.plan.rev === 3);
      const [cmd, script, keys, key, base, value] = JSON.parse(String(calls[0].init.body));
      assert.deepEqual([cmd, script, keys, key, base], ["EVAL", KV_PUT_SCRIPT, 1, "plan:abc", "2"]);
      assert.equal(JSON.parse(value).rev, 3);
      assert.deepEqual(JSON.parse(value).docs, plan);
    });
  });

  test("a refused save returns what is stored now", async () => {
    const current = JSON.stringify({ rev: 5, savedAt: "2026-09-29T00:00:00.000Z", docs: plan });
    const r = await against(kv, () => Response.json({ result: [0, current] }), (s) => s.put("plan:abc", 2, EMPTY_DOCS));
    assert.deepEqual(r, { ok: false, current: { rev: 5, savedAt: "2026-09-29T00:00:00.000Z", docs: plan } });
  });

  test("reads back what it stored, and nothing as null", async () => {
    const stored = JSON.stringify({ rev: 1, savedAt: "x", docs: plan });
    assert.deepEqual(await against(kv, () => Response.json({ result: stored }), (s) => s.get("plan:abc")),
      { rev: 1, savedAt: "x", docs: plan });
    assert.equal(await against(kv, () => Response.json({ result: null }), (s) => s.get("plan:abc")), null);
  });
});
