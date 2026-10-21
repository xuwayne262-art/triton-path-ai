import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { handleInterpret, type InterpretDependencies } from "./interpretHandler";
import { modelVocab } from "../intentSchema";
import type { GEFile, PlatIndex } from "@/lib/plat";

const index = JSON.parse(readFileSync(new URL("../../../../public/data/plat/index.json", import.meta.url), "utf8")) as PlatIndex;
const ge = JSON.parse(readFileSync(new URL("../../../../public/data/plat/ge.json", import.meta.url), "utf8")) as GEFile;
const vocab = modelVocab(index, ge);

/** A well-formed model answer, as Gemini's structured output would return it. */
const answer = (over: Record<string, unknown> = {}) => ({
  intent: "find_fitting_course", courses: [], replacement: null, optionNumber: null, quarter: null,
  unitsMin: null, unitsMax: null, earliestStart: "10:00", latestEnd: null, avoidDays: [], preferences: [],
  requirement: { kind: "none", college: null, area: null, discipline: null, program: null },
  subjects: [], topic: "climate", noPrerequisites: false, prerequisitesMet: false, keep: [], keepCurrent: false, unsupported: [],
  ...over,
});

function fixture({ email, ...over }: Partial<Omit<InterpretDependencies, "email">> & { email?: string | null } = {}) {
  const calls: string[] = [];
  const seen: { system: string; text: string }[] = [];
  const deps: InterpretDependencies = {
    email: async () => (email === undefined ? "alex@ucsd.edu" : email),
    enabled: () => true,
    reserve: async () => { calls.push("reserve"); return { ok: true, remaining: 19 }; },
    vocab: async () => vocab,
    interpret: async (system, text, signal) => {
      calls.push("model");
      assert.ok(signal instanceof AbortSignal);
      seen.push({ system, text });
      return answer();
    },
    metric: async () => {},
    ...over,
  };
  return { deps, calls, seen };
}

const request = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("https://ucsdplans.com/api/plan-ai/interpret", {
    method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body),
  });
const ok = (text = "find me a course about climate after 10am") => ({ text, context: { options: 0, pending: false } });

describe("nothing reaches the model unless every gate passes", () => {
  test("no session, an ineligible one, or another site", async () => {
    for (const email of [null, "alex@gmail.com"]) {
      const { deps, calls } = fixture({ email });
      assert.equal((await handleInterpret(request(ok(), { authorization: "Bearer forged" }), deps)).status, 401);
      assert.deepEqual(calls, []);
    }
    const { deps, calls } = fixture();
    assert.equal((await handleInterpret(request(ok(), { origin: "https://evil.example" }), deps)).status, 403);
    assert.deepEqual(calls, []);
  });

  test("missing configuration keeps the model off", async () => {
    const { deps, calls } = fixture({ enabled: () => false });
    const res = await handleInterpret(request(ok()), deps);
    assert.equal(res.status, 503);
    assert.equal((await res.json()).code, "AI_UNAVAILABLE");
    assert.deepEqual(calls, []);
  });

  test("a body with anything beyond the request is refused: no plan, record or identity rides along", async () => {
    for (const body of [
      { ...ok(), plan: { schedule: ["CSE 11"] } },
      { ...ok(), history: { gpa: 3.4 } },
      { text: "hi there", context: { options: 0, pending: false, email: "alex@ucsd.edu" } },
      { text: "x".repeat(401), context: { options: 0, pending: false } },
    ]) {
      const { deps, calls } = fixture();
      assert.equal((await handleInterpret(request(body), deps)).status, 400, JSON.stringify(body).slice(0, 60));
      assert.deepEqual(calls, []);
    }
  });

  test("personal academic details are never sent", async () => {
    for (const text of [
      "I got a B- in CSE 12, what should I take next",
      "my gpa is 3.12, find easy courses",
      "I'm Alex Rivera, PID A12345678",
      "email me at alex@ucsd.edu",
    ]) {
      const { deps, calls } = fixture();
      const res = await handleInterpret(request(ok(text)), deps);
      assert.equal(res.status, 422, text);
      assert.equal((await res.json()).code, "SENSITIVE_INPUT");
      assert.deepEqual(calls, [], text);
    }
  });

  test("an exhausted budget or an unreachable one stops before the model", async () => {
    const limited = fixture({ reserve: async () => ({ ok: false, reason: "site_day", retryAfter: 3600 }) });
    const res = await handleInterpret(request(ok()), limited.deps);
    assert.equal(res.status, 429);
    assert.equal(res.headers.get("retry-after"), "3600");
    assert.ok(!limited.calls.includes("model"));
    const broken = fixture({ reserve: async () => { throw new Error("db secret"); } });
    const down = await handleInterpret(request(ok()), broken.deps);
    assert.equal(down.status, 503);
    assert.ok(!(await down.text()).includes("db secret"));
    assert.ok(!broken.calls.includes("model"));
  });
});

