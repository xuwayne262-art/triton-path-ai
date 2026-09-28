import { auth } from "@/auth";
import { isEligibleEmail, normalizeEmail } from "@/lib/auth/eligibility";
import { storeDiagnosis } from "@/lib/history/store";
import { cleanDocs, EMPTY_DOCS, MAX_PLAN_BYTES } from "@/lib/plan/record";
import { ownerTag, planKey, planStore, type StoredPlan } from "@/lib/plan/store";

/**
 * `/api/plan` — the signed-in student's plan, so it follows them to every
 * device they sign in on: the planner, their starred courses and their own
 * instructor ratings.
 *
 * GET  → { owner, rev, savedAt, docs }; rev 0 and empty docs when nothing is saved
 * PUT  { owner, baseRev, docs } → the same shape, as saved
 *
 * A PUT answers 409, with the account's current plan, when that plan has moved
 * on from `baseRev` — another device saved first — or when `owner` is not this
 * account's tag, meaning the copy came from a browser last used by someone
 * else. Either way nothing is written; the browser merges or swaps in what it
 * was sent back, and tries again (src/lib/plan/sync.ts).
 *
 * As with /api/history, the account is the server-verified session and nothing
 * in the request: a caller can only ever read or write their own plan.
 */

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: NO_STORE });

/** 503, with the missing variable named in the server log and nowhere else. */
function unavailable(): Response {
  console.error(`[plan] store unavailable: ${storeDiagnosis()}`);
  return json(
    { error: "Saving plans to your account is not set up on this deployment yet.", code: "PLAN_STORE_UNCONFIGURED" },
    503,
  );
}

/** Logs the driver's own message — never the plan — then answers 502. */
function failed(op: "read" | "save", err: unknown): Response {
  const detail = err instanceof Error ? err.message : String(err);
  console.error(`[plan] ${op} failed (store=${planStore()?.name ?? "none"}): ${detail}`);
  return json({ error: `Could not ${op} your plan.`, code: `PLAN_${op.toUpperCase()}_FAILED` }, 502);
}

/** The signed-in, eligible address, or null. */
async function owner(): Promise<string | null> {
  const session = await auth();
  const email = normalizeEmail(session?.user?.email);
  return email && isEligibleEmail(email) ? email : null;
}

const reply = (email: string, plan: StoredPlan | null, status = 200) =>
  json({
    owner: ownerTag(email),
    rev: plan?.rev ?? 0,
    savedAt: plan?.savedAt ?? null,
    docs: plan?.docs ?? EMPTY_DOCS,
  }, status);

export async function GET(): Promise<Response> {
  const email = await owner();
  if (!email) return json({ error: "Sign in to continue.", code: "AUTH_REQUIRED" }, 401);

  const store = planStore();
  if (!store) return unavailable();

  try {
    return reply(email, await store.get(planKey(email)));
  } catch (err) {
    return failed("read", err);
  }
}

export async function PUT(request: Request): Promise<Response> {
  const email = await owner();
  if (!email) return json({ error: "Sign in to continue.", code: "AUTH_REQUIRED" }, 401);

  const tooLarge = () => json({ error: "That plan is too large to save.", code: "PLAN_TOO_LARGE" }, 413);
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_PLAN_BYTES) return tooLarge();

  let body: { owner?: unknown; baseRev?: unknown; docs?: unknown };
  try {
    const text = await request.text();
    if (text.length > MAX_PLAN_BYTES) return tooLarge();
    body = JSON.parse(text);
  } catch {
    return json({ error: "Could not read that plan.", code: "PLAN_BAD_JSON" }, 400);
  }

  const baseRev = body?.baseRev;
  if (typeof baseRev !== "number" || !Number.isInteger(baseRev) || baseRev < 0 || typeof body.owner !== "string") {
    return json({ error: "Could not read that plan.", code: "PLAN_BAD_REQUEST" }, 400);
  }

  const store = planStore();
  if (!store) return unavailable();

  const key = planKey(email);
  try {
    if (body.owner !== ownerTag(email)) return reply(email, await store.get(key), 409);
    const result = await store.put(key, baseRev, cleanDocs(body.docs));
    return result.ok ? reply(email, result.plan) : reply(email, result.current, 409);
  } catch (err) {
    return failed("save", err);
  }
}
