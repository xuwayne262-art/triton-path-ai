import { createHmac } from "node:crypto";

function configuration() {
  return {
    url: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SECRET_KEY,
    secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
  };
}

export function discoveryConfigured(): boolean {
  const { url, key, secret } = configuration();
  return process.env.AI_COURSE_SEARCH_ENABLED === "true" && Boolean(url && key && secret && geminiKey());
}

/** A Gemini API key from Google AI Studio. GOOGLE_GENERATIVE_AI_API_KEY is the AI SDK's name for it. */
export function geminiKey(): string | undefined {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
}

/**
 * Gemini 3.5 Flash-Lite: free on the Gemini API's free tier, and in October
 * 2026 it matched Gemini 3.1 Flash-Lite on every search case while answering
 * faster (about 1 s). AI_COURSE_SEARCH_MODEL can name another Gemini model.
 */
export function courseSearchModel(): string {
  return process.env.AI_COURSE_SEARCH_MODEL?.trim() || "gemini-3.5-flash-lite";
}

/** Atomic, durable reservation BEFORE any model call. No in-memory fallback. */
export async function reserveDiscovery(email: string): Promise<boolean> {
  const { url, key, secret } = configuration();
  if (!url || !key || !secret) throw new Error("Discovery quota is unconfigured");
  const owner = createHmac("sha256", secret).update(`course-search:${email.trim().toLowerCase()}`).digest("hex");
  const response = await fetch(`${url.replace(/\/+$/, "")}/rest/v1/rpc/reserve_course_search`, {
    method: "POST", cache: "no-store", signal: AbortSignal.timeout(4000),
    headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ owner_key: owner }),
  });
  if (!response.ok) throw new Error("Discovery quota unavailable");
  const allowed: unknown = await response.json();
  if (typeof allowed !== "boolean") throw new Error("Invalid discovery quota response");
  return allowed;
}