describe("the one model call", () => {
  test("is made once, with the request and public vocabulary only", async () => {
    const { deps, calls, seen } = fixture();
    const res = await handleInterpret(request(ok()), deps);
    assert.equal(res.status, 200);
    assert.deepEqual(calls, ["reserve", "model"]);
    assert.equal(seen.length, 1);
    assert.equal(seen[0].text, "find me a course about climate after 10am");
    assert.ok(!seen[0].system.includes("alex"), "no identity in the prompt");
    const body = await res.json();
    assert.equal(body.interpretation.source, "model");
    assert.equal(body.interpretation.explicit, false, "a model's reading never carries a change out by itself");
    assert.equal(body.interpretation.constraints.earliestStart, 600);
  });

  test("fabricated course codes are rejected and named, not passed on", async () => {
    const { deps } = fixture({ interpret: async () => answer({ intent: "add_course", courses: ["CSE 11", "CSE 999", "FAKE 1"], topic: null }) });
    const body = await (await handleInterpret(request(ok("add cse 11 and the other one")), deps)).json();
    assert.deepEqual(body.interpretation.courses, ["CSE 11"]);
    assert.deepEqual(body.rejected.sort(), ["CSE 999", "FAKE 1"]);
  });

  test("an unknown action or malformed answer is refused", async () => {
    for (const raw of [answer({ intent: "delete_plan" }), { not: "json schema" }, null, answer({ extra: true })]) {
      const { deps } = fixture({ interpret: async () => raw });
      const res = await handleInterpret(request(ok()), deps);
      assert.equal(res.status, 502);
      assert.equal((await res.json()).code, "AI_INVALID");
    }
  });

  test("a requirement word never becomes the title search", async () => {
    const { deps } = fixture({ interpret: async () => answer({ topic: "pofc", requirement: { kind: "warren_pofc", college: "warren", area: null, discipline: "social", program: null } }) });
    const body = await (await handleInterpret(request(ok("warren social science pofc")), deps)).json();
    assert.equal(body.interpretation.topic, null);
    assert.deepEqual(body.interpretation.requirement, { kind: "warren_pofc", discipline: "social", program: null });
  });

  test("provider limits and timeouts fall back without retrying", async () => {
    let attempts = 0;
    const busy = fixture({ interpret: async () => { attempts++; throw Object.assign(new Error("quota detail"), { statusCode: 429, responseHeaders: { "retry-after": "30" } }); } });
    const res = await handleInterpret(request(ok()), busy.deps);
    assert.equal(res.status, 503);
    assert.equal(res.headers.get("retry-after"), "30");
    assert.equal(attempts, 1, "no retry against a provider limit");
    const overloaded = fixture({ interpret: async () => { attempts++; throw Object.assign(new Error("overloaded"), { statusCode: 503 }); } });
    const paused = await handleInterpret(request(ok()), overloaded.deps);
    assert.equal(paused.status, 503);
    assert.equal((await paused.json()).code, "AI_BUSY");
    assert.equal(paused.headers.get("retry-after"), "30");
    assert.equal(attempts, 2, "no retry against an overloaded model");
    const slow = fixture({ interpret: async () => { throw Object.assign(new Error("slow"), { name: "TimeoutError" }); } });
    const late = await handleInterpret(request(ok()), slow.deps);
    assert.equal(late.status, 504);
    assert.equal((await late.json()).code, "AI_TIMEOUT");
    const broken = fixture({ interpret: async () => { throw new Error("provider secret"); } });
    const failed = await handleInterpret(request(ok()), broken.deps);
    assert.equal(failed.status, 502);
    assert.ok(!(await failed.text()).includes("provider secret"));
  });
});
