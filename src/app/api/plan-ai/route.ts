import { planAiDiagnosis, planAiEnabled } from "@/lib/planAi/server/quota";

export const dynamic = "force-dynamic";

let logged = false;

/**
 * GET /api/plan-ai: whether typed requests can be read by the model on this
 * deployment. Plan with AI works either way — buttons, the guided flows and
 * the commands it reads itself never need the model — so this only decides
 * whether free-form typing is offered. Behind the sign-in gate like the rest
 * of the planner; it spends nothing.
 */
export function GET(): Response {
  const model = planAiEnabled();
  if (!model && !logged) {
    logged = true;
    console.info(`[plan-ai] model off: ${planAiDiagnosis()}`);
  }
  return Response.json({ model }, { headers: { "Cache-Control": "no-store" } });
}
