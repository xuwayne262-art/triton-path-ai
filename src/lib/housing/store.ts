import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { StoredListing } from "./listing";

/**
 * Where listings and their photos are kept.
 *
 * The same three drivers as Academic Histories (see history/store.ts), picked
 * the same way — Supabase, then KV, then a directory for `next dev` — and for
 * the same reason null rather than a silent no-op when none is configured: a
 * student who posts a sublet and sees it vanish is worse off than one told it
 * did not save.
 *
 * Unlike a history, a listing is written to be read by other students, so the
 * record holds the contact details its poster chose to publish. It does not
 * hold who posted it in the clear: the owner is a keyed hash of their address,
 * which is enough to let them edit it and nobody to enumerate it.
 */

const env = (...names: string[]): string => {
  for (const n of names) {
    const v = process.env[n];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
};

/** One student's listings are filed under this, never under their address. */
export function ownerKey(email: string, secret = env("AUTH_SECRET")): string {
  const normalised = String(email || "").trim().toLowerCase();
  if (!normalised) throw new Error("ownerKey: no email");
  return "own:" + createHash("sha256").update(`${secret} housing ${normalised}`).digest("hex").slice(0, 40);
}

/** A short, unguessable listing id for URLs: /housing/Xk3v9QpL2a */
export const newListingId = () => randomBytes(8).toString("base64url");

// ── Photo refs ───────────────────────────────────────────────────────────────

/**
 * A photo's name carries proof of who uploaded it: sixteen random characters
 * and an HMAC of them keyed to the uploader. Attaching a photo to a listing,
 * or deleting one, only works for refs that verify against the caller — so
 * nobody can put their name to, or take down, someone else's picture — and it
 * needs no table recording who owns what.
 */
function photoSig(owner: string, nonce: string, secret: string): string {
  return createHmac("sha256", secret).update(`photo ${owner} ${nonce}`).digest("base64url").slice(0, 16);
}

export function newPhotoRef(owner: string, secret = env("AUTH_SECRET")): string {
  const nonce = randomBytes(12).toString("base64url");
  return nonce + photoSig(owner, nonce, secret);
}

export function photoBelongsTo(ref: string, owner: string, secret = env("AUTH_SECRET")): boolean {
  if (!/^[A-Za-z0-9_-]{32}$/.test(ref)) return false;
  const want = Buffer.from(photoSig(owner, ref.slice(0, 16), secret));
  const got = Buffer.from(ref.slice(16));
  return want.length === got.length && timingSafeEqual(want, got);
}

// ── Drivers ──────────────────────────────────────────────────────────────────

export interface HousingStore {
  readonly name: string;
  all(): Promise<StoredListing[]>;
  get(id: string): Promise<StoredListing | null>;
  put(listing: StoredListing): Promise<void>;
  del(id: string): Promise<void>;
  putPhoto(ref: string, jpeg: Uint8Array): Promise<void>;
  getPhoto(ref: string): Promise<Uint8Array | null>;
  delPhoto(ref: string): Promise<void>;
}

/** A stored record is data from a database, so it is checked for shape before use. */
function parseListing(v: unknown): StoredListing | null {
  const l = (typeof v === "string" ? safeJson(v) : v) as Partial<StoredListing> | null;
  if (!l || typeof l !== "object" || typeof l.id !== "string" || typeof l.owner !== "string") return null;
  if (!Array.isArray(l.ll) || typeof l.from !== "string" || typeof l.to !== "string") return null;
  return {
    ...l,
    photos: Array.isArray(l.photos) ? l.photos : [],
    photoLabels: Array.isArray(l.photoLabels) ? l.photoLabels : [],
    reports: Array.isArray(l.reports) ? l.reports : [],
    // Listings saved before interest was counted have nobody interested yet.
    interested: Array.isArray(l.interested) ? l.interested.filter((k) => typeof k === "string") : [],
  } as StoredListing;
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

const MIGRATION = "supabase/002_housing.sql";

/** The two failures a fresh deployment hits, as instructions rather than codes. */
export function hint(status: number, body: string): string {
  if (/PGRST205/.test(body) || /Could not find the table/i.test(body) || /Bucket not found/i.test(body)) {
    return `. Housing is not set up in this database yet. Run ${MIGRATION} in the Supabase SQL editor.`;
  }
  if (status === 401 || status === 403 || /PGRST301|JWT|permission denied/i.test(body)) {
    return ". The key was rejected. This driver needs the SERVICE ROLE key (SUPABASE_SERVICE_ROLE_KEY"
      + " or SUPABASE_SECRET_KEY), never the anon key.";
  }
  return "";
}

export const LISTING_TABLE = "housing_listing";
export const PHOTO_BUCKET = "housing-photos";

/**
 * Listings in a Postgres table and photos in a private Storage bucket, both
 * over plain REST with the service role key — the migration turns row-level
 * security on with no policy, so nothing holding the public anon key can read
 * either one. Photos reach students through /api/housing/photos, behind the
 * same sign-in as every other page.
 */
function supabaseStore(url: string, key: string): HousingStore {
  const base = url.replace(/\/+$/, "");
  const table = `${base}/rest/v1/${LISTING_TABLE}`;
  const headers = { apikey: key, authorization: `Bearer ${key}` };
  const json = { ...headers, "content-type": "application/json" };

  const send = async (input: string, init: RequestInit, okStatuses: number[] = []): Promise<Response> => {
    const res = await fetch(input, { ...init, cache: "no-store" });
    if (!res.ok && !okStatuses.includes(res.status)) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Supabase ${init.method ?? "GET"} ${res.status}: ${detail.slice(0, 300)}${hint(res.status, detail)}`);
    }
    return res;
  };
  const photoPath = (ref: string) => `${base}/storage/v1/object/${PHOTO_BUCKET}/${ref}.jpg`;

  return {
    name: "supabase",
    async all() {
      const res = await send(`${table}?select=record&order=updated_at.desc&limit=2000`, { headers });
      const rows = (await res.json()) as Array<{ record?: unknown }>;
      return rows.map((r) => parseListing(r.record)).filter((l): l is StoredListing => l !== null);
    },
    async get(id) {
      const res = await send(`${table}?id=eq.${encodeURIComponent(id)}&select=record&limit=1`, { headers });
      const rows = (await res.json()) as Array<{ record?: unknown }>;
      return parseListing(rows?.[0]?.record);
    },
    async put(listing) {
      await send(table, {
        method: "POST",
        headers: { ...json, prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify([{ id: listing.id, owner: listing.owner, record: listing, updated_at: new Date().toISOString() }]),
      });
    },
    async del(id) {
      await send(`${table}?id=eq.${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { ...headers, prefer: "return=minimal" },
      });
    },
    async putPhoto(ref, jpeg) {
      await send(photoPath(ref), {
        method: "POST",
        headers: { ...headers, "content-type": "image/jpeg", "x-upsert": "false" },
        body: jpeg as unknown as BodyInit,
      });
    },
    async getPhoto(ref) {
      const res = await send(
        `${base}/storage/v1/object/authenticated/${PHOTO_BUCKET}/${ref}.jpg`,
        { headers },
        [400, 404],
      );
      if (!res.ok) return null;
      return new Uint8Array(await res.arrayBuffer());
    },
    async delPhoto(ref) {
      await send(photoPath(ref), { method: "DELETE", headers }, [400, 404]);
    },
  };
}

