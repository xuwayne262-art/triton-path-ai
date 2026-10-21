import { z } from "zod";
import { isEligibleEmail, normalizeEmail } from "@/lib/auth/eligibility";
import { readJsonBody } from "@/lib/ai/httpBody";
import { cleanDocs, EMPTY_DOCS, TERM_CODE, type PlannerDoc } from "@/lib/plan/record";
import { CHANGE_ID, MAX_LOG, cleanOps, type PlanChange, type PlanOp } from "@/lib/plan/change";
import { applyPlanPatch, blankPlanner, describeOps, validatePlanPatch, type PatchData, type PatchProblem } from "@/lib/plan/patch";
import type { PlanStore, StoredPlan } from "@/lib/plan/store";
import type { CourseRow, SectionTuple } from "@/lib/plat";
import type { PlanAiEvent } from "./quota";

/**
 * POST /api/plan-ai/apply: a Plan with AI change, saved to the account's
 * plan — the same record /api/plan keeps and every planner tab reads.
 *
 * In order, for every request:
 *  1. the account is the server's own session, never anything sent;
 *  2. the request comes from this site, as JSON;
 *  3. the browser's copy belongs to this account (its owner tag);
 *  4. a change id already in the plan's log is a retry or a double click:
 *     it is answered with the plan as it is, and applied no second time;
 *  5. the plan is still at the revision the browser last saw — otherwise
 *     409 with the current plan, so a stale suggestion never lands on
 *     newer edits;
 *  6. every operation is checked against that plan and against this term's
 *     published sections, read here from the dataset, not from the request;
 *  7. all of them are applied and saved in one compare-and-set write, so
 *     the change is all or nothing even against a save racing it.
 *
 * An undo names the change it reverses; its operations are the inverse the
 * server worked out when it applied that change, checked against the plan as
 * it is now. If anything since has touched what it would reverse, nothing is
 * changed and the conflict is described instead.
 */

export interface ServerPlanData {
  term: string;
  termName: string;
  row(code: string): CourseRow | undefined;
  /** This term's sections for a course; null when it has none. */
  sections(code: string): Promise<SectionTuple[] | null>;
}

export interface ApplyDependencies {
  email: () => Promise<string | null | undefined>;
  store: () => PlanStore | null;
  data: () => Promise<ServerPlanData>;
  ownerTag: (email: string) => string;
  planKey: (email: string) => string;
  metric: (event: PlanAiEvent) => Promise<void>;
  now?: () => Date;
}

const bodySchema = z.object({
  owner: z.string().regex(/^[0-9a-f]{16}$/),
  baseRev: z.number().int().min(0),
  change: z.object({
    id: z.string().regex(CHANGE_ID),
    kind: z.enum(["apply", "undo"]),
    undoOf: z.string().regex(CHANGE_ID).optional(),
    term: z.string().regex(TERM_CODE),
    ops: z.array(z.unknown()).max(16),
  }).strict(),
}).strict();

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

const planReply = (owner: string, plan: StoredPlan | null) => ({
  owner,
  rev: plan?.rev ?? 0,
  savedAt: plan?.savedAt ?? null,
  docs: plan?.docs ?? EMPTY_DOCS,
});

