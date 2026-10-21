import type { CourseCard, PlanTarget, Preference, Proposal, Relaxation, RequirementRef, SourceRef } from "@/lib/planAi/types";
import type { Settings } from "@/lib/planAi/conversation";
import type { MoveConsequences } from "@/lib/planAi/consequences";
import type { PatchProblem } from "@/lib/plan/patch";
import type { PlanOp } from "@/lib/plan/change";

/** Something a button in the conversation does. Clicking one never needs the model. */
export type Action =
  | { kind: "start"; flow: "build" | "improve" | "find" }
  | { kind: "run"; flow: "build" | "improve" | "find" }
  | { kind: "goal"; ref: RequirementRef | null }
  | { kind: "pref"; pref: Preference }
  | { kind: "relax"; relaxation: Relaxation }
  | { kind: "later-start" }
  | { kind: "units"; min: number | null; max: number | null }
  | { kind: "add-card"; messageId: string; code: string }
  | { kind: "apply"; proposalId: string }
  | { kind: "ops"; ops: PlanOp[]; target: PlanTarget; label: string }
  | { kind: "undo"; changeId: string }
  | { kind: "keep"; code: string }
  | { kind: "confirm"; yes: boolean }
  | { kind: "settings" }
  | { kind: "set"; patch: Partial<Settings>; flow: "build" | "improve" | "find" | null }
  | { kind: "more" }
  | { kind: "say"; text: string };

export interface Choice {
  label: string;
  action: Action;
  /** The primary choice in its group. */
  primary?: boolean;
}

export interface AssistantMessage {
  id: string;
  role: "assistant";
  text: string;
  tone?: "info" | "error" | "success";
  /** Short supporting lines under the text: what was understood, what was not checked. */
  notes?: string[];
  cards?: { items: CourseCard[]; target: PlanTarget; base: string };
  options?: { ids: string[] };
  question?: { text: string; choices: Choice[]; more?: Choice[]; note?: string };
  receipt?: { changeId: string; label: string; undone?: boolean; kind: "apply" | "undo"; where: "term" | "plan" };
  conflict?: { problems: PatchProblem[] };
  move?: MoveConsequences;
  followUps?: Choice[];
  sources?: SourceRef[];
}

export type ChatMessage = { id: string; role: "user"; text: string } | AssistantMessage;

export type { Proposal };
