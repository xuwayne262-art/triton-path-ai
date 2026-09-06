import {
  AI_PLAN_GENERATION_UNAVAILABLE,
  unavailableResponse,
} from "@/lib/ai/availability";

/**
 * `/api/generate-plan` — AI four-year plan generation, currently SHUT OFF.
 *
 * Same milestone-1 shutdown as `/api/chat`: an anonymous POST triggered a paid
 * Gemini generation with no authentication and no usage limit.
 *
 * Reopening this needs real server-side authentication, eligibility enforcement
 * and durable usage limits.
 */

export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  return unavailableResponse(AI_PLAN_GENERATION_UNAVAILABLE);
}
