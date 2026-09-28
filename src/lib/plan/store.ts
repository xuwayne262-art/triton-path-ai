import { createHash } from "node:crypto";
import { cleanDocs, type PlanDocs } from "./record";

/**
 * Where each student's plan is kept, so it follows them between devices.
 *
 * The same three drivers as Academic Histories (see history/store.ts), picked
 * the same way — Supabase, then KV, then a directory for `next dev` — and null
 * rather than a silent no-op when none is configured.
 *
 * What is new here is the revision. A plan is written from several devices,
 * and a tab left open on a laptop holds an old copy; if every save simply
 * replaced the record, that tab's next save would quietly undo whatever the
 * student had since done on their phone. So each record carries `rev`, every
 * write names the revision it was based on, and a write based on anything but
 * the current one is refused and answered with what is there now. The browser
 * merges its edits into that and tries again (see sync.ts). The check and the
 * write are one operation in every production driver, so two devices saving
 * at the same moment cannot both succeed against the same revision.
 */

export interface StoredPlan {
  /** 1 for the first save, +1 per save. 0 only ever means "nothing saved". */
  rev: number;
  savedAt: string;
  docs: PlanDocs;
}

export type PutResult =
  | { ok: true; plan: StoredPlan }
  /** Someone saved first. `current` is what is there now, or null if nothing is. */
  | { ok: false; current: StoredPlan | null };

export interface PlanStore {
  readonly name: string;
  get(key: string): Promise<StoredPlan | null>;
  /** Saves `docs` as revision baseRev + 1, only if the record is still at `baseRev`. */
  put(key: string, baseRev: number, docs: PlanDocs): Promise<PutResult>;
}

