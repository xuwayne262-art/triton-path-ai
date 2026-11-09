import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { HISTORY_VERSION, readSaveBody, sanitizeHistory, savedAtOf } from "./record";
import { readAcademicHistory } from "./parse";
import { TSS_FIXTURE, TSS_IDENTITY } from "./fixtures";
import { storageKey } from "./store";

const oneTerm = (courses: unknown[]) => ({
  terms: [{ code: "FA25", label: "Fall Quarter 2025", courses }],
});

describe("sanitizeHistory", () => {
  test("keeps a well-formed record", () => {
    const r = sanitizeHistory(oneTerm([
      { subject: "CSE", number: "11", title: "Accel Intro", units: 4, grade: "A", status: "graded" },
    ]));
    assert.equal(r?.terms[0].courses[0].code, "CSE 11");
    assert.equal(r?.totals.unitsEarned, 4);
    assert.equal(r?.totals.gpa, 4);
  });

  test("recomputes totals rather than believing the ones it was sent", () => {
    // A caller that could set its own totals could put any GPA on the
    // student's own dashboard.
    const r = sanitizeHistory({
      ...oneTerm([
        { subject: "CSE", number: "11", title: "x", units: 4, grade: "C", status: "graded" },
      ]),
      totals: { courses: 999, unitsEarned: 900, unitsInProgress: 900, transferUnits: 900, gpa: 4 },
    });
    assert.equal(r?.totals.gpa, 2);
    assert.equal(r?.totals.unitsEarned, 4);
    assert.equal(r?.totals.courses, 1);
    assert.equal(r?.totals.transferUnits, 0);
  });

  test("refuses a body with no coursework at all", () => {
    for (const bad of [null, undefined, 42, "x", {}, { terms: [] }, { terms: "no" }]) {
      assert.equal(sanitizeHistory(bad), null, JSON.stringify(bad));
    }
  });

  test("drops a course with no subject or number instead of storing a blank", () => {
    const r = sanitizeHistory(oneTerm([
      { subject: "", number: "11", title: "x", units: 4 },
      { subject: "CSE", number: "", title: "x", units: 4 },
      { subject: "CSE", number: "12", title: "ok", units: 4, grade: "B", status: "graded" },
    ]));
    assert.equal(r?.terms[0].courses.length, 1);
    assert.equal(r?.terms[0].courses[0].code, "CSE 12");
  });

  test("caps units so one row cannot dominate a GPA", () => {
    const r = sanitizeHistory(oneTerm([
      { subject: "CSE", number: "11", title: "x", units: 100000, grade: "A", status: "graded" },
    ]));
    assert.ok((r?.terms[0].courses[0].units ?? 0) <= 30);
  });

  test("turns NaN, Infinity and negative units into zero", () => {
    const r = sanitizeHistory(oneTerm([
      { subject: "CSE", number: "11", title: "x", units: Number.NaN, grade: "A", status: "graded" },
      { subject: "CSE", number: "12", title: "x", units: -5, grade: "A", status: "graded" },
      { subject: "CSE", number: "13", title: "x", units: "Infinity", grade: "A", status: "graded" },
    ]));
    for (const c of r?.terms[0].courses ?? []) assert.equal(c.units, 0, c.code);
    assert.equal(r?.totals.unitsEarned, 0);
    assert.equal(r?.totals.gpa, null, "no graded units means no GPA, not 0.00");
  });

  test("works a status out from the grade, never from the label it was sent", () => {
    const r = sanitizeHistory(oneTerm([
      { subject: "CSE", number: "11", title: "x", units: 4, grade: "A", status: "definitely-earned" },
      { subject: "CSE", number: "12", title: "x", units: 4, grade: "F", status: "graded" },
      { subject: "CSE", number: "15L", title: "x", units: 2, grade: "ZZ", status: "pass" },
    ]), "2026-11-08");
    const [a, f, zz] = r!.terms[0].courses;
    assert.equal(a.status, "graded");
    assert.equal(f.status, "fail", "an F labelled graded earns nothing");
    assert.equal(zz.status, "other", "an unknown mark is never a pass");
    assert.equal(r?.totals.unitsEarned, 4);
  });

  test("truncates long text instead of storing it", () => {
    const r = sanitizeHistory(oneTerm([
      { subject: "CSE", number: "11", title: "x".repeat(50_000), units: 4, grade: "A", status: "graded" },
    ]));
    assert.ok((r?.terms[0].courses[0].title.length ?? 0) <= 120);
  });

  test("bounds the number of terms, courses and transfer rows", () => {
    const many = Array.from({ length: 500 }, (_, i) => ({
      code: `FA${i % 99}`,
      label: "t",
      courses: [{ subject: "CSE", number: String(i), title: "x", units: 1, grade: "A", status: "graded" }],
    }));
    const r = sanitizeHistory({
      terms: many,
      transfer: Array.from({ length: 500 }, () => ({ title: "x", from: "y", units: 1 })),
    });
    assert.ok((r?.terms.length ?? 0) <= 40);
    assert.ok((r?.transfer.length ?? 0) <= 80);
  });

  test("stamps its own savedAt — a caller cannot backdate a record", () => {
    const r = sanitizeHistory({
      ...oneTerm([{ subject: "CSE", number: "11", title: "x", units: 4, grade: "A", status: "graded" }]),
      savedAt: "1999-01-01T00:00:00.000Z",
      v: 99,
    });
    assert.notEqual(r?.savedAt, "1999-01-01T00:00:00.000Z");
    assert.equal(r?.v, HISTORY_VERSION);
  });

  test("keeps what a TSS import adds: source code, grading option, CNV, review flags, dates", () => {
    const parsed = readAcademicHistory(TSS_FIXTURE, { today: "2026-11-08", has: (c) => c !== "MGT 162R" }).history;
    const r = sanitizeHistory({ ...parsed, planStart: 2024 }, "2026-11-08")!;
    const summer = r.terms.find((t) => t.code === "S226")!;
    assert.equal(summer.courses[0].cnv, true);
    assert.equal(summer.courses[0].option, "Letter Grade");
    assert.equal(summer.courses[0].points, 9.2);
    assert.equal(summer.courses[1].src, "WCWP-010B");
    const fall = r.terms.find((t) => t.code === "FA26")!;
    assert.equal(fall.start, "2026-09-21");
    assert.equal(fall.courses.find((c) => c.code === "MGT 162R")?.unmatched, true);
    assert.equal(r.source, "tss");
    assert.equal(r.planStart, 2024);
    assert.equal(r.totals.unitsEarned, 8);
    assert.equal(r.totals.unitsInProgress, 16);
    assert.equal(r.totals.gpa, null, "no GPA for a TSS import");
  });

  test("judges a blank grade by the server's date, not the status it was sent", () => {
    const body = { terms: [{ code: "SP26", label: "t", courses: [{ subject: "CSE", number: "12", title: "x", units: 4, grade: null, status: "progress" }] }] };
    assert.equal(sanitizeHistory(body, "2026-05-01")?.terms[0].courses[0].status, "progress");
    assert.equal(sanitizeHistory(body, "2026-11-08")?.terms[0].courses[0].status, "missing");
  });

  test("drops review reasons it does not know, terms it cannot place, and a second copy of an attempt", () => {
    const r = sanitizeHistory({
      terms: [
        { code: "FA26", courses: [
          { subject: "CSE", number: "11", units: 4, grade: "A", review: ["no-units", "make-it-count", 7] },
          { subject: "CSE", number: "11", units: 4, grade: "F" },
        ] },
        { code: "NOQTR", courses: [{ subject: "CSE", number: "12", units: 4, grade: "A" }] },
        { code: "2026", courses: [{ subject: "CSE", number: "13", units: 4, grade: "A" }] },
      ],
    }, "2026-11-08")!;
    assert.equal(r.terms.length, 1);
    assert.equal(r.terms[0].courses.length, 1);
    assert.deepEqual(r.terms[0].courses[0].review, ["no-units"]);
    assert.equal(r.totals.unitsEarned, 0, "a row under review earns nothing");
  });

  test("never stores the paste's own lines, or anything from the identity block", () => {
    const parsed = readAcademicHistory(`${TSS_IDENTITY}
${TSS_FIXTURE}`, { today: "2026-11-08" }).history;
    const r = sanitizeHistory({ ...parsed, warnings: ["Last Name McFixture PID A99999999"] }, "2026-11-08")!;
    const json = JSON.stringify(r);
    assert.deepEqual(r.warnings, []);
    for (const secret of ["McFixture", "A99999999", "tmcfixture"]) assert.ok(!json.includes(secret), secret);
  });

  test("refuses a plan year outside any student's lifetime", () => {
    const base = oneTerm([{ subject: "CSE", number: "11", title: "x", units: 4, grade: "A" }]);
    assert.equal(sanitizeHistory({ ...base, planStart: 1066 })?.planStart, undefined);
    assert.equal(sanitizeHistory({ ...base, planStart: 2025.5 })?.planStart, undefined);
    assert.equal(sanitizeHistory({ ...base, planStart: 2025 })?.planStart, 2025);
  });
});

