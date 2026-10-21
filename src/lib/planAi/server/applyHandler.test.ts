import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { handleApply, type ApplyDependencies } from "./applyHandler";
import type { PlanStore, StoredPlan } from "@/lib/plan/store";
import { EMPTY_DOCS, type PlanDocs } from "@/lib/plan/record";
import { final, row, sec } from "../testFixtures";
import type { CourseRow, SectionTuple } from "@/lib/plat";

const rows: Record<string, CourseRow> = { "CSE 11": row("CSE 11"), "ECON 1": row("ECON 1"), "MATH 20A": row("MATH 20A") };
const sections: Record<string, SectionTuple[]> = {
  "CSE 11": [sec("A00", "LE", "MWF", "10:00a", "10:50a", { id: "L1" }), sec("A01", "DI", "M", "1:00p", "1:50p"), sec("A02", "DI", "W", "1:00p", "1:50p"), final("2026-12-08", "8:00a", "10:59a", "L1")],
  "ECON 1": [sec("A00", "LE", "TuTh", "11:00a", "12:20p"), sec("A01", "DI", "F", "9:00a", "9:50a")],
};

/** A plan store in memory, with the same compare-and-set rule as the real drivers. */
function memoryStore(failPut = false) {
  const plans = new Map<string, StoredPlan>();
  const store: PlanStore & { plans: Map<string, StoredPlan>; puts: number } = {
    name: "memory",
    plans,
    puts: 0,
    async get(key) { return plans.get(key) ?? null; },
    async put(key, baseRev, docs) {
      store.puts++;
      if (failPut) throw new Error("database secret detail");
      const cur = plans.get(key) ?? null;
      if ((cur?.rev ?? 0) !== baseRev) return { ok: false, current: cur };
      const plan = { rev: baseRev + 1, savedAt: "2026-10-21T12:00:00Z", docs: JSON.parse(JSON.stringify(docs)) as PlanDocs };
      plans.set(key, plan);
      return { ok: true, plan };
    },
  };
  return store;
}

const key = (email: string) => `plan:${email}`;
const tag = (email: string) => (email === "alex@ucsd.edu" ? "aaaaaaaaaaaaaaaa" : "bbbbbbbbbbbbbbbb");

function fixture({ email, failPut, ...over }: Partial<Omit<ApplyDependencies, "email">> & { email?: string | null; failPut?: boolean } = {}) {
  const store = memoryStore(failPut);
  const events: string[] = [];
  const deps: ApplyDependencies = {
    email: async () => (email === undefined ? "alex@ucsd.edu" : email),
    store: () => store,
    ownerTag: tag,
    planKey: key,
    data: async () => ({
      term: "FA26", termName: "Fall 2026",
      row: (c) => rows[c],
      sections: async (c) => sections[c] ?? null,
    }),
    metric: async (e) => { events.push(e); },
    now: () => new Date("2026-10-21T12:00:00Z"),
    ...over,
  };
  return { store, deps, events };
}

const ADD_CSE11 = { op: "add_term", code: "CSE 11", selection: { family: "A", parts: { DI: "A01" } } };

function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://ucsdplans.com/api/plan-ai/apply", {
    method: "POST", headers: { "content-type": "application/json", origin: "https://ucsdplans.com", ...headers }, body: JSON.stringify(body),
  });
}

const change = (id: string, ops: unknown[] = [ADD_CSE11], extra: Record<string, unknown> = {}) =>
  ({ owner: "aaaaaaaaaaaaaaaa", baseRev: 0, change: { id, kind: "apply", term: "FA26", ops, ...extra } });

const ID1 = "pc_aaaaaaaaaaaaaaaaaaa1";
const ID2 = "pc_aaaaaaaaaaaaaaaaaaa2";
const ID3 = "pc_aaaaaaaaaaaaaaaaaaa3";

describe("who may change a plan", () => {
  test("no session, another domain, or forged headers: nothing is read or written", async () => {
    for (const email of [null, "alex@gmail.com", "alex@eng.ucsd.edu"]) {
      const { deps, store } = fixture({ email });
      const res = await handleApply(request(change(ID1), { "x-user-email": "alex@ucsd.edu" }), deps);
      assert.equal(res.status, 401);
      assert.equal(store.puts, 0);
    }
  });

  test("another site cannot post a change", async () => {
    const { deps, store } = fixture();
    assert.equal((await handleApply(request(change(ID1), { origin: "https://evil.example" }), deps)).status, 403);
    assert.equal(store.puts, 0);
  });

  test("a request cannot reach another student's plan", async () => {
    const { deps, store } = fixture();
    store.plans.set(key("blake@ucsd.edu"), { rev: 3, savedAt: "", docs: { ...EMPTY_DOCS, shortlist: ["MATH 20A"] } });
    // Naming the other student's owner tag, or adding fields, changes nothing: the plan is the session's.
    const forged = await handleApply(request({ ...change(ID1), owner: tag("blake@ucsd.edu") }), deps);
    assert.equal(forged.status, 409);
    assert.equal((await forged.json()).code, "OWNER_MISMATCH");
    const extra = await handleApply(request({ ...change(ID1), email: "blake@ucsd.edu" }), deps);
    assert.equal(extra.status, 400);
    assert.deepEqual(store.plans.get(key("blake@ucsd.edu"))?.docs.shortlist, ["MATH 20A"]);
    assert.equal(store.plans.get(key("blake@ucsd.edu"))?.rev, 3);
  });
});