const env = (...names: string[]): string => {
  for (const n of names) {
    const v = process.env[n];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
};

const hash = (text: string) => createHash("sha256").update(text).digest("hex");

const normalised = (email: string, fn: string) => {
  const e = String(email || "").trim().toLowerCase();
  if (!e) throw new Error(`${fn}: no email`);
  return e;
};

/**
 * The storage key for one student's plan: a keyed hash, never the address, and
 * a different one from their Academic History's, so the two tables cannot be
 * joined on it.
 */
export function planKey(email: string, secret = env("AUTH_SECRET")): string {
  return "plan:" + hash(`${secret} plan ${normalised(email, "planKey")}`).slice(0, 40);
}

/**
 * Who a copy of a plan belongs to, as the browser sees it.
 *
 * A browser can be shared, and it keeps the last plan it held. This tag lets it
 * tell "my own copy, possibly with edits the account has not seen" from
 * "someone else's plan, still in this browser" — the second must never be
 * merged into the student now signed in. It is derived separately from the
 * storage key, so the browser never learns a database key.
 */
export function ownerTag(email: string, secret = env("AUTH_SECRET")): string {
  return hash(`${secret} plan-owner ${normalised(email, "ownerTag")}`).slice(0, 16);
}

/** A stored record is data from a database, so it is checked for shape before use. */
function toPlan(rev: unknown, savedAt: unknown, docs: unknown): StoredPlan | null {
  const n = typeof rev === "number" ? rev : Number(rev);
  if (!Number.isInteger(n) || n < 1) return null;
  return { rev: n, savedAt: typeof savedAt === "string" ? savedAt : "", docs: cleanDocs(docs) };
}

function safeJson(s: unknown): unknown {
  if (typeof s !== "string") return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

export const PLAN_TABLE = "student_plan";
const MIGRATION = "supabase/003_student_plan.sql";

/** The two failures a fresh deployment hits, as instructions rather than codes. */
export function hint(status: number, body: string): string {
  if (/PGRST205/.test(body) || /Could not find the table/i.test(body)) {
    return ` — saved plans are not set up in this database yet. Run ${MIGRATION} in the Supabase SQL editor.`;
  }
  if (status === 401 || status === 403 || /PGRST301|JWT|permission denied/i.test(body)) {
    return " — the key was rejected. This driver needs the SERVICE ROLE key (SUPABASE_SERVICE_ROLE_KEY"
      + " or SUPABASE_SECRET_KEY), never the anon key.";
  }
  return "";
}

/**
 * Postgres over PostgREST with the service role key, like the other stores.
 *
 * The revision check is in the request itself: the first save is an insert
 * that does nothing if a row already exists, and every later one is an update
 * filtered on `rev=eq.<base>`. Postgres re-checks that filter under the row
 * lock, so of two concurrent saves from the same revision exactly one changes
 * the row; the other gets back no rows, which is the conflict.
 */
function supabaseStore(url: string, key: string): PlanStore {
  const table = `${url.replace(/\/+$/, "")}/rest/v1/${PLAN_TABLE}`;
  const headers = { apikey: key, authorization: `Bearer ${key}` };
  const cols = "select=rev,record,updated_at";
  const where = (k: string) => `key=eq.${encodeURIComponent(k)}`;

  const send = async (input: string, init: RequestInit): Promise<Response> => {
    const res = await fetch(input, { ...init, cache: "no-store" });
    if (!res.ok) {
      // PostgREST describes the schema here, never the student's plan.
      const detail = await res.text().catch(() => "");
      throw new Error(`Supabase ${init.method ?? "GET"} ${res.status}: ${detail.slice(0, 300)}${hint(res.status, detail)}`);
    }
    return res;
  };
  const rowsOf = async (res: Response) =>
    (await res.json()) as Array<{ rev?: unknown; record?: unknown; updated_at?: unknown }>;

  const get = async (k: string): Promise<StoredPlan | null> => {
    const [row] = await rowsOf(await send(`${table}?${where(k)}&${cols}&limit=1`, { headers }));
    return row ? toPlan(row.rev, row.updated_at, row.record) : null;
  };

  return {
    name: "supabase",
    get,
    async put(k, baseRev, docs) {
      const row = { rev: baseRev + 1, record: docs, updated_at: new Date().toISOString() };
      const write = { ...headers, "content-type": "application/json", prefer: "return=representation" };
      const res = baseRev === 0
        ? await send(`${table}?${cols}`, {
            method: "POST",
            headers: { ...write, prefer: "resolution=ignore-duplicates,return=representation" },
            body: JSON.stringify([{ key: k, ...row }]),
          })
        : await send(`${table}?${where(k)}&rev=eq.${baseRev}&${cols}`, {
            method: "PATCH",
            headers: write,
            body: JSON.stringify(row),
          });
      const [saved] = await rowsOf(res);
      const plan = saved ? toPlan(saved.rev, saved.updated_at, saved.record) : null;
      return plan ? { ok: true, plan } : { ok: false, current: await get(k) };
    },
  };
}

/**
 * Compare-and-set in one step on the Redis side. The stored value is the JSON
 * of a StoredPlan; the script reads its `rev`, and only when that matches the
 * base does it write. Replies [1] on success, [0, current] on a conflict.
 */
export const KV_PUT_SCRIPT = `
local cur = redis.call('GET', KEYS[1])
local rev = 0
if cur then
  local ok, doc = pcall(cjson.decode, cur)
  if ok and type(doc) == 'table' and type(doc.rev) == 'number' then rev = doc.rev end
end
if rev ~= tonumber(ARGV[1]) then
  if cur then return {0, cur} end
  return {0}
end
redis.call('SET', KEYS[1], ARGV[2])
return {1}
`.trim();

/** Upstash / Vercel KV over REST. Commands are sent as a JSON array. */
function kvStore(url: string, token: string): PlanStore {
  const call = async (command: unknown[]): Promise<unknown> => {
    const res = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(command),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`KV ${command[0]}: HTTP ${res.status}`);
    const body = (await res.json()) as { result?: unknown; error?: string };
    if (body.error) throw new Error(`KV ${command[0]}: ${body.error}`);
    return body.result ?? null;
  };
  const parse = (raw: unknown): StoredPlan | null => {
    const v = safeJson(raw) as { rev?: unknown; savedAt?: unknown; docs?: unknown } | null;
    return v ? toPlan(v.rev, v.savedAt, v.docs) : null;
  };

  return {
    name: "kv",
    async get(k) {
      return parse(await call(["GET", k]));
    },
    async put(k, baseRev, docs) {
      const plan: StoredPlan = { rev: baseRev + 1, savedAt: new Date().toISOString(), docs };
      const reply = await call(["EVAL", KV_PUT_SCRIPT, 1, k, String(baseRev), JSON.stringify(plan)]);
      const [ok, cur] = Array.isArray(reply) ? reply : [];
      return ok === 1 ? { ok: true, plan } : { ok: false, current: parse(cur) };
    },
  };
}

/**
 * A file per student under .history-store/plan/, for `next dev` only — a
 * serverless filesystem is per-instance and wiped on deploy, so production
 * refuses it. No colon in the name: on Windows, "plan:abc.json" is not a file
 * but an alternate data stream of a file called "plan".
 */
function fileStore(): PlanStore {
  const dir = ".history-store/plan";
  const fsp = () => import("node:fs/promises");
  const pathFor = (k: string) => `${dir}/${k.replace(/[^a-z0-9]/gi, "_")}.json`;

  const get = async (k: string): Promise<StoredPlan | null> => {
    try {
      const v = JSON.parse(await (await fsp()).readFile(pathFor(k), "utf8")) as Partial<StoredPlan>;
      return toPlan(v.rev, v.savedAt, v.docs);
    } catch {
      return null;
    }
  };

  return {
    name: "file",
    get,
    async put(k, baseRev, docs) {
      const current = await get(k);
      if ((current?.rev ?? 0) !== baseRev) return { ok: false, current };
      const plan: StoredPlan = { rev: baseRev + 1, savedAt: new Date().toISOString(), docs };
      const f = await fsp();
      await f.mkdir(dir, { recursive: true });
      await f.writeFile(pathFor(k), JSON.stringify(plan), "utf8");
      return { ok: true, plan };
    },
  };
}

let cached: PlanStore | null | undefined;

/** The configured store, or null when there is none — never a silent no-op. */
export function planStore(): PlanStore | null {
  if (cached !== undefined) return cached;
  const supabaseUrl = env("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY", "SUPABASE_SECRET_KEY");
  const kvUrl = env("KV_REST_API_URL", "UPSTASH_REDIS_REST_URL");
  const kvToken = env("KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_TOKEN");

  if (supabaseUrl && serviceKey) cached = supabaseStore(supabaseUrl, serviceKey);
  else if (kvUrl && kvToken) cached = kvStore(kvUrl, kvToken);
  else if (process.env.NODE_ENV !== "production") cached = fileStore();
  else cached = null;
  return cached;
}

/** Test seam: forget the cached driver so env changes take effect. */
export function resetPlanStore(): void {
  cached = undefined;
}