describe("save requests", () => {
  test("the current page's body carries the copy it merged into", () => {
    assert.deepEqual(readSaveBody({ history: { terms: [] }, base: "2026-11-01T00:00:00.000Z" }), {
      history: { terms: [] }, base: "2026-11-01T00:00:00.000Z", checked: true,
    });
    assert.equal(readSaveBody({ history: {}, base: null }).base, null);
  });

  test("an older page's bare record still saves, as a replacement", () => {
    const old = { terms: [{ code: "FA25", courses: [] }] };
    assert.deepEqual(readSaveBody(old), { history: old, base: null, checked: false });
  });

  test("reads the saved time off a stored record", () => {
    assert.equal(savedAtOf(null), null);
    assert.equal(savedAtOf(JSON.stringify({ savedAt: "2026-11-01T00:00:00.000Z" })), "2026-11-01T00:00:00.000Z");
    assert.equal(savedAtOf("not json"), "", "an unreadable record never matches a base");
  });
});

describe("storageKey", () => {
  test("is stable for one address and different for another", () => {
    assert.equal(storageKey("alice@ucsd.edu", "s"), storageKey("alice@ucsd.edu", "s"));
    assert.notEqual(storageKey("alice@ucsd.edu", "s"), storageKey("bob@ucsd.edu", "s"));
  });

  test("ignores casing and surrounding space, as sign-in does", () => {
    assert.equal(storageKey("  Alice@UCSD.EDU ", "s"), storageKey("alice@ucsd.edu", "s"));
  });

  test("never contains the address", () => {
    const key = storageKey("alice@ucsd.edu", "s");
    assert.ok(!key.includes("alice"));
    assert.ok(!key.includes("@"));
    assert.match(key, /^hist:[0-9a-f]{40}$/);
  });

  test("depends on the secret, so keys cannot be precomputed from a name list", () => {
    assert.notEqual(storageKey("alice@ucsd.edu", "secret-one"), storageKey("alice@ucsd.edu", "secret-two"));
  });

  test("refuses to build a key with no address", () => {
    for (const bad of ["", "   ", null, undefined]) {
      assert.throws(() => storageKey(bad as unknown as string, "s"));
    }
  });
});

