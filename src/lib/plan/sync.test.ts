import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  createSync, PLANNER_EVENT, PLANNER_KEY, RATINGS_EVENT, RATINGS_KEY, SHORTLIST_EVENT, SHORTLIST_KEY,
} from "./sync";
import { cleanDocs, DEFAULT_MAJOR, DEFAULT_MINOR, EMPTY_DOCS, type PlanDocs, type PlannerDoc } from "./record";

// ── A stand-in for /api/plan, with the route's rules ──────────────────────────

interface Put {
  owner: string;
  baseRev: number;
  docs: PlanDocs;
  keepalive?: boolean;
}

class Account {
  rev = 0;
  docs: PlanDocs = EMPTY_DOCS;
  /** Answers every request with this status instead, while set. */
  failWith: number | null = null;
  puts: Put[] = [];
  readonly owner: string;

  constructor(owner: string) {
    this.owner = owner;
  }

  handle = async (init: RequestInit = {}): Promise<Response> => {
    if (this.failWith) return Response.json({ error: "no" }, { status: this.failWith });
    const reply = (status = 200) =>
      Response.json({ owner: this.owner, rev: this.rev, savedAt: null, docs: this.docs }, { status });
    if (init.method !== "PUT") return reply();

    const body = JSON.parse(String(init.body)) as Put;
    this.puts.push({ ...body, keepalive: init.keepalive });
    if (body.owner !== this.owner || body.baseRev !== this.rev) return reply(409);
    this.rev += 1;
    this.docs = cleanDocs(body.docs);
    return reply();
  };
}

// ── A browser: its own storage, clock and timers ──────────────────────────────

function device(account: Account, stored: Partial<Record<string, unknown>> = {}) {
  const store = new Map<string, string>();
  for (const [k, v] of Object.entries(stored)) store.set(k, JSON.stringify(v));
  const events: string[] = [];
  const timers: { fn: () => void; ms: number; live: boolean }[] = [];
  let clock = 1_000_000;
  /** Whose session this browser has; reassigned to sign someone else in. */
  const session = { account };
  const d = {
    session,
    store,
    events,
    timers,
    sync: createSync({
      storage: {
        getItem: (k) => store.get(k) ?? null,
        setItem: (k, v) => { store.set(k, v); },
        removeItem: (k) => { store.delete(k); },
      },
      fetch: (_url, init) => session.account.handle(init),
      emit: (e) => { events.push(e); },
      setTimeout: (fn, ms) => {
        const t = { fn, ms, live: true };
        timers.push(t);
        return t;
      },
      clearTimeout: (t) => { (t as { live: boolean }).live = false; },
      now: () => clock,
    }),
    advance(ms: number) {
      clock += ms;
    },
    /** Lets every pending save and retry run, as the page would over time. */
    async settle(max = 10) {
      await d.sync.whenIdle();
      for (let i = 0; i < max; i++) {
        const t = timers.find((x) => x.live);
        if (!t) return;
        t.live = false;
        t.fn();
        await d.sync.whenIdle();
      }
    },
    read(): PlanDocs {
      const get = (k: string) => (store.has(k) ? JSON.parse(store.get(k)!) : null);
      return cleanDocs({ planner: get(PLANNER_KEY), shortlist: get(SHORTLIST_KEY), ratings: get(RATINGS_KEY) });
    },
    /** What the planner or a star button does: write storage, then say so. */
    edit(change: (docs: PlanDocs) => void) {
      const docs = d.read();
      change(docs);
      if (docs.planner) store.set(PLANNER_KEY, JSON.stringify(docs.planner));
      store.set(SHORTLIST_KEY, JSON.stringify(docs.shortlist));
      store.set(RATINGS_KEY, JSON.stringify(docs.ratings));
      d.sync.noteLocalChange();
    },
    /** Opens the page: start, and let the first check with the account finish. */
    async open() {
      d.sync.start();
      await d.settle();
    },
    /** Brings the tab back into view later on. */
    async refocus() {
      d.advance(60_000);
      d.sync.refresh();
      await d.settle();
    },
  };
  return d;
}

