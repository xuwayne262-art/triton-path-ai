import {
  AI_CHAT_UNAVAILABLE,
  availabilityResponse,
  unavailableResponse,
} from "@/lib/ai/availability";

/**
 * `/api/chat` — hosted AI advisor, currently SHUT OFF.
 *
 * Milestone 1 removes anonymous paid generation from the public internet. This
 * is a temporary shutdown; it is NOT authentication and NOT rate limiting.
 *
 * The POST handler deliberately takes no `Request` argument, so it is
 * structurally incapable of reading the body, touching `data/`, constructing a
 * provider client or starting generation. Nothing a caller can send — a field,
 * a header, a query parameter, a cookie — changes the outcome, and it answers
 * 503 whether or not `ANTHROPIC_API_KEY` is configured.
 *
 * The fixed generation implementation lives in `src/lib/ai/chatHandler.ts` and
 * is exercised by tests with a mocked provider. Do not wire it up here until
 * all of the following exist:
 *
 *   1. Genuine server-side authentication (a session the server verifies).
 *   2. Eligibility enforcement for who may spend model budget.
 *   3. Durable usage limits, shared across instances and surviving restarts.
 *
 * See `src/lib/ai/availability.ts`.
 */

export const dynamic = "force-dynamic";

/** Server-controlled availability, so the UI can render an honest state. */
export async function GET(): Promise<Response> {
  return availabilityResponse(AI_CHAT_UNAVAILABLE);
}

export async function POST(): Promise<Response> {
  return unavailableResponse(AI_CHAT_UNAVAILABLE);
}
