import { useEffect, useSyncExternalStore } from "react";
import {
  cleanDocs, cleanPlanner, cleanRatings, cleanShortlist, isBlankPlanner, type PlanDocs,
} from "./record";
import { adoptLegacy, mergeDocs, sameJson } from "./merge";

/**
 * Keeps this browser's copy of the plan in step with the account's.
 *
 * The planner, the starred list and ratings still read and write localStorage
 * exactly as before — that copy is what makes the site instant and keeps
 * working without a connection. This module is the only thing that talks to
 * /api/plan about it:
 *
 *  - **On load, and whenever the tab comes back into view**, it fetches the
 *    account's plan and folds it into the local copy, then tells whatever is
 *    showing that copy (the events below) to redraw.
 *  - **After an edit** (`noteLocalChange`) it waits a moment for more, then
 *    saves, naming the revision the edit was based on. If another device got
 *    there first the server refuses and hands back its copy; the two are merged
 *    (merge.ts) and saved again. Nothing is overwritten blind.
 *  - **When the tab is hidden or closed** it saves at once, so an edit made
 *    just before picking up another device is already there.
 *
 * Alongside the documents it keeps a note of which account this copy belongs
 * to and the last version it agreed with the account on. That version is what
 * makes a merge possible — and the account tag is what keeps a shared
 * browser's previous plan from ever being saved into the next student's
 * account.
 */

/** The keys these documents always lived under, so plans made before syncing carry straight over. */
export const PLANNER_KEY = "tritonplat-planner";
export const SHORTLIST_KEY = "tritonplat-shortlist";
export const RATINGS_KEY = "ucsdplans-term-ratings";
const META_KEY = "ucsdplans-plan-sync";

/** Fired on window when a document changed in storage underneath whatever is showing it. */
export const PLANNER_EVENT = "ucsdplans-planner-synced";
export const SHORTLIST_EVENT = "tritonplat-shortlist-change";
export const RATINGS_EVENT = "ucsdplans-term-ratings-change";

/** Long enough to fold a burst of clicks into one save. */
const SAVE_DELAY_MS = 800;
/** A tab refocused twice in a row checks the account once. */
const REFRESH_GAP_MS = 5_000;
const MAX_RETRY_MS = 5 * 60_000;
/** Refusals in a row before giving up until the next retry — a guard, not a normal path. */
const MAX_CONFLICTS = 3;

export type SyncStatus =
  /** Not running: rendered on the server, or this browser keeps no storage. */
  | "idle"
  /** First check with the account in flight. */
  | "loading"
  /** This device and the account agree. */
  | "synced"
  /** An edit is waiting to be saved, or being saved. */
  | "saving"
  /** The account could not be reached. Edits are kept here and retried. */
  | "offline"
  /** This deployment has nowhere to keep plans. */
  | "unavailable"
  /** The account refused the plan outright; retried on the next edit. */
  | "error"
  | "signed-out";

interface Remote {
  owner: string;
  rev: number;
  docs: PlanDocs;
}

interface Meta extends Omit<Remote, "docs"> {
  /** The account's copy as of `rev`: what both sides last agreed on. */
  base: PlanDocs;
}

export interface SyncEnv {
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  emit: (event: string) => void;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (id: unknown) => void;
  now: () => number;
}

function parse(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function readRemote(body: unknown): Remote | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.owner !== "string" || !b.owner) return null;
  if (typeof b.rev !== "number" || !Number.isInteger(b.rev) || b.rev < 0) return null;
  return { owner: b.owner, rev: b.rev, docs: cleanDocs(b.docs) };
}