/** Upstash / Vercel KV over REST: listings in one hash, each photo its own key. */
function kvStore(url: string, token: string): HousingStore {
  const HASH = "housing:listings";
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

  return {
    name: "kv",
    async all() {
      const flat = (await call(["HGETALL", HASH])) as string[] | null;
      const out: StoredListing[] = [];
      for (let i = 1; i < (flat?.length ?? 0); i += 2) {
        const l = parseListing(flat![i]);
        if (l) out.push(l);
      }
      return out;
    },
    async get(id) {
      return parseListing(await call(["HGET", HASH, id]));
    },
    async put(listing) {
      await call(["HSET", HASH, listing.id, JSON.stringify(listing)]);
    },
    async del(id) {
      await call(["HDEL", HASH, id]);
    },
    async putPhoto(ref, jpeg) {
      await call(["SET", `housing:photo:${ref}`, Buffer.from(jpeg).toString("base64")]);
    },
    async getPhoto(ref) {
      const v = await call(["GET", `housing:photo:${ref}`]);
      return typeof v === "string" ? new Uint8Array(Buffer.from(v, "base64")) : null;
    },
    async delPhoto(ref) {
      await call(["DEL", `housing:photo:${ref}`]);
    },
  };
}

/**
 * Files under .history-store/housing/, for `next dev` only — a serverless
 * filesystem is per-instance and wiped on deploy, so production refuses it.
 */
function fileStore(): HousingStore {
  const dir = ".history-store/housing";
  const listings = `${dir}/listings.json`;
  const fsp = () => import("node:fs/promises");

  const readAll = async (): Promise<Record<string, unknown>> => {
    try {
      return JSON.parse(await (await fsp()).readFile(listings, "utf8")) as Record<string, unknown>;
    } catch {
      return {};
    }
  };
  const writeAll = async (all: Record<string, unknown>) => {
    const f = await fsp();
    await f.mkdir(dir, { recursive: true });
    await f.writeFile(listings, JSON.stringify(all, null, 1), "utf8");
  };
  const photoFile = (ref: string) => `${dir}/photos/${ref.replace(/[^A-Za-z0-9_-]/g, "_")}.jpg`;

  return {
    name: "file",
    async all() {
      return Object.values(await readAll()).map(parseListing).filter((l): l is StoredListing => l !== null);
    },
    async get(id) {
      return parseListing((await readAll())[id]);
    },
    async put(listing) {
      const all = await readAll();
      all[listing.id] = listing;
      await writeAll(all);
    },
    async del(id) {
      const all = await readAll();
      delete all[id];
      await writeAll(all);
    },
    async putPhoto(ref, jpeg) {
      const f = await fsp();
      await f.mkdir(`${dir}/photos`, { recursive: true });
      await f.writeFile(photoFile(ref), jpeg);
    },
    async getPhoto(ref) {
      try {
        return new Uint8Array(await (await fsp()).readFile(photoFile(ref)));
      } catch {
        return null;
      }
    },
    async delPhoto(ref) {
      try {
        await (await fsp()).unlink(photoFile(ref));
      } catch {
        /* already gone */
      }
    },
  };
}

let cached: HousingStore | null | undefined;

/** The configured store, or null when there is none — never a silent no-op. */
export function housingStore(): HousingStore | null {
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
export function resetHousingStore(): void {
  cached = undefined;
}