const course = (code: string) => ({
  id: code.toLowerCase().replace(/\s+/g, ""), code, title: code, units: 4, departments: [code.split(" ")[0]],
});

const planner = (codes: string[], over: Partial<PlannerDoc> = {}): PlannerDoc => ({
  major: DEFAULT_MAJOR, minor: DEFAULT_MINOR, college: null,
  schedule: codes.map((c) => ({ course: course(c) as never, id: `${c}#${Math.random().toString(36).slice(2, 8)}` })),
  planned: [], synced: [], sections: {},
  ...over,
});

const codesOf = (docs: PlanDocs) => docs.planner?.schedule.map((e) => e.course.code) ?? [];

const add = (code: string) => (docs: PlanDocs) => {
  docs.planner!.schedule.push({ course: course(code) as never, id: `${code}#${Math.random().toString(36).slice(2, 8)}` });
};

/** An account that already holds a plan, saved from somewhere else. */
async function accountWith(codes: string[], shortlist: string[] = []) {
  const account = new Account("me");
  const elsewhere = device(account, { [PLANNER_KEY]: planner(codes), [SHORTLIST_KEY]: shortlist });
  await elsewhere.open();
  return account;
}

describe("signing in on another device", () => {
  test("a new device shows the plan saved from the first", async () => {
    const account = await accountWith(["CSE 11", "MATH 20A"], ["COGS 9"]);
    account.docs.ratings = { "FA26::CSE 11::Politz": { quality: 5, difficulty: 2, again: true, at: "2026-09-28T00:00:00.000Z" } };

    const phone = device(account);
    await phone.open();

    assert.deepEqual(codesOf(phone.read()), ["CSE 11", "MATH 20A"]);
    assert.deepEqual(phone.read().shortlist, ["COGS 9"]);
    assert.equal(phone.read().ratings["FA26::CSE 11::Politz"].quality, 5);
    assert.deepEqual(phone.events.sort(), [PLANNER_EVENT, RATINGS_EVENT, SHORTLIST_EVENT].sort(),
      "whatever is on screen is told to redraw");
    assert.equal(account.puts.length, 1, "only the first device saved; the phone just read");
    assert.equal(phone.sync.status(), "synced");
  });

  test("a device's plan from before syncing is saved to an empty account", async () => {
    const account = new Account("me");
    const laptop = device(account, { [PLANNER_KEY]: planner(["CSE 11"]) });
    await laptop.open();
    assert.equal(account.rev, 1);
    assert.deepEqual(account.puts[0].baseRev, 0);
    assert.deepEqual(codesOf(account.docs), ["CSE 11"]);
    assert.equal(laptop.sync.status(), "synced");
  });

  test("two devices that each built part of a plan end up with all of it", async () => {
    const account = new Account("me");
    const laptop = device(account, { [PLANNER_KEY]: planner(["CSE 11"], { major: "Mathematics (BS)" }) });
    const phone = device(account, { [PLANNER_KEY]: planner(["PHYS 2A"]), [SHORTLIST_KEY]: ["COGS 9"] });

    await laptop.open();
    await phone.open();
    await laptop.refocus();

    for (const d of [laptop, phone]) {
      assert.deepEqual(codesOf(d.read()), ["CSE 11", "PHYS 2A"]);
      assert.equal(d.read().planner?.major, "Mathematics (BS)");
      assert.deepEqual(d.read().shortlist, ["COGS 9"]);
    }
    assert.deepEqual(codesOf(account.docs), ["CSE 11", "PHYS 2A"]);
  });

  test("an untouched planner is never saved over, or as, a plan", async () => {
    const empty = new Account("me");
    const fresh = device(empty, { [PLANNER_KEY]: planner([]) });
    await fresh.open();
    assert.equal(empty.puts.length, 0, "nothing worth keeping, so no record is made");

    const account = await accountWith(["CSE 11"]);
    const other = device(account, { [PLANNER_KEY]: planner([]) });
    await other.open();
    assert.deepEqual(codesOf(other.read()), ["CSE 11"]);
    assert.equal(account.puts.length, 1);
  });
});