describe("historyStore (file driver)", () => {
  test("round-trips a record and forgets it on delete", async (t) => {
    const { historyStore, resetHistoryStore } = await import("./store");
    // The file driver is what `next dev` uses; production refuses to fall back
    // to it, so this exercises the same code path a developer runs.
    delete process.env.KV_REST_API_URL;
    delete process.env.UPSTASH_REDIS_REST_URL;
    resetHistoryStore();

    const store = historyStore();
    assert.ok(store, "a dev store exists without any KV configured");
    assert.equal(store.name, "file");

    const key = storageKey("roundtrip@ucsd.edu", "test-secret");
    t.after(async () => {
      await store.del(key);
      resetHistoryStore();
    });

    assert.equal(await store.get(key), null, "nothing stored yet");
    await store.set(key, JSON.stringify({ hello: "world" }));
    assert.deepEqual(JSON.parse((await store.get(key)) ?? "null"), { hello: "world" });
    await store.del(key);
    assert.equal(await store.get(key), null, "gone after delete");
  });

  test("deleting something that was never there is not an error", async () => {
    const { historyStore } = await import("./store");
    await historyStore()!.del(storageKey("never@ucsd.edu", "test-secret"));
  });
});

describe("historyStore driver selection", () => {
  const VARS = [
    "SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_SERVICE_KEY", "KV_REST_API_URL", "KV_REST_API_TOKEN",
    "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN",
  ];

  /** Runs `fn` with exactly `set` present, restoring the environment after. */
  async function withEnv(set: Record<string, string>, fn: () => Promise<void> | void) {
    const { resetHistoryStore } = await import("./store");
    const saved = Object.fromEntries(VARS.map((v) => [v, process.env[v]]));
    for (const v of VARS) delete process.env[v];
    Object.assign(process.env, set);
    resetHistoryStore();
    try {
      await fn();
    } finally {
      for (const v of VARS) delete process.env[v];
      for (const [k, v] of Object.entries(saved)) if (v !== undefined) process.env[k] = v;
      resetHistoryStore();
    }
  }

  test("uses Supabase when the service role key is present", async () => {
    const { historyStore } = await import("./store");
    await withEnv(
      { SUPABASE_URL: "https://proj.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "service-key" },
      () => assert.equal(historyStore()?.name, "supabase"),
    );
  });

  test("accepts the NEXT_PUBLIC url — that one is public anyway", async () => {
    const { historyStore } = await import("./store");
    await withEnv(
      { NEXT_PUBLIC_SUPABASE_URL: "https://proj.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "service-key" },
      () => assert.equal(historyStore()?.name, "supabase"),
    );
  });

  test("will not run on the anon key alone, and says why", async () => {
    // The anon key ships to every browser. A store built on it either reads
    // nothing under RLS, or exposes every student's record without it.
    const { historyStore, storeDiagnosis } = await import("./store");
    await withEnv(
      { SUPABASE_URL: "https://proj.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key" },
      () => {
        assert.notEqual(historyStore()?.name, "supabase");
        assert.match(storeDiagnosis(), /SUPABASE_SERVICE_ROLE_KEY/);
        assert.match(storeDiagnosis(), /anon\/publishable key cannot be used/);
      },
    );
  });

  test("prefers Supabase over KV when both are linked", async () => {
    const { historyStore } = await import("./store");
    await withEnv(
      {
        SUPABASE_URL: "https://proj.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "service-key",
        KV_REST_API_URL: "https://kv.example", KV_REST_API_TOKEN: "kv-token",
      },
      () => assert.equal(historyStore()?.name, "supabase"),
    );
  });

  test("still falls back to KV when only that is configured", async () => {
    const { historyStore } = await import("./store");
    await withEnv(
      { KV_REST_API_URL: "https://kv.example", KV_REST_API_TOKEN: "kv-token" },
      () => assert.equal(historyStore()?.name, "kv"),
    );
  });

  test("reports an unconfigured deployment rather than pretending", async () => {
    const { storeDiagnosis } = await import("./store");
    await withEnv({}, () => assert.match(storeDiagnosis(), /No SUPABASE_\* or KV_REST_API_\*/));
  });
});

describe("historyStore accepts Supabase's newer key naming", () => {
  test("SUPABASE_SECRET_KEY works like the service_role JWT", async () => {
    const { historyStore, resetHistoryStore } = await import("./store");
    const saved = process.env.SUPABASE_SECRET_KEY;
    process.env.SUPABASE_URL = "https://proj.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "sb_secret_example";
    resetHistoryStore();
    try {
      assert.equal(historyStore()?.name, "supabase");
    } finally {
      delete process.env.SUPABASE_URL;
      if (saved === undefined) delete process.env.SUPABASE_SECRET_KEY;
      else process.env.SUPABASE_SECRET_KEY = saved;
      resetHistoryStore();
    }
  });
});

describe("Supabase failure hints", () => {
  test("a missing table names the migration to run", async () => {
    const { hint } = await import("./store");
    const body = '{"code":"PGRST205","message":"Could not find the table \'public.academic_history\' in the schema cache"}';
    assert.match(hint(404, body), /supabase\/001_academic_history\.sql/);
  });

  test("a rejected key says which key is needed", async () => {
    const { hint } = await import("./store");
    assert.match(hint(401, '{"message":"Invalid API key"}'), /SERVICE ROLE/);
    assert.match(hint(403, '{"code":"42501","message":"permission denied for table"}'), /SERVICE ROLE/);
  });

  test("says nothing for a failure it cannot explain", async () => {
    const { hint } = await import("./store");
    // A guess dressed as a diagnosis sends someone fixing the wrong thing.
    assert.equal(hint(500, '{"message":"internal error"}'), "");
  });
});
