/**
 * Hosted AI availability gate.
 *
 * Milestone 1 shuts off anonymous paid generation. This is a temporary
 * shutdown, NOT authentication and NOT rate limiting — nothing here
 * identifies a caller or counts their usage.
 *
 * Before hosted chat may be reopened, all of the following must exist:
 *   1. Genuine server-side authentication (a session the server verifies
 *      itself — never a client-supplied id, email, header or flag).
 *   2. Eligibility enforcement (who is allowed to spend model budget).
 *   3. Durable usage limits (per-user and global, surviving restarts and
 *      shared across serverless instances — an in-memory counter is not one).
 *
 * Until those land, `/api/chat` answers 503 unconditionally. The generation
 * implementation stays intact in `chatHandler.ts` so it can be integrated and
 * tested later, but no route wires it to the public internet.
 */

/** Stable, student-safe payload for a disabled AI endpoint. */
export interface UnavailablePayload {
  error: string;
  code: string;
}

export const AI_CHAT_UNAVAILABLE: UnavailablePayload = {
  error: "The AI advisor is temporarily unavailable.",
  code: "AI_CHAT_UNAVAILABLE",
};

export const AI_AUDIT_UNAVAILABLE: UnavailablePayload = {
  error: "The AI advisor is temporarily unavailable.",
  code: "AI_AUDIT_UNAVAILABLE",
};

export const AI_PLAN_GENERATION_UNAVAILABLE: UnavailablePayload = {
  error: "The AI advisor is temporarily unavailable.",
  code: "AI_PLAN_GENERATION_UNAVAILABLE",
};

/**
 * Builds the 503 every disabled AI endpoint returns.
 *
 * `no-store` matters: a cached 200 from before the shutdown, or a cached 503
 * after it reopens, would both be wrong.
 */
export function unavailableResponse(payload: UnavailablePayload): Response {
  return new Response(JSON.stringify(payload), {
    status: 503,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

/**
 * Read-only availability probe for the UI. Server-controlled: the client can
 * only render what this reports, it can never grant itself generation.
 */
export function availabilityResponse(payload: UnavailablePayload): Response {
  return new Response(
    JSON.stringify({ available: false, message: payload.error, code: payload.code }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    },
  );
}
