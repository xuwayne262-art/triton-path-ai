import { isEligibleEmail, normalizeEmail } from "@/lib/auth/eligibility";
import { readJsonBody } from "./httpBody";
import { discoveryRequestSchema, discoverySchema } from "./discoverySchema";
import { validDiscoveryScope } from "@/lib/discovery";
import type { GEFile, PlatIndex } from "@/lib/plat";

export interface DiscoveryDependencies {
  email: () => Promise<string | null | undefined>;
  configured: () => boolean;
  reserve: (email: string) => Promise<boolean>;
  data: () => Promise<{ index: PlatIndex; ge: GEFile }>;
  interpret: (query: string, index: PlatIndex, ge: GEFile, signal: AbortSignal) => Promise<unknown>;
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });

/** The injectable boundary keeps budget and identity gates testable without paid calls. */
export async function handleDiscovery(request: Request, deps: DiscoveryDependencies): Promise<Response> {
  const email = normalizeEmail(await deps.email());
  if (!email || !isEligibleEmail(email)) return json({ error: "Sign in with your @ucsd.edu account to use AI search.", code: "AUTH_REQUIRED" }, 401);
  // A same-origin JSON POST is required; browser cross-site form submissions cannot spend budget.
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return json({ error: "Please search from UCSDPlans.", code: "INVALID_ORIGIN" }, 403);
  if (!deps.configured()) return json({ error: "AI search is not available yet. You can still use the filters below.", code: "SEARCH_UNAVAILABLE" }, 503);
  const body = await readJsonBody(request);
  if (!body.ok) return json({ error: body.error, code: body.code }, body.status);
  const parsed = discoveryRequestSchema.safeParse(body.value);
  if (!parsed.success) return json({ error: "Describe the courses you want in 3–600 characters.", code: "INVALID_QUERY" }, 400);
  let data: { index: PlatIndex; ge: GEFile };
  try {
    data = await deps.data();
    if (!await deps.reserve(email)) {
      const now = new Date();
      const reset = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
      return json({ error: "The daily AI search limit has been reached. Try again after midnight UTC, or use the filters below.", code: "SEARCH_LIMIT" }, 429,
        { "Retry-After": String(Math.max(1, Math.ceil((reset - now.getTime()) / 1000))) });
    }
  } catch {
    return json({ error: "AI search is temporarily unavailable. You can still use the filters below.", code: "SEARCH_UNAVAILABLE" }, 503);
  }
  try {
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(15000)]);
    const result = discoverySchema.parse(await deps.interpret(parsed.data.query, data.index, data.ge, signal));
    if (!validDiscoveryScope(result, data.index, data.ge)) throw new Error("Unknown search scope");
    return json({ intent: result });
  } catch (error) {
    // Gemini's free tier allows only a few requests a minute for the whole site.
    if ((error as { statusCode?: unknown } | null)?.statusCode === 429) {
      return json({ error: "AI search is busy right now. Try again in a minute, or use the filters below.", code: "SEARCH_BUSY" }, 503, { "Retry-After": "60" });
    }
    return json({ error: "We couldn’t interpret that search. Try a shorter request or adjust the filters below.", code: "SEARCH_FAILED" }, 502);
  }
}
