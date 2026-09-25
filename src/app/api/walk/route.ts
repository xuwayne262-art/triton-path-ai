import type { RoutedLeg } from "@/lib/campus";
import { CLASS_PLANNER_API, parseRouteRequest, scheduleRef, shapeRoutes } from "@/lib/walkRoutes";

/**
 * `/api/walk` — walking routes between a student's classes.
 *
 * GET ?term=FA26&ids=<TSS section ids, comma-separated>
 *   200 { legs }                               routed by UCSD's Class Planner
 *   400 { error }                              the term or ids are malformed
 *   502 { error, code: "ROUTES_UNAVAILABLE" }  Class Planner did not answer
 *
 * The browser cannot ask Class Planner itself — it sends no CORS headers — so
 * this does, and passes on nothing but the walks. The page never depends on
 * it: every leg also has a straight-line estimate, and a 502 only means the
 * map says "estimated" where it would have said "UCSD route".
 *
 * The proxy already refuses anonymous callers. What stays bounded here is the
 * load on UCSD: input is validated before any request is made, a schedule
 * already asked about is answered from memory, and a slow upstream is cut off
 * rather than left holding a serverless instance open.
 */

export const dynamic = "force-dynamic";

const TIMEOUT_MS = 8_000;
/** Walkways do not move mid-term; six hours only bounds a stale deploy. */
const TTL_MS = 6 * 60 * 60 * 1000;
const MAX_ENTRIES = 500;

const memo = new Map<string, { at: number; legs: RoutedLeg[] }>();

function remember(ref: string, legs: RoutedLeg[]) {
  memo.delete(ref);
  memo.set(ref, { at: Date.now(), legs });
  // A Map iterates in insertion order, so its first key is the stalest.
  while (memo.size > MAX_ENTRIES) {
    const oldest = memo.keys().next().value;
    if (oldest === undefined) break;
    memo.delete(oldest);
  }
}

/** The same schedule always routes the same way, so the browser may reuse it. */
const CACHEABLE = { "Cache-Control": "private, max-age=21600" } as const;
const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function GET(req: Request): Promise<Response> {
  const parsed = parseRouteRequest(new URL(req.url).searchParams);
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: 400, headers: NO_STORE });
  }

  const ref = scheduleRef(parsed.ids, parsed.term);
  const hit = memo.get(ref);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return Response.json({ legs: hit.legs }, { headers: CACHEABLE });
  }

  try {
    const res = await fetch(`${CLASS_PLANNER_API}/schedules/${ref}?context=planner`, {
      headers: {
        accept: "application/json",
        "user-agent": "UCSDPlans walking routes (student project)",
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return unavailable();
    const legs = shapeRoutes(await res.json());
    remember(ref, legs);
    return Response.json({ legs }, { headers: CACHEABLE });
  } catch {
    return unavailable();
  }
}

function unavailable(): Response {
  return Response.json(
    { error: "UCSD's walking routes are unavailable right now.", code: "ROUTES_UNAVAILABLE" },
    { status: 502, headers: NO_STORE },
  );
}