/** The engine, with its world passed in so the tests can run it without a browser. */
export function createSync(env: SyncEnv) {
  let status: SyncStatus = "idle";
  const listeners = new Set<() => void>();
  let started = false;
  let meta: Meta | null = null;
  let wantPull = false;
  let wantPush = false;
  let running: Promise<void> | null = null;
  let saveTimer: unknown = null;
  let retryTimer: unknown = null;
  let retryIn = 0;
  let conflicts = 0;
  let lastPull = -Infinity;
  /** The page is going away: the next save must outlive it. */
  let leaving = false;

  const setStatus = (next: SyncStatus) => {
    if (next === status) return;
    status = next;
    for (const l of listeners) l();
  };

  function loadMeta(): Meta | null {
    const m = parse(env.storage.getItem(META_KEY)) as Partial<Meta> | null;
    if (!m || typeof m.owner !== "string" || typeof m.rev !== "number") return null;
    return { owner: m.owner, rev: m.rev, base: cleanDocs(m.base) };
  }

  function saveMeta(next: Meta) {
    meta = next;
    try {
      env.storage.setItem(META_KEY, JSON.stringify(next));
    } catch {
      /* Held in memory. A reload without it merges instead of fast-forwarding, which loses nothing. */
    }
  }

  function readLocal(): PlanDocs {
    return {
      planner: cleanPlanner(parse(env.storage.getItem(PLANNER_KEY))),
      shortlist: cleanShortlist(parse(env.storage.getItem(SHORTLIST_KEY))),
      ratings: cleanRatings(parse(env.storage.getItem(RATINGS_KEY))),
    };
  }

  /**
   * Stores what changed and tells whatever shows it. The events go out only
   * after every write, so nothing redraws from a half-applied plan. False when
   * storage refused, in which case nothing may be saved from it either.
   */
  function writeLocal(next: PlanDocs, prev: PlanDocs): boolean {
    const changed: string[] = [];
    try {
      if (!sameJson(next.planner, prev.planner)) {
        if (next.planner) env.storage.setItem(PLANNER_KEY, JSON.stringify(next.planner));
        else env.storage.removeItem(PLANNER_KEY);
        changed.push(PLANNER_EVENT);
      }
      if (!sameJson(next.shortlist, prev.shortlist)) {
        env.storage.setItem(SHORTLIST_KEY, JSON.stringify(next.shortlist));
        changed.push(SHORTLIST_EVENT);
      }
      if (!sameJson(next.ratings, prev.ratings)) {
        env.storage.setItem(RATINGS_KEY, JSON.stringify(next.ratings));
        changed.push(RATINGS_EVENT);
      }
      return true;
    } catch {
      return false;
    } finally {
      for (const e of changed) env.emit(e);
    }
  }

  function settled() {
    conflicts = 0;
    retryIn = 0;
    if (retryTimer !== null) {
      env.clearTimeout(retryTimer);
      retryTimer = null;
    }
    setStatus("synced");
  }

  /** Could not reach the account: say so, keep everything here, and try again later. */
  function offline() {
    setStatus("offline");
    retryIn = Math.min(Math.max(retryIn * 3, 5_000), MAX_RETRY_MS);
    if (retryTimer === null) {
      retryTimer = env.setTimeout(() => {
        retryTimer = null;
        wantPull = true;
        void pump();
      }, retryIn);
    }
  }

  /** The response, or null once the failure has been reported. A 409 is an answer, not a failure. */
  async function call(init?: RequestInit): Promise<Response | null> {
    let res: Response;
    try {
      res = await env.fetch("/api/plan", { cache: "no-store", ...init });
    } catch {
      offline();
      return null;
    }
    if (res.ok || res.status === 409) return res;
    if (res.status === 401) setStatus("signed-out");
    else if (res.status === 503) setStatus("unavailable");
    else if (res.status === 400 || res.status === 413) setStatus("error");
    else offline();
    return null;
  }

  /**
   * Folds the account's copy into this one and decides what is now true. The
   * three cases are the three things this browser's copy can be.
   */
  function absorb(remote: Remote) {
    const local = readLocal();
    let next: PlanDocs;
    if (meta && meta.owner === remote.owner) {
      // This student's own copy. If the account has not moved on since it last
      // agreed with this device — or has lost what it had — the copy here
      // stands, edits and all. Otherwise another device saved, and this
      // device's edits since `base` are folded into that.
      next = remote.rev <= meta.rev ? local : mergeDocs(meta.base, local, remote.docs);
    } else if (meta) {
      // The last plan in this browser was another student's. It is theirs,
      // it is already in their account, and it must not reach this one.
      next = remote.docs;
    } else {
      // Never synced: a plan made before plans were kept with accounts. On a
      // student's own device that is their own work, so it joins the account
      // rather than being replaced by it.
      next = remote.rev === 0 ? local : adoptLegacy(local, remote.docs);
    }
    if (!writeLocal(next, local)) {
      setStatus("error");
      return;
    }
    saveMeta({ owner: remote.owner, rev: remote.rev, base: remote.docs });
    if (sameJson(outgoing(next), remote.docs)) {
      settled();
    } else {
      wantPush = true;
      setStatus("saving");
    }
  }

  /** What would be saved from `docs`: an untouched planner is not worth creating a record for. */
  function outgoing(docs: PlanDocs): PlanDocs {
    return !meta?.base.planner && isBlankPlanner(docs.planner) ? { ...docs, planner: null } : docs;
  }

  async function pull() {
    lastPull = env.now();
    if (status === "idle") setStatus("loading");
    const res = await call();
    if (!res) return;
    const remote = readRemote(await res.json().catch(() => null));
    if (!remote) return offline();
    absorb(remote);
  }

  async function push() {
    // Nothing is saved before this device has heard from the account at least
    // once: the first check is what decides whose copy this is.
    if (!meta) {
      wantPull = true;
      return;
    }
    const before = readLocal();
    const sent = outgoing(before);
    if (sameJson(sent, meta.base)) return settled();

    setStatus("saving");
    const res = await call({
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ owner: meta.owner, baseRev: meta.rev, docs: sent }),
      keepalive: leaving,
    });
    if (!res) return;
    const remote = readRemote(await res.json().catch(() => null));
    if (!remote) return offline();

    if (res.status === 409) {
      // Another device saved first (or this browser's copy is not this
      // account's): merge with what is there now, and save the result.
      if (++conflicts > MAX_CONFLICTS) return offline();
      return absorb(remote);
    }

    saveMeta({ owner: remote.owner, rev: remote.rev, base: remote.docs });
    const after = readLocal();
    if (!sameJson(after, before)) {
      // Edited again while saving: that goes next, on top of what just landed.
      wantPush = true;
      return;
    }
    // Hold exactly what the account kept, in case it cleaned anything, so the
    // next comparison is against the truth.
    if (!sameJson(remote.docs, sent) && !writeLocal(remote.docs, after)) return setStatus("error");
    settled();
  }

  /** Runs one request at a time, so a save and a refresh never cross. */
  function pump(): Promise<void> {
    if (running) return running;
    running = (async () => {
      try {
        while (wantPull || wantPush) {
          if (wantPull) {
            wantPull = false;
            await pull();
          } else {
            wantPush = false;
            await push();
          }
          if (status !== "synced" && status !== "saving" && status !== "loading") break;
        }
      } catch {
        setStatus("error");
      } finally {
        running = null;
      }
    })();
    return running;
  }

  return {
    /** Begins syncing. Idempotent: every component that shows the plan may call it. */
    start() {
      if (started) return;
      started = true;
      meta = loadMeta();
      wantPull = true;
      void pump();
    },

    /** Something was just written to one of the three documents here. */
    noteLocalChange() {
      if (!started || !meta || status === "unavailable" || status === "signed-out") return;
      if (sameJson(outgoing(readLocal()), meta.base)) return;
      setStatus("saving");
      if (saveTimer !== null) env.clearTimeout(saveTimer);
      saveTimer = env.setTimeout(() => {
        saveTimer = null;
        wantPush = true;
        void pump();
      }, SAVE_DELAY_MS);
    },

    /** The tab is back in view: pick up anything saved elsewhere meanwhile. */
    refresh() {
      if (!started || status === "unavailable" || status === "signed-out") return;
      leaving = false;
      if (env.now() - lastPull < REFRESH_GAP_MS) return;
      wantPull = true;
      void pump();
    },

    /** The tab is being hidden or closed: save now rather than after the delay. */
    flush() {
      if (saveTimer === null) return;
      env.clearTimeout(saveTimer);
      saveTimer = null;
      leaving = true;
      wantPush = true;
      void pump();
    },

    /**
     * Saves whatever is waiting, now, and resolves once this device and the
     * account agree: with the account's revision and this copy's owner tag,
     * which a change made on the server must name. Null when they cannot be
     * brought to agree — offline, signed out, or nowhere to keep plans — and
     * `status()` says which.
     */
    async settle(): Promise<{ owner: string; rev: number } | null> {
      if (!started) return null;
      if (saveTimer !== null) {
        env.clearTimeout(saveTimer);
        saveTimer = null;
      }
      // With nothing to save, ask anyway: another tab may have saved since,
      // and finding out now beats a refused change.
      if (meta && !sameJson(outgoing(readLocal()), meta.base)) wantPush = true;
      else wantPull = true;
      await pump();
      while (running) await running;
      return status === "synced" && meta ? { owner: meta.owner, rev: meta.rev } : null;
    },

    /**
     * The account's copy as a request of this device's own just saved it (a
     * Plan with AI change): folded in like a save from any other device, so
     * an edit made here while the request was out is merged, not lost.
     * False when the reply is not a plan.
     */
    adopt(body: unknown): boolean {
      const remote = readRemote(body);
      if (!remote || !started) return false;
      absorb(remote);
      if (wantPush) void pump();
      return true;
    },

    status: () => status,

    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    /** Test seam: resolves once no request is in flight. */
    async whenIdle() {
      while (running) await running;
    },
  };
}

