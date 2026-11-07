"use client";

import PlanWithAI from "@/components/planAi/PlanWithAI";
import TermGate from "@/components/planner/TermGate";
import { usePlanner } from "../PlannerProvider";

/**
 * The Planner's third view. It shares the planner provider with This term
 * and the 4-year plan, so all three show one plan. Like This term, it waits
 * for the quarter asked for rather than show the one still in memory under
 * its name; the conversation stays mounted underneath, so a switch keeps it.
 */
export default function PlanWithAIPage() {
  const { termStatus, requestedTerm, term, retryTerm } = usePlanner();
  const gated = termStatus !== "ready";
  return (
    <>
      {gated && <TermGate status={termStatus} asked={requestedTerm} loaded={term} onRetry={retryTerm} />}
      <div className={gated ? "hidden" : "contents"}>
        <PlanWithAI />
      </div>
    </>
  );
}
