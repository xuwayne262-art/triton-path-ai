import { takeSnapshot } from "@/lib/seats/snapshot";
import { seatStore } from "@/lib/seats/store";
import { todayInSanDiego } from "@/lib/housing/terms";

/**
 * `/api/cron/seats` — takes Class Planner's seat counts for every course and
 * keeps them under the day it counted them, so course pages can draw how
 * each one filled.
 *
 * Called once a day by Vercel Cron (vercel.json), which sends
 * `Authorization: Bearer $CRON_SECRET`. The route sits outside the sign-in
 * gate because the scheduler has no session; the secret is the gate instead.
 * In production it refuses to run without one. Locally, with no secret set,
 * it runs so the chart can be tried out.
 */

export const dynamic = "force-dynamic";
// Roughly 250 requests to Class Planner; well under a minute.
export const maxDuration = 60;

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) {
    if (request.headers.get("authorization") !== `Bearer ${secret}`) {
      return json({ error: "Not allowed." }, 401);
    }
  } else if (process.env.NODE_ENV === "production") {
    return json({ error: "CRON_SECRET is not set on this deployment." }, 503);
  }

  const store = seatStore();
  if (!store) {
    console.error("[seats] no store: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
    return json({ error: "Seat history is not set up on this deployment." }, 503);
  }

  try {
    const snap = await takeSnapshot();
    // Filed under the San Diego day Class Planner counted the seats, so
    // counts it has not retaken overwrite that day instead of posing as new.
    const day = todayInSanDiego(snap.counted ? new Date(snap.counted) : new Date());
    const written = await store.record(snap.term, day, snap.rows);
    return json({ term: snap.term, day, counted: snap.counted, refreshed: snap.refreshed, courses: written, store: store.name });
  } catch (err) {
    console.error(`[seats] snapshot failed (store=${store.name}): ${err instanceof Error ? err.message : String(err)}`);
    return json({ error: "Could not take today's seat counts." }, 502);
  }
}
