import { auth } from "@/auth";
import { isEligibleEmail, normalizeEmail } from "@/lib/auth/eligibility";
import { ownerKey } from "./store";

/**
 * Who is asking, as the housing routes need it: the verified address (for the
 * contact line they may choose to publish), the Google name (for "Alex Y."),
 * and the hashed key their listings are filed under.
 *
 * The proxy has already refused anyone without a session; eligibility is
 * checked again here so each route is safe on its own terms.
 */
export interface Viewer {
  email: string;
  name: string | null;
  key: string;
}

export async function viewer(): Promise<Viewer | null> {
  const session = await auth();
  const email = normalizeEmail(session?.user?.email);
  if (!email || !isEligibleEmail(email)) return null;
  return { email, name: session?.user?.name ?? null, key: ownerKey(email) };
}

export const NO_STORE = { "Cache-Control": "no-store" } as const;

export const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: NO_STORE });

export const signInFirst = () => json({ error: "Sign in to continue.", code: "AUTH_REQUIRED" }, 401);

/** 503 with the reason in the server log, never in the response. */
export function unavailable(): Response {
  console.error(
    "[housing] no store configured: set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (or KV_REST_API_URL + KV_REST_API_TOKEN).",
  );
  return json(
    // Loading and saving both land here, so it says neither "saved" nor "loaded".
    { error: "Housing is not set up on this deployment yet.", code: "HOUSING_STORE_UNCONFIGURED" },
    503,
  );
}

/** Logs the driver's message — which never contains a listing — and answers 502. */
export function failed(op: string, err: unknown): Response {
  console.error(`[housing] ${op} failed: ${err instanceof Error ? err.message : String(err)}`);
  return json({ error: `Could not ${op}. Try again in a moment.`, code: "HOUSING_STORE_FAILED" }, 502);
}

/**
 * The body of a JSON write, refused before it is read when it declares itself
 * too large, and again after when it lied.
 */
export async function readJson(request: Request, maxBytes: number): Promise<{ ok: true; body: unknown } | { ok: false; res: Response }> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maxBytes) {
    return { ok: false, res: json({ error: "That is too large.", code: "HOUSING_TOO_LARGE" }, 413) };
  }
  try {
    const text = await request.text();
    if (text.length > maxBytes) {
      return { ok: false, res: json({ error: "That is too large.", code: "HOUSING_TOO_LARGE" }, 413) };
    }
    return { ok: true, body: JSON.parse(text) };
  } catch {
    return { ok: false, res: json({ error: "Could not read that.", code: "HOUSING_BAD_JSON" }, 400) };
  }
}