describe("applying", () => {
  test("saves the change, logs it with its inverse, and only then says it is applied", async () => {
    const { deps, store, events } = fixture();
    const res = await handleApply(request(change(ID1)), deps);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, "applied");
    assert.equal(body.rev, 1);
    const saved = store.plans.get(key("alex@ucsd.edu"))!;
    assert.deepEqual(saved.docs.planner?.schedule.map((e) => e.course.code), ["CSE 11"]);
    assert.equal(saved.docs.planner?.log?.[0].id, ID1);
    assert.equal(saved.docs.planner?.log?.[0].label, "Added CSE 11 to Fall 2026");
    assert.deepEqual(saved.docs.planner?.log?.[0].inverse[0].op, "remove_term");
    assert.ok(events.includes("apply_ok"));
  });

  test("a retried or double-clicked request is applied once", async () => {
    const { deps, store } = fixture();
    await handleApply(request(change(ID1)), deps);
    const again = await handleApply(request(change(ID1)), deps);
    assert.equal(again.status, 200);
    assert.equal((await again.json()).status, "duplicate");
    assert.equal(store.plans.get(key("alex@ucsd.edu"))?.rev, 1);
    assert.equal(store.plans.get(key("alex@ucsd.edu"))?.docs.planner?.schedule.length, 1);
  });

  test("a change based on an old revision is refused with the plan as it is now", async () => {
    const { deps, store } = fixture();
    await handleApply(request(change(ID1)), deps);
    const stale = await handleApply(request(change(ID2, [{ op: "add_term", code: "ECON 1", selection: null }])), deps);
    assert.equal(stale.status, 409);
    const body = await stale.json();
    assert.equal(body.code, "PLAN_CHANGED");
    assert.equal(body.rev, 1);
    assert.equal(store.plans.get(key("alex@ucsd.edu"))?.docs.planner?.schedule.length, 1);
  });

  test("fabricated courses, actions and sections never reach the plan", async () => {
    for (const ops of [
      [{ op: "add_term", code: "FAKE 999", selection: null }],
      [{ op: "drop_table", code: "CSE 11" }],
      [{ op: "add_term", code: "CSE 11", selection: { family: "Q", parts: {} } }],
    ]) {
      const { deps, store } = fixture();
      const res = await handleApply(request(change(ID1, ops)), deps);
      assert.ok(res.status === 400 || res.status === 409, JSON.stringify(ops));
      assert.equal(store.puts, 0);
    }
  });

  test("a failed save says so and changes nothing", async () => {
    const { deps, store } = fixture({ failPut: true });
    const res = await handleApply(request(change(ID1)), deps);
    assert.equal(res.status, 502);
    const text = await res.text();
    assert.ok(!text.includes("applied"));
    assert.ok(!text.includes("database secret"));
    assert.equal(store.plans.size, 0);
  });

  test("a change made for an earlier term's schedule is refused", async () => {
    const { deps } = fixture();
    const res = await handleApply(request(change(ID1, [ADD_CSE11], { term: "SU26" })), deps);
    assert.equal(res.status, 409);
    assert.equal((await res.json()).code, "TERM_CHANGED");
  });
});

describe("undo", () => {
  const undo = (id: string, of: string, baseRev: number) => ({ owner: "aaaaaaaaaaaaaaaa", baseRev, change: { id, kind: "undo", undoOf: of, term: "FA26", ops: [] } });

  test("removes only its own change, after unrelated edits", async () => {
    const { deps, store } = fixture();
    await handleApply(request(change(ID1)), deps);
    await handleApply(request({ ...change(ID2, [{ op: "add_term", code: "ECON 1", selection: null }]), baseRev: 1 }), deps);
    const res = await handleApply(request(undo(ID3, ID1, 2)), deps);
    assert.equal(res.status, 200);
    const planner = store.plans.get(key("alex@ucsd.edu"))!.docs.planner!;
    assert.deepEqual(planner.schedule.map((e) => e.course.code), ["ECON 1"]);
    assert.equal(planner.log?.find((c) => c.id === ID1)?.undoneBy, ID3);
    const twice = await handleApply(request(undo("pc_aaaaaaaaaaaaaaaaaaa4", ID1, 3)), deps);
    assert.equal((await twice.json()).status, "already-undone");
  });

  test("an undo over a later edit to the same course is refused, not forced", async () => {
    const { deps, store } = fixture();
    await handleApply(request(change(ID1)), deps);
    await handleApply(request({ ...change(ID2, [{ op: "set_sections", code: "CSE 11", selection: { family: "A", parts: { DI: "A02" } }, expect: { family: "A", parts: { DI: "A01" } } }]), baseRev: 1 }), deps);
    const res = await handleApply(request(undo(ID3, ID1, 2)), deps);
    assert.equal(res.status, 409);
    const body = await res.json();
    assert.equal(body.code, "UNDO_CONFLICT");
    assert.deepEqual(body.problems, [{ code: "SECTIONS_CHANGED", course: "CSE 11" }]);
    assert.deepEqual(store.plans.get(key("alex@ucsd.edu"))!.docs.planner!.sections["CSE 11"], { family: "A", parts: { DI: "A02" } });
  });
});
