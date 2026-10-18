import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { handleDiscovery, type DiscoveryDependencies } from "./discoveryHandler";
import { EMPTY_DISCOVERY } from "@/lib/discovery";
import type { GEFile, PlatIndex } from "@/lib/plat";

const index = JSON.parse(readFileSync(new URL("../../../public/data/plat/index.json", import.meta.url), "utf8")) as PlatIndex;
const ge = JSON.parse(readFileSync(new URL("../../../public/data/plat/ge.json", import.meta.url), "utf8")) as GEFile;
const request = (body: unknown = { query: "COGS up to four units" }, headers: Record<string, string> = {}) =>
  new Request("https://ucsdplans.com/api/course-search", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

function fixture(overrides: Partial<DiscoveryDependencies> = {}) {
  const calls: string[] = [];
  const deps: DiscoveryDependencies = {
    email: async () => "student@ucsd.edu", configured: () => true,
    reserve: async (email) => { calls.push(`reserve:${email}`); return true; },
    data: async () => { calls.push("data"); return { index, ge }; },
    interpret: async (query, _index, _ge, signal) => { calls.push("model"); assert.ok(signal instanceof AbortSignal); assert.equal(query, "COGS up to four units"); return { ...EMPTY_DISCOVERY, subject: "COGS", filters: { ...EMPTY_DISCOVERY.filters, units: "4" } }; },
    ...overrides,
  };
  return { calls, deps };
}

test("anonymous or ineligible callers cannot reach data, quota, or model, even with forged headers", async () => {
  for (const email of [null, "student@gmail.com", "x@ucsd.edu.example.com", "x@eng.ucsd.edu"]) {
    const { deps, calls } = fixture({ email: async () => email });
    const res = await handleDiscovery(request(undefined, { "x-user-email": "student@ucsd.edu", authorization: "Bearer fake" }), deps);
    assert.equal(res.status, 401);
    assert.equal(res.headers.get("cache-control"), "no-store");
    assert.deepEqual(calls, []);
  }
});

test("cross-origin requests cannot reserve paid usage", async () => {
  const { deps, calls } = fixture();
  assert.equal((await handleDiscovery(request(undefined, { origin: "https://elsewhere.test" }), deps)).status, 403);
  assert.deepEqual(calls, []);
});

test("disabled search and invalid requests cannot spend", async () => {
  const disabled = fixture({ configured: () => false });
  assert.equal((await handleDiscovery(request(), disabled.deps)).status, 503);
  assert.deepEqual(disabled.calls, []);
  for (const body of [null, { query: "  " }, { query: "x".repeat(601) }, { query: "COGS", email: "other@ucsd.edu" }]) {
    const { deps, calls } = fixture();
    assert.equal((await handleDiscovery(request(body), deps)).status, 400);
    assert.deepEqual(calls, []);
  }
});

test("oversized or malformed input is rejected before data or quota", async () => {
  const { deps, calls } = fixture();
  assert.equal((await handleDiscovery(request({ query: "x".repeat(140000) }), deps)).status, 413);
  const invalid = new Request("https://ucsdplans.com/api/course-search", { method: "POST", body: "{", headers: { "content-type": "application/json" } });
  assert.equal((await handleDiscovery(invalid, deps)).status, 400);
  assert.deepEqual(calls, []);
});

test("exhausted quota and failed durable storage block the model", async () => {
  for (const reserve of [async () => false, async () => { throw new Error("database secret must not leak"); }]) {
    const { deps, calls } = fixture({ reserve });
    const res = await handleDiscovery(request(), deps);
    assert.ok(res.status === 429 || res.status === 503);
    assert.ok(!calls.includes("model"));
    assert.ok(!(await res.text()).includes("database secret"));
    if (res.status === 429) assert.ok(Number(res.headers.get("retry-after")) > 0);
  }
});

test("one successful request reserves before model invocation and returns validated editable criteria", async () => {
  const { deps, calls } = fixture();
  const res = await handleDiscovery(request(undefined, { origin: "https://ucsdplans.com" }), deps);
  assert.equal(res.status, 200);
  assert.deepEqual(calls, ["data", "reserve:student@ucsd.edu", "model"]);
  const body = await res.json();
  assert.equal(body.intent.subject, "COGS");
  assert.equal(body.intent.filters.units, "4");
});

test("invented identifiers, invalid filters, and incompatible scopes never reach the UI", async () => {
  for (const result of [
    { ...EMPTY_DISCOVERY, subject: "FAKE" },
    { ...EMPTY_DISCOVERY, college: "ninth" },
    { ...EMPTY_DISCOVERY, college: "muir", area: "sixth:Art Making" },
    { ...EMPTY_DISCOVERY, filters: { ...EMPTY_DISCOVERY.filters, units: "99" } },
    { ...EMPTY_DISCOVERY, courses: ["FAKE 100"] },
  ]) {
    const { deps } = fixture({ interpret: async () => result });
    const res = await handleDiscovery(request(), deps);
    assert.equal(res.status, 502);
    assert.ok(!(await res.text()).includes("FAKE"));
  }
});

test("provider errors are sanitized and unsupported criteria remain visible", async () => {
  const broken = fixture({ interpret: async () => { throw new Error("secret provider detail"); } });
  const res = await handleDiscovery(request(), broken.deps);
  assert.equal(res.status, 502);
  assert.ok(!(await res.text()).includes("secret provider"));
  const { deps } = fixture({ interpret: async () => ({ ...EMPTY_DISCOVERY, unsupported: ["Meeting times cannot be filtered here."], clarification: "Which college are you in?" }) });
  const body = await (await handleDiscovery(request(), deps)).json();
  assert.equal(body.intent.unsupported.length, 1);
  assert.equal(body.intent.clarification, "Which college are you in?");
});
