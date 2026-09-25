import { auth } from "@/auth";
import { isEligibleEmail, normalizeEmail } from "@/lib/auth/eligibility";
import { MAX_BODY_BYTES, sanitizeHistory } from "@/lib/history/record";
import { historyStore, STORE_UNAVAILABLE, storageKey, storeDiagnosis } from "@/lib/history/store";

/**
 * `/api/history` — one student's imported Academic History.
 *
 * GET    their saved record, or 204 when they have none
 * PUT    replace it with a parsed record from the import page
 * DELETE remove it entirely
 *
 * The owner is taken from the server-verified session and nothing else. There
 * is no id, email or key in the request: a caller cannot name a record, only
 * their own. The proxy already refuses anonymous requests, but eligibility is
 * re-checked here too so this route is safe on its own terms rather than only
 * because something upstream is doing its job.
 *
 * Unlike the AI routes, this one is cheap, bounded and self-limiting: a student
 * can hold exactly one record, capped at MAX_BODY_BYTES, so there is nothing
 * here for an authenticated caller to run up a bill with.
 */

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: NO_STORE });

/**
 * 503, plus the reason in the server log.
 *
 * The student is told their record did not save; the *why* — which variable is
 * missing — goes to the log, where the person who can fix it will see it, and
 * nowhere a caller can read it.
 */
function unavailable(): Response {
  console.error(`[history] store unavailable: ${storeDiagnosis()}`);
  return json(STORE_UNAVAILABLE, 503);
}

/**
 * Logs why a store operation failed, then answers 502.
 *
 * These catch blocks used to swallow the error entirely, which hid the single
 * most likely failure on a fresh deployment: the database is linked and the
 * credentials are right, but the table does not exist yet because the migration
 * has not been run. PostgREST says exactly that (`PGRST205`, "Could not find
 * the table public.academic_history"), and throwing it away left a bare 502
 * with nothing anywhere to explain it.
 *
 * Only the driver's own message is logged. The student's record is never in it
 * — and must never be, because logs are far more widely readable than the
 * database this exists to protect.
 */
function failed(op: "read" | "write" | "delete", err: unknown): Response {
  const detail = err instanceof Error ? err.message : String(err);
  console.error(`[history] ${op} failed (store=${historyStore()?.name ?? "none"}): ${detail}`);
  const code = `HISTORY_${op.toUpperCase()}_FAILED`;
  return json({ error: `Could not ${op} your record.`, code }, 502);
}

/** The signed-in, eligible address, or null. */
async function owner(): Promise<string | null> {
  const session = await auth();
  const email = normalizeEmail(session?.user?.email);
  return email && isEligibleEmail(email) ? email : null;
}

export async function GET(): Promise<Response> {
  const email = await owner();
  if (!email) return json({ error: "Sign in to continue.", code: "AUTH_REQUIRED" }, 401);

  const store = historyStore();
  if (!store) return unavailable();

  try {
    const raw = await store.get(storageKey(email));
    if (!raw) return new Response(null, { status: 204, headers: NO_STORE });
    return new Response(raw, {
      status: 200,
      headers: { ...NO_STORE, "content-type": "application/json" },
    });
  } catch (err) {
    // The stored text is never echoed in an error: it is the student's record.
    return failed("read", err);
  }
}

export async function PUT(request: Request): Promise<Response> {
  const email = await owner();
  if (!email) return json({ error: "Sign in to continue.", code: "AUTH_REQUIRED" }, 401);

  // Length is checked before the body is read, so an oversized upload is
  // refused rather than buffered.
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return json({ error: "That record is too large.", code: "HISTORY_TOO_LARGE" }, 413);
  }

  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) {
      return json({ error: "That record is too large.", code: "HISTORY_TOO_LARGE" }, 413);
    }
    body = JSON.parse(text);
  } catch {
    return json({ error: "Could not read that record.", code: "HISTORY_BAD_JSON" }, 400);
  }

  const record = sanitizeHistory(body);
  if (!record) {
    return json(
      { error: "That did not contain any coursework.", code: "HISTORY_EMPTY" },
      422,
    );
  }

  const store = historyStore();
  if (!store) return unavailable();

  try {
    await store.set(storageKey(email), JSON.stringify(record));
  } catch (err) {
    return failed("write", err);
  }

  // The sanitised record goes back, so the page shows what was actually kept
  // rather than what it sent.
  return json(record, 200);
}

export async function DELETE(): Promise<Response> {
  const email = await owner();
  if (!email) return json({ error: "Sign in to continue.", code: "AUTH_REQUIRED" }, 401);

  const store = historyStore();
  if (!store) return unavailable();

  try {
    await store.del(storageKey(email));
  } catch (err) {
    return failed("delete", err);
  }
  return new Response(null, { status: 204, headers: NO_STORE });
}
