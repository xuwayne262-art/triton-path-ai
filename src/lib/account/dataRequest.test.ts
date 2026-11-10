import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { deleteStudentData, describe as describeData, findStudentData, studentKeys, PHOTO_BUCKET } from "./dataRequest";
import { storageKey } from "@/lib/history/store";
import { planKey } from "@/lib/plan/store";
import { newPhotoRef, ownerKey } from "@/lib/housing/store";
import { quotaOwner } from "@/lib/planAi/server/quota";

const SECRET = "test-secret-not-real";
const EMAIL = "Testy.McFixture@UCSD.edu";
const BASE = "https://example.supabase.test";

interface Call { method: string; url: string; body: string | null; headers: Record<string, string> }

/** A stand-in for Supabase: answers from the rows given, and records every request. */
function fakeSupabase(rows: {
  history?: unknown[]; plan?: unknown[]; listings?: unknown[]; usage?: unknown[]; photos?: string[];
}) {
  const calls: Call[] = [];
  const fetchImpl = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ method: init.method ?? "GET", url, body: (init.body as string) ?? null, headers: (init.headers ?? {}) as Record<string, string> });
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    if (init.method === "DELETE") return new Response(null, { status: 204 });
    if (url.includes(`/storage/v1/object/list/${PHOTO_BUCKET}`)) return json((rows.photos ?? []).map((name) => ({ name })));
    if (url.includes("/rest/v1/academic_history")) return json(rows.history ?? []);
    if (url.includes("/rest/v1/student_plan")) return json(rows.plan ?? []);
    if (url.includes("/rest/v1/housing_listing")) return json(rows.listings ?? []);
    if (url.includes("/rest/v1/plan_ai_usage")) return json(rows.usage ?? []);
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
  return { calls, target: { url: BASE, serviceKey: "service-key", fetch: fetchImpl } };
}

describe("studentKeys", () => {
  test("derives each table's key exactly as the app does, from the lowercased email", () => {
    const keys = studentKeys(EMAIL, SECRET);
    const lower = EMAIL.toLowerCase();
    assert.equal(keys.history, storageKey(lower, SECRET));
    assert.equal(keys.plan, planKey(lower, SECRET));
    assert.equal(keys.housingOwner, ownerKey(lower, SECRET));
    assert.equal(keys.planAi, quotaOwner(lower, SECRET));
    assert.equal(new Set(Object.values(keys)).size, 4, "every table has its own key");
  });

  test("refuses to run without the secret, or without an email", () => {
    assert.throws(() => studentKeys(EMAIL, ""), /AUTH_SECRET/);
    assert.throws(() => studentKeys("not an email", SECRET), /Not an email/);
  });
});

describe("findStudentData", () => {
  const keys = studentKeys(EMAIL, SECRET);
  const mine = newPhotoRef(keys.housingOwner, SECRET);
  const theirs = newPhotoRef(ownerKey("someone.else@ucsd.edu", SECRET), SECRET);

  test("reads only this student's rows, and only photos signed with their key", async () => {
    const { calls, target } = fakeSupabase({
      history: [{ record: { terms: [] }, updated_at: "2026-11-09T00:00:00Z" }],
      plan: [{ rev: 3, record: {}, updated_at: "2026-11-09T00:00:00Z" }],
      listings: [{ id: "abc", record: {}, updated_at: "2026-11-09T00:00:00Z" }],
      usage: [{ bucket: "day:2026-11-09", n: 2, created_at: "2026-11-09T00:00:00Z" }],
      photos: [`${mine}.jpg`, `${theirs}.jpg`, "README.txt"],
    });
    const found = await findStudentData(EMAIL, SECRET, target);
    assert.deepEqual(found.photos, [`${mine}.jpg`]);
    assert.equal(found.housingListings.length, 1);
    assert.equal(found.plan?.rev, 3);
    assert.ok(calls.every((c) => c.method !== "DELETE"), "finding changes nothing");
    assert.ok(calls.some((c) => c.url.includes(`key=eq.${encodeURIComponent(keys.history)}`)));
    assert.ok(calls.some((c) => c.url.includes(`owner=eq.${encodeURIComponent(keys.housingOwner)}`)));
    assert.ok(calls.every((c) => c.headers.apikey === "service-key"));
  });

  test("never sends the email address itself to the database", async () => {
    const { calls, target } = fakeSupabase({});
    await findStudentData(EMAIL, SECRET, target);
    for (const c of calls) {
      assert.ok(!c.url.toLowerCase().includes("testy"), c.url);
      assert.ok(!(c.body ?? "").toLowerCase().includes("testy"));
    }
  });

  test("describes what it found in plain words", async () => {
    const { target } = fakeSupabase({ history: [{ record: {}, updated_at: "" }] });
    const text = describeData(await findStudentData(EMAIL, SECRET, target));
    assert.match(text, /Academic History: 1 record/);
    assert.match(text, /Saved plan: none/);
  });
});

describe("deleteStudentData", () => {
  test("deletes each table's rows by this student's key, and their photos in one request", async () => {
    const keys = studentKeys(EMAIL, SECRET);
    const photo = `${newPhotoRef(keys.housingOwner, SECRET)}.jpg`;
    const { calls, target } = fakeSupabase({
      history: [{ record: {}, updated_at: "" }],
      plan: [{ rev: 1, record: {}, updated_at: "" }],
      listings: [{ id: "abc", record: {}, updated_at: "" }],
      usage: [{ bucket: "day:2026-11-09", n: 1, created_at: "" }],
      photos: [photo],
    });
    const report = await deleteStudentData(EMAIL, SECRET, target);
    assert.deepEqual(report, { academicHistory: true, plan: true, housingListings: 1, planAiUsage: 1, photos: 1 });
    const deletes = calls.filter((c) => c.method === "DELETE");
    assert.equal(deletes.length, 5);
    assert.ok(deletes.some((c) => c.url.endsWith(`/rest/v1/academic_history?key=eq.${encodeURIComponent(keys.history)}`)));
    assert.ok(deletes.some((c) => c.url.endsWith(`/rest/v1/student_plan?key=eq.${encodeURIComponent(keys.plan)}`)));
    assert.ok(deletes.some((c) => c.url.endsWith(`/rest/v1/housing_listing?owner=eq.${encodeURIComponent(keys.housingOwner)}`)));
    assert.ok(deletes.some((c) => c.url.endsWith(`/rest/v1/plan_ai_usage?owner=eq.${encodeURIComponent(keys.planAi)}`)));
    const bulk = deletes.find((c) => c.url.endsWith(`/storage/v1/object/${PHOTO_BUCKET}`));
    assert.deepEqual(JSON.parse(bulk!.body!), { prefixes: [photo] });
  });

  test("sends no delete at all for a student with nothing saved", async () => {
    const { calls, target } = fakeSupabase({});
    const report = await deleteStudentData(EMAIL, SECRET, target);
    assert.deepEqual(report, { academicHistory: false, plan: false, housingListings: 0, planAiUsage: 0, photos: 0 });
    assert.equal(calls.filter((c) => c.method === "DELETE").length, 0);
  });
});