describe("editing", () => {
  test("an edit is saved after a pause, based on the revision it started from", async () => {
    const account = await accountWith(["CSE 11"]);
    const laptop = device(account);
    await laptop.open();

    laptop.edit(add("MATH 20A"));
    assert.equal(laptop.sync.status(), "saving");
    assert.equal(account.puts.length, 1, "not saved on every click");
    await laptop.settle();

    assert.equal(account.puts[1].baseRev, 1);
    assert.deepEqual(codesOf(account.docs), ["CSE 11", "MATH 20A"]);
    assert.equal(laptop.sync.status(), "synced");
  });

  test("edits on two devices at once are merged, not overwritten", async () => {
    const account = await accountWith(["CSE 11"]);
    const laptop = device(account);
    const phone = device(account);
    await laptop.open();
    await phone.open();

    laptop.edit(add("MATH 20A"));
    await laptop.settle();
    // The phone has not heard of that save; its own edit is based on the old revision.
    phone.edit(add("PHYS 2A"));
    await phone.settle();

    assert.deepEqual(codesOf(account.docs), ["CSE 11", "MATH 20A", "PHYS 2A"]);
    assert.deepEqual(codesOf(phone.read()), ["CSE 11", "MATH 20A", "PHYS 2A"]);
    assert.ok(account.puts.some((p) => p.baseRev === 1 && codesOf(p.docs).join() === "CSE 11,PHYS 2A"),
      "the phone's stale save was refused rather than written over the laptop's");

    await laptop.refocus();
    assert.deepEqual(codesOf(laptop.read()), ["CSE 11", "MATH 20A", "PHYS 2A"]);
  });

  test("a course removed on one device is not brought back by a stale tab", async () => {
    const account = await accountWith(["CSE 11", "MATH 20A"]);
    const laptop = device(account);
    const oldTab = device(account);
    await laptop.open();
    await oldTab.open();

    laptop.edit((docs) => {
      docs.planner!.schedule = docs.planner!.schedule.filter((e) => e.course.code !== "MATH 20A");
    });
    await laptop.settle();
    // The old tab still shows MATH 20A, and stars something.
    oldTab.edit((docs) => docs.shortlist.push("COGS 9"));
    await oldTab.settle();

    assert.deepEqual(codesOf(account.docs), ["CSE 11"]);
    assert.deepEqual(account.docs.shortlist, ["COGS 9"]);
    assert.deepEqual(codesOf(oldTab.read()), ["CSE 11"]);
  });

  test("returning to a tab picks up what was saved elsewhere meanwhile", async () => {
    const account = await accountWith(["CSE 11"]);
    const laptop = device(account);
    const phone = device(account);
    await laptop.open();
    await phone.open();

    phone.edit((docs) => { docs.planner!.college = "Muir"; });
    await phone.settle();

    laptop.sync.refresh();
    await laptop.settle();
    assert.equal(laptop.read().planner?.college, null, "a refocus straight after loading is not a second check");

    laptop.events.length = 0;
    await laptop.refocus();
    assert.equal(laptop.read().planner?.college, "Muir");
    assert.ok(laptop.events.includes(PLANNER_EVENT));
  });

  test("hiding the tab saves at once, in a request that outlives the page", async () => {
    const account = await accountWith(["CSE 11"]);
    const laptop = device(account);
    await laptop.open();

    laptop.edit(add("MATH 20A"));
    laptop.sync.flush();
    await laptop.sync.whenIdle();

    assert.equal(account.puts.at(-1)?.keepalive, true);
    assert.deepEqual(codesOf(account.docs), ["CSE 11", "MATH 20A"]);
  });
});

