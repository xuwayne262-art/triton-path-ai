/**
 * How many photos one student may upload an hour, counted where every
 * server instance sees the same number.
 *
 * Supabase (supabase/007_housing_photo_rate.sql) counts in one transaction;
 * a Upstash-dialect KV counts with INCR, which is atomic. Development without
 * either counts in this process. Production without either refuses uploads:
 * a per-instance count is no limit on serverless, and housing needs one of
 * the two stores to keep listings anyway.
 */

export const PHOTOS_PER_HOUR = 40;

export type PhotoRate = { ok: true } | { ok: false; retryAfter: number } | { ok: false; unavailable: true };

const env = (...names: string[]) => names.map((n) => process.env[n]?.trim()).find(Boolean) ?? "";

const memory = new Map<string, number>();

const hourBucket = (now: Date) => `hour:${now.toISOString().slice(0, 13)}`;
const untilNextHour = (now: Date) => Math.max(1, 3600 - (now.getUTCMinutes() * 60 + now.getUTCSeconds()));

/** Reserves one upload for `owner` (a keyed hash, never an address). */
export async function reservePhoto(owner: string, now = new Date(), fetcher: typeof fetch = fetch): Promise<PhotoRate> {
  const supabaseUrl = env("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY", "SUPABASE_SECRET_KEY");
  const kvUrl = env("KV_REST_API_URL", "UPSTASH_REDIS_REST_URL");
  const kvToken = env("KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_TOKEN");

  try {
    if (supabaseUrl && serviceKey) {
      const res = await fetcher(`${supabaseUrl.replace(/\/+$/, "")}/rest/v1/rpc/reserve_housing_photo`, {
        method: "POST",
        cache: "no-store",
        signal: AbortSignal.timeout(4000),
        headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, "content-type": "application/json" },
        body: JSON.stringify({ owner_key: owner, per_hour: PHOTOS_PER_HOUR }),
      });
      if (!res.ok) throw new Error(`reserve_housing_photo HTTP ${res.status}`);
      const reply = await res.json() as { ok?: unknown; retry_after?: unknown };
      if (reply.ok === true) return { ok: true };
      if (reply.ok === false) return { ok: false, retryAfter: typeof reply.retry_after === "number" ? reply.retry_after : untilNextHour(now) };
      throw new Error("reserve_housing_photo: invalid reply");
    }
    if (kvUrl && kvToken) {
      const key = `housing:photo-rate:${hourBucket(now)}:${owner}`;
      const res = await fetcher(`${kvUrl.replace(/\/+$/, "")}/pipeline`, {
        method: "POST",
        cache: "no-store",
        signal: AbortSignal.timeout(4000),
        headers: { authorization: `Bearer ${kvToken}`, "content-type": "application/json" },
        body: JSON.stringify([["INCR", key], ["EXPIRE", key, "7200"]]),
      });
      if (!res.ok) throw new Error(`KV HTTP ${res.status}`);
      const reply = await res.json() as { result?: unknown }[];
      const used = Number(reply?.[0]?.result);
      if (!Number.isFinite(used)) throw new Error("KV: invalid reply");
      return used > PHOTOS_PER_HOUR ? { ok: false, retryAfter: untilNextHour(now) } : { ok: true };
    }
  } catch (err) {
    console.error(`[housing] photo limit unavailable: ${err instanceof Error ? err.message : String(err)}`);
    return { ok: false, unavailable: true };
  }

  if (process.env.NODE_ENV === "production") {
    console.error("[housing] photo limit has no shared store: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY and run supabase/007_housing_photo_rate.sql");
    return { ok: false, unavailable: true };
  }
  const key = `${hourBucket(now)}:${owner}`;
  const used = (memory.get(key) ?? 0) + 1;
  memory.set(key, used);
  if (memory.size > 5_000) memory.delete(memory.keys().next().value!);
  return used > PHOTOS_PER_HOUR ? { ok: false, retryAfter: untilNextHour(now) } : { ok: true };
}