// ── The browser's one engine ─────────────────────────────────────────────────

let engine: ReturnType<typeof createSync> | null | undefined;
let shown: SyncStatus = "idle";
const watchers = new Set<() => void>();

/**
 * Created on first use in the browser, never on the server. A browser that
 * refuses storage gets none: with nowhere to hold a copy, "saving" whatever it
 * read back would mean saving an empty plan over the student's real one.
 */
function browserEngine() {
  if (engine !== undefined) return engine;
  if (typeof window === "undefined") return null;
  try {
    const probe = "ucsdplans-probe";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
  } catch {
    return (engine = null);
  }

  const e = createSync({
    storage: window.localStorage,
    fetch: (url, init) => window.fetch(url, init),
    emit: (name) => window.dispatchEvent(new Event(name)),
    setTimeout: (fn, ms) => window.setTimeout(fn, ms),
    clearTimeout: (id) => window.clearTimeout(id as number),
    now: () => Date.now(),
  });
  e.subscribe(() => {
    shown = e.status();
    for (const w of watchers) w();
  });
  window.addEventListener("focus", e.refresh);
  window.addEventListener("online", e.refresh);
  window.addEventListener("pagehide", e.flush);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") e.flush();
    else e.refresh();
  });
  return (engine = e);
}

const subscribeStatus = (cb: () => void) => {
  watchers.add(cb);
  return () => {
    watchers.delete(cb);
  };
};

/**
 * Starts syncing (once per page) and reports how it is going. Every component
 * that shows part of the plan calls this, so whichever page a student opens
 * first on a new device fetches their plan.
 */
export function useAccountSync(): SyncStatus {
  useEffect(() => {
    browserEngine()?.start();
  }, []);
  return useSyncExternalStore(subscribeStatus, () => shown, () => "idle");
}

/** Call after writing any of the three documents, so the edit reaches the account. */
export function noteLocalChange(): void {
  browserEngine()?.noteLocalChange();
}

/** Saves now and waits for the account to agree; see the engine's `settle`. */
export function settleAccountPlan(): Promise<{ owner: string; rev: number } | null> {
  const e = browserEngine();
  if (!e) return Promise.resolve(null);
  e.start();
  return e.settle();
}

/** Folds a plan the server just saved for this device into the local copy; see the engine's `adopt`. */
export function adoptAccountPlan(body: unknown): boolean {
  return browserEngine()?.adopt(body) ?? false;
}

/** How the sync stands right now, for code outside React. */
export function accountSyncStatus(): SyncStatus {
  return browserEngine()?.status() ?? "idle";
}
