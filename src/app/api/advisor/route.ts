import { AI_AUDIT_UNAVAILABLE, unavailableResponse } from "@/lib/ai/availability";

/**
 * `/api/advisor` — degree-audit PDF analysis, currently SHUT OFF.
 *
 * Same milestone-1 shutdown as `/api/chat`, and for the same reason: this
 * endpoint accepted an unbounded base64 PDF from anonymous callers and sent it
 * straight to a paid Gemini model, with no authentication and no usage limit.
 *
 * Taking no `Request` argument makes reading the upload structurally impossible.
 * Reopening this needs real server-side authentication, eligibility enforcement
 * and durable usage limits — plus its own upload size and content validation,
 * which this milestone does not attempt.
 */

export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  return unavailableResponse(AI_AUDIT_UNAVAILABLE);
}