describe("whose plan is in this browser", () => {
  test("a browser last used by another student never saves their plan into this account", async () => {
    const theirs = new Account("them");
    const shared = device(theirs, { [PLANNER_KEY]: planner(["DSC 10"]), [SHORTLIST_KEY]: ["DSC 20"] });
    await shared.open();

    // They sign out; someone with an empty account signs in on the same browser.
    const mine = new Account("me");
    shared.session.account = mine;
    await shared.refocus();

    assert.equal(mine.puts.length, 0);
    assert.equal(shared.read().planner, null, "their planner is gone from the browser");
    assert.deepEqual(shared.read().shortlist, []);
    assert.equal(shared.sync.status(), "synced");

    // And an edit made now belongs to the new student alone.
    shared.store.set(PLANNER_KEY, JSON.stringify(planner(["CSE 11"])));
    shared.sync.noteLocalChange();
    await shared.settle();
    assert.deepEqual(codesOf(mine.docs), ["CSE 11"]);
    assert.deepEqual(codesOf(theirs.docs), ["DSC 10"]);
  });

  test("a save from a tab still holding the other student's plan is turned away", async () => {
    const theirs = new Account("them");
    const shared = device(theirs, { [PLANNER_KEY]: planner(["DSC 10"]) });
    await shared.open();

    const mine = await accountWith(["CSE 11"]);
    shared.session.account = mine;
    shared.edit(add("DSC 20"));
    await shared.settle();

    assert.deepEqual(codesOf(mine.docs), ["CSE 11"]);
    assert.deepEqual(codesOf(shared.read()), ["CSE 11"]);
  });
});

describe("when the account cannot be reached", () => {
  test("edits are kept on the device and saved once it is back", async () => {
    const account = await accountWith(["CSE 11"]);
    const laptop = device(account);
    await laptop.open();

    account.failWith = 502;
    laptop.edit(add("MATH 20A"));
    await laptop.settle(1);
    assert.equal(laptop.sync.status(), "offline");
    assert.deepEqual(codesOf(laptop.read()), ["CSE 11", "MATH 20A"], "nothing on screen is lost");
    assert.ok(laptop.timers.some((t) => t.live), "a retry is scheduled");

    account.failWith = null;
    await laptop.settle();
    assert.equal(laptop.sync.status(), "synced");
    assert.deepEqual(codesOf(account.docs), ["CSE 11", "MATH 20A"]);
  });

  test("a deployment with nowhere to keep plans leaves them on the device, and says so", async () => {
    const account = new Account("me");
    account.failWith = 503;
    const laptop = device(account, { [PLANNER_KEY]: planner(["CSE 11"]) });
    await laptop.open();
    assert.equal(laptop.sync.status(), "unavailable");

    laptop.edit(add("MATH 20A"));
    await laptop.settle();
    assert.equal(laptop.timers.filter((t) => t.live).length, 0, "no retrying against a store that is not there");
    assert.deepEqual(codesOf(laptop.read()), ["CSE 11", "MATH 20A"]);
  });

  test("an account that lost its record is restored from the device", async () => {
    const account = await accountWith(["CSE 11"]);
    const laptop = device(account);
    await laptop.open();

    account.rev = 0;
    account.docs = EMPTY_DOCS;
    await laptop.refocus();

    assert.deepEqual(codesOf(laptop.read()), ["CSE 11"], "an empty answer does not wipe the device");
    assert.deepEqual(codesOf(account.docs), ["CSE 11"]);
    assert.equal(account.rev, 1);
  });

  test("signed out: nothing is sent", async () => {
    const account = new Account("me");
    account.failWith = 401;
    const laptop = device(account, { [PLANNER_KEY]: planner(["CSE 11"]) });
    await laptop.open();
    laptop.edit(add("MATH 20A"));
    await laptop.settle();
    assert.equal(laptop.sync.status(), "signed-out");
    assert.equal(account.puts.length, 0);
  });
});