export async function handleApply(request: Request, deps: ApplyDependencies): Promise<Response> {
  const email = normalizeEmail(await deps.email());
  if (!email || !isEligibleEmail(email)) return json({ error: "Sign in to save changes to your plan.", code: "AUTH_REQUIRED" }, 401);
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return json({ error: "Please save changes from UCSDPlans.", code: "INVALID_ORIGIN" }, 403);

  const body = await readJsonBody(request);
  if (!body.ok) return json({ error: body.error, code: body.code }, body.status);
  const parsed = bodySchema.safeParse(body.value);
  if (!parsed.success) return json({ error: "That change couldn't be read.", code: "INVALID_CHANGE" }, 400);
  const { owner, baseRev, change } = parsed.data;
  const ops = change.kind === "apply" ? cleanOps(change.ops) : [];
  if (!ops || (change.kind === "apply" && !ops.length) || (change.kind === "undo" && !change.undoOf)) {
    return json({ error: "That change couldn't be read.", code: "INVALID_CHANGE" }, 400);
  }

  const store = deps.store();
  if (!store) return json({ error: "Saving plans to your account isn't set up on this deployment.", code: "PLAN_STORE_UNCONFIGURED" }, 503);
  const tag = deps.ownerTag(email);
  const key = deps.planKey(email);

  try {
    const current = await store.get(key);
    if (owner !== tag) return json({ ...planReply(tag, current), code: "OWNER_MISMATCH", error: "This browser held another account's plan. It has been reloaded." }, 409);

    const planner = current?.docs.planner ?? null;
    const log = planner?.log ?? [];
    const done = log.find((c) => c.id === change.id);
    if (done) {
      void deps.metric("apply_duplicate");
      return json({ ...planReply(tag, current), status: "duplicate", change: { id: done.id, label: done.label } });
    }
    if ((current?.rev ?? 0) !== baseRev) {
      void deps.metric("apply_conflict");
      return json({ ...planReply(tag, current), code: "PLAN_CHANGED", error: "Your plan changed in another tab or device." }, 409);
    }

    const data = await deps.data();
    if (change.term !== data.term) {
      void deps.metric("apply_conflict");
      return json({ ...planReply(tag, current), code: "TERM_CHANGED", error: `The schedule has moved on to ${data.termName}.` }, 409);
    }

    let target: PlanChange | undefined;
    let toApply: PlanOp[] = ops;
    if (change.kind === "undo") {
      target = log.find((c) => c.id === change.undoOf);
      if (!target) return json({ ...planReply(tag, current), code: "UNDO_NOT_FOUND", error: "That change is too old to undo from here." }, 404);
      if (target.undoneBy) return json({ ...planReply(tag, current), status: "already-undone", change: { id: target.undoneBy, label: log.find((c) => c.id === target!.undoneBy)?.label ?? "Already undone" } });
      toApply = target.inverse;
    }

    // Sections are read from the dataset for every course an operation picks sections for.
    const sections = new Map<string, SectionTuple[]>();
    for (const op of toApply) {
      if ((op.op === "add_term" || op.op === "set_sections") && op.selection) {
        sections.set(op.code, (await data.sections(op.code)) ?? []);
      }
    }
    const patchData: PatchData = {
      term: data.term,
      termName: data.termName,
      rowFor: (code) => data.row(code),
      sectionsFor: (code) => sections.get(code),
    };
    const base: PlannerDoc = planner ?? blankPlanner(data.term);
    const problems: PatchProblem[] = validatePlanPatch(base, toApply, patchData);
    if (problems.length) {
      void deps.metric(change.kind === "undo" ? "undo_conflict" : "apply_conflict");
      return json({
        ...planReply(tag, current),
        code: change.kind === "undo" ? "UNDO_CONFLICT" : "PATCH_CONFLICT",
        error: change.kind === "undo"
          ? "Your plan changed since then, so that change can't be undone exactly."
          : "Your plan changed since this suggestion was made.",
        problems,
      }, 409);
    }

    const now = (deps.now ?? (() => new Date()))();
    const { doc, inverse } = applyPlanPatch(base, toApply, patchData, now.getTime().toString(36));
    const label = change.kind === "undo" ? `${describeOps(toApply, data.termName)} (undo)`.slice(0, 160) : describeOps(toApply, data.termName);
    const entry: PlanChange = {
      id: change.id, at: now.toISOString(), label, ops: toApply, inverse,
      ...(change.kind === "undo" ? { undoOf: target!.id } : {}),
    };
    const nextLog = [...log.map((c) => (target && c.id === target.id ? { ...c, undoneBy: change.id } : c)), entry].slice(-MAX_LOG);
    const docs = cleanDocs({ ...(current?.docs ?? EMPTY_DOCS), planner: { ...doc, log: nextLog } });
    const result = await store.put(key, baseRev, docs);
    if (!result.ok) {
      void deps.metric("apply_conflict");
      return json({ ...planReply(tag, result.current), code: "PLAN_CHANGED", error: "Your plan changed in another tab or device." }, 409);
    }
    void deps.metric(change.kind === "undo" ? "undo_ok" : "apply_ok");
    return json({ ...planReply(tag, result.plan), status: "applied", change: { id: change.id, label } });
  } catch (err) {
    void deps.metric("apply_failed");
    console.error(`[plan-ai] apply failed: ${err instanceof Error ? err.message : String(err)}`);
    return json({ error: "Your plan couldn't be saved. Nothing changed.", code: "PLAN_SAVE_FAILED" }, 502);
  }
}
