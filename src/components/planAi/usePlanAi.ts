"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePlanner } from "@/app/planner/PlannerProvider";
import { DEPARTMENTS } from "@/data/ucsdStructure";
import { collegeName, loadGE, loadIndex, loadSubject, type GEFile, type SubjectFile } from "@/lib/plat";
import { cleanPlanner } from "@/lib/plan/record";
import { newChangeId, type PlanOp } from "@/lib/plan/change";
import { planFingerprint, type PatchProblem } from "@/lib/plan/patch";
import { accountSyncStatus, adoptAccountPlan, PLANNER_KEY, settleAccountPlan } from "@/lib/plan/sync";
import { parseLocal, isComplete, type ParseVocab } from "@/lib/planAi/localParse";
import { buildInterpretRequest, type SensitiveReason } from "@/lib/planAi/privacy";
import {
  addProposal, buildPlanOptions, cardFor, courseChecks, findFitting, fitCourse, placementChecks, proposalFromOps, standing,
  type DataAccess, type PlanningContext,
} from "@/lib/planAi/engine";
import { resolveGoal, goalNoun, type Goal } from "@/lib/planAi/requirements";
import {
  absorb, askFrom, defaultSettings, goalRefLabel, isStale, PREFERENCE_LABEL, relax, replacesPlan, resolveRef, targetWords,
  unitsLabel, type Settings,
} from "@/lib/planAi/conversation";
import { resolveQuarter, termTarget, slotTarget, type PlanContext } from "@/lib/planAi/terms";
import { moveConsequences, moveIsClear } from "@/lib/planAi/consequences";
import { checkText, minutes, relaxationText } from "@/lib/planAi/explain";
import { clockLabel } from "@/lib/planAi/vocabulary";
import { requirementsFor } from "@/lib/planAi/requirements";
import {
  constraintClause, findReply, missText, moveReply, optionsReply, problemText, sensitiveReply, syncProblem,
} from "@/lib/planAi/replies";
import { collegeKey } from "@/lib/planAi/vocabulary";
import { eventsForRow, groupSections, sameSelection, selectedSections, type CalEvent } from "@/lib/sections";
import { majorSubjects, platRowToCourse } from "@/lib/plannerBridge";
import { takeHandoff } from "@/lib/planAi/handoff";
import type { CourseCard, Interpretation, PlanTarget, Proposal } from "@/lib/planAi/types";
import type { Action, AssistantMessage, ChatMessage, Choice } from "./types";

/**
 * Plan with AI's conversation: the one place that turns what the student
 * says or clicks into engine calls and plan changes.
 *
 * Per turn: the local parser reads the request; only if it leaves words
 * unread, and the model is on, is the model asked — once. The reading is
 * checked, folded into the settings, resolved against the student's plan
 * and record here in the browser, and answered from the engine with
 * templates. A change is saved only by an explicit command the local parser
 * read, or a click: through /api/plan-ai/apply, after the plan is brought
 * in step with the account, and said to be saved only when the account
 * holds it.
 */

let messageSeq = 0;
const mid = () => `m${Date.now().toString(36)}${(messageSeq++).toString(36)}`;

const STARTERS: Choice[] = [
  { label: "Build my quarter", action: { kind: "start", flow: "build" } },
  { label: "Improve my plan", action: { kind: "start", flow: "improve" } },
  { label: "Find a course that fits", action: { kind: "start", flow: "find" } },
];

export const UNAVAILABLE = "AI chat is temporarily unavailable. You can still build and edit your plan.";
const PAUSE_KEY = "ucsdplans-plan-ai-paused-until";

type Flow = "build" | "improve" | "find";

export interface PlanAiState {
  messages: ChatMessage[];
  settings: Settings | null;
  busy: string | null;
  /** Announced to screen readers: save results and errors. */
  status: string;
  /** Whether typed requests can go to the model on this deployment. */
  model: boolean | null;
  /** The proposal or card the plan panel previews. */
  preview: { proposal: Proposal } | null;
  proposals: Map<string, Proposal>;
  fingerprint: string;
  ready: boolean;
  send: (text: string) => void;
  act: (action: Action) => void;
  setSettings: (s: Settings) => void;
  focusProposal: (id: string | null) => void;
  /** The course the student is looking at, for "why this course?" and "keep this course". */
  focusCourse: (code: string | null) => void;
  targets: PlanContext;
  /** The previewed proposal on this term's calendar: blocks it adds, and courses it removes or changes. */
  previewPlan: { ghosts: CalEvent[]; fading: Set<string> };
}

export function usePlanAi(): PlanAiState {
  const planner = usePlanner();
  const {
    platRows, platByCode, term, termName, termSettled, selectedCourses, selections, plannedCourses,
    selectedMajor, selectedCollege, history, changeLog, hydrated, roleOf,
  } = planner;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [settings, setSettingsState] = useState<Settings | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [model, setModel] = useState<boolean | null>(null);
  const [ge, setGe] = useState<GEFile | null>(null);
  const [seatsAsOf, setSeatsAsOf] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [proposals, setProposals] = useState<Map<string, Proposal>>(() => new Map());

  // ── Data the engine reads ──────────────────────────────────────────────────
  useEffect(() => {
    loadGE().then(setGe).catch(() => setGe(null));
    loadIndex().then((d) => setSeatsAsOf(d.meta.seatsAsOf ?? null)).catch(() => {});
    fetch("/api/plan-ai", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { model: false }))
      .then((b) => setModel(b?.model === true))
      .catch(() => setModel(false));
  }, []);

  const subjects = useRef(new Map<string, SubjectFile | null>());
  const data = useMemo<DataAccess>(() => ({
    term,
    termName,
    rows: platRows,
    row: (c) => platByCode.get(c),
    ge,
    detail: (code) => subjects.current.get(platByCode.get(code)?.s ?? code.split(" ")[0])?.courses[code],
    async load(list) {
      await Promise.all(list.filter((s) => !subjects.current.has(s)).map((s) =>
        loadSubject(s).then((f) => { subjects.current.set(s, f); }).catch(() => { subjects.current.set(s, null); })));
    },
    seatsAsOf,
  }), [term, termName, platRows, platByCode, ge, seatsAsOf]);

  const vocab = useMemo<ParseVocab>(() => ({
    subjects: new Set(platRows.map((r) => r.s)),
    codes: new Set(platByCode.keys()),
    areas: ge?.areas ?? [],
    departments: DEPARTMENTS.map((d) => ({ name: d.name, subjects: d.subjects })),
  }), [platRows, platByCode, ge]);

  const fingerprint = useMemo(() => planFingerprint({
    term, schedule: selectedCourses, sections: selections, planned: plannedCourses,
  }), [term, selectedCourses, selections, plannedCourses]);

  const targets = useMemo<PlanContext>(() => ({
    datasetTerm: term, planned: plannedCourses, scheduleCodes: selectedCourses.map((s) => s.course.code),
  }), [term, plannedCourses, selectedCourses]);

  // The latest of everything, for async work that outlives the render it started in.
  const live = useRef({ data, vocab, fingerprint, targets, settings, model, proposals, changeLog, selectedCourses, selections, plannedCourses, selectedMajor, selectedCollege, history, termName, term });
  live.current = { data, vocab, fingerprint, targets, settings, model, proposals, changeLog, selectedCourses, selections, plannedCourses, selectedMajor, selectedCollege, history, termName, term };

  const ready = hydrated && termSettled && platRows.length > 0 && ge != null && settings != null;

  useEffect(() => {
    if (!settings && term && termSettled) setSettingsState(defaultSettings(termTarget(term)));
  }, [settings, term, termSettled]);

  // ── Conversation state that is not rendered directly ──────────────────────
  /** What "the second one" refers to: the latest options or cards, in order. */
  const shown = useRef<{ kind: "options"; ids: string[] } | { kind: "cards"; messageId: string; codes: string[] } | null>(null);
  const cardsByMessage = useRef(new Map<string, AssistantMessage["cards"]>());
  const lastFlow = useRef<{ flow: Flow; courses: string[] } | null>(null);
  const pending = useRef<{ proposalId: string } | null>(null);
  const attempts = useRef(new Map<string, string>());
  const lastChange = useRef<{ id: string; label: string } | null>(null);
  const focusCourse = useRef<string | null>(null);
  /** Why the last search came up empty, for "why doesn't this fit?". */
  const lastWhyNot = useRef<string[]>([]);
  /** Every course the current search has shown, so "show other courses" shows new ones. */
  const seenInFind = useRef<string[]>([]);

  const say = useCallback((m: Omit<AssistantMessage, "id" | "role">): AssistantMessage => {
    const message: AssistantMessage = { id: mid(), role: "assistant", ...m };
    setMessages((prev) => [...prev, message]);
    return message;
  }, []);

  const remember = useCallback((list: Proposal[]) => {
    setProposals((prev) => {
      const next = new Map(prev);
      for (const p of list) next.set(p.id, p);
      return next;
    });
    for (const p of list) live.current.proposals.set(p.id, p);
  }, []);

  const ctx = useCallback((): PlanningContext => {
    const l = live.current;
    return {
      data: l.data,
      student: { major: l.selectedMajor, college: collegeKey(l.selectedCollege), history: l.history },
      plan: {
        term: l.term,
        schedule: l.selectedCourses.map((s) => ({ code: s.course.code, units: s.course.units, title: s.course.title })),
        selections: l.selections,
        planned: l.plannedCourses,
        fingerprint: l.fingerprint,
      },
    };
  }, []);

  const setSettings = useCallback((s: Settings) => {
    setSettingsState(s);
    live.current.settings = s;
  }, []);

  // ── The goal, resolved for this student ────────────────────────────────────
  const goalFor = useCallback((s: Settings): { goal: Goal | null; notes: string[] } | { asked: true } => {
    if (!s.goal) return { goal: null, notes: [] };
    const l = live.current;
    const r = resolveGoal(s.goal, { major: l.selectedMajor, college: collegeKey(l.selectedCollege) }, l.data.ge);
    if (r.kind === "goal") return { goal: r.goal, notes: r.notes };
    if (r.kind === "ask") {
      say({
        text: r.question.text,
        notes: r.notes,
        question: {
          text: r.question.text,
          choices: r.question.options.map((o) => ({ label: o.label, action: { kind: "goal", ref: o.ref } })),
          more: r.question.more?.map((o) => ({ label: o.label, action: { kind: "goal", ref: o.ref } })),
          note: r.question.note,
        },
      });
      return { asked: true };
    }
    if (r.kind === "blocked") {
      say({
        text: r.text,
        question: r.question ? {
          text: r.question.text,
          choices: r.question.options.map((o) => ({ label: o.label, action: { kind: "goal", ref: o.ref } })),
        } : undefined,
      });
      return { asked: true };
    }
    say({ text: r.text, followUps: [{ label: "Choose another program", action: { kind: "goal", ref: { kind: "warren_pofc", discipline: r.program.disciplines[0], program: null } } }] });
    return { asked: true };
  }, [say]);

  // ── Flows ──────────────────────────────────────────────────────────────────
  const runFind = useCallback(async (s: Settings, courses: string[] = [], exclude: string[] = []) => {
    lastFlow.current = { flow: "find", courses };
    const resolved = goalFor(s);
    if ("asked" in resolved) return;
    setBusy(s.target.kind === "term" ? "Checking sections" : "Checking courses");
    try {
      const c = ctx();
      const ask = askFrom(s, resolved.goal, courses);
      const result = await findFitting(c, ask, 5, exclude);
      const what = resolved.goal ? goalNoun(resolved.goal) : courses.length ? "matching" : s.subjects.length ? s.subjects.join("/") : "";
      const notes = [...resolved.notes];
      if (result.undecided.length) notes.push(`Not checked against ${result.undecided.join(", ")}: choose ${result.undecided.length === 1 ? "its" : "their"} sections first.`);
      if (result.cards.some((x) => x.checks.some((k) => k.code === "PREREQ_NO_RECORD"))) notes.push("No saved Academic History, so prerequisites aren't checked.");
      const message = say({
        text: findReply(result, what.trim() ? what : "", s, s.target).replace("  ", " "),
        notes: [...notes, ...result.misses.slice(0, result.cards.length ? 0 : 3).map(missText)],
        cards: { items: result.cards, target: s.target, base: c.plan.fingerprint },
        sources: result.sources,
        followUps: result.cards.length
          ? [
              ...(s.target.kind === "term" ? [{ label: "Try a later start", action: { kind: "later-start" } } as Choice] : []),
              { label: "Show other courses", action: { kind: "more" } },
            ]
          : [
              ...(s.noPrerequisites ? [{ label: "Allow prerequisites", action: { kind: "set", patch: { noPrerequisites: false }, flow: "find" } } as Choice] : []),
              ...(s.earliestStart != null ? [{ label: "Allow earlier classes", action: { kind: "relax", relaxation: { kind: "earlier_start", to: s.earliestStart - 60 } } } as Choice] : []),
              { label: "Change requirement", action: { kind: "settings" } },
            ],
      });
      cardsByMessage.current.set(message.id, message.cards);
      shown.current = { kind: "cards", messageId: message.id, codes: result.cards.map((x) => x.code) };
      seenInFind.current = [...exclude, ...result.cards.map((x) => x.code)];
      lastWhyNot.current = result.cards.length ? [] : result.misses.map(missText);
    } finally {
      setBusy(null);
    }
  }, [ctx, goalFor, say]);

  const runOptions = useCallback(async (s: Settings, mode: "build" | "improve") => {
    lastFlow.current = { flow: mode, courses: [] };
    const resolved = goalFor(s);
    if ("asked" in resolved) return;
    if (mode === "improve" && !live.current.selectedCourses.length && s.target.kind === "term") {
      say({ text: `Your ${targetWords(s.target)} plan is empty, so there's nothing to improve yet.`, followUps: [STARTERS[0], STARTERS[2]] });
      return;
    }
    setBusy("Checking combinations");
    try {
      const c = ctx();
      const result = await buildPlanOptions(c, askFrom(s, resolved.goal), mode);
      remember(result.proposals);
      const notes = [...resolved.notes];
      if (s.target.kind === "plan") notes.push(`The ${targetWords(s.target)} schedule isn't published, so this is a course-level draft with no times.`);
      if (result.undecided.length && mode === "build") notes.push(`${result.undecided.join(", ")} had no sections chosen, so the draft picks them.`);
      if (result.proposals.some((p) => p.checks.some((k) => k.code === "PREREQ_NO_RECORD"))) notes.push("No saved Academic History, so prerequisites aren't checked.");
      const relaxation = result.outcome.relaxation;
      // An improvement that changes nothing is an answer, not an option: say
      // which tradeoff the kept courses rule out, and offer to loosen them.
      const changing = result.proposals.filter((p) => p.ops.length);
      if (mode === "improve" && result.proposals.length && !changing.length) {
        const wanted = s.preferences.filter((x) => x !== "requirements" && x !== "open_seats").map((x) => PREFERENCE_LABEL[x].toLowerCase());
        const locked = s.keep.filter((k) => live.current.selectedCourses.some((c) => c.course.code === k));
        const asked = wanted.length ? wanted.join(" or ") : "a better week";
        const text = locked.length
          ? `With ${locked.join(" and ")} kept as ${locked.length === 1 ? "it is" : "they are"}, no other sections give you ${asked}.`
          : `No other sections of your courses give you ${asked}${constraintClause(s)}.`;
        lastWhyNot.current = [text];
        say({
          text,
          notes,
          followUps: [
            ...(locked.length ? [{ label: `Let ${locked.join(" and ")} change sections`, action: { kind: "set", patch: { keep: s.keep.filter((k) => !locked.includes(k)) }, flow: "improve" }, primary: true } as Choice] : []),
            { label: "Replace a course", action: { kind: "say", text: "find a course that fits" } },
            { label: "Change settings", action: { kind: "settings" } },
          ],
        });
        return;
      }
      if (mode === "build" && result.proposals.length && !changing.length) {
        const facts = result.proposals[0].after;
        const text = `Your ${targetWords(s.target)} plan already fits: ${facts.units} units${constraintClause(s)}.`;
        say({
          text,
          notes,
          followUps: [
            { label: "Add a course anyway", action: { kind: "start", flow: "find" }, primary: true },
            ...(s.target.kind === "term" ? [
              { label: "Fewer campus days", action: { kind: "pref", pref: "fewer_days" } } as Choice,
              { label: "Shorter gaps", action: { kind: "pref", pref: "fewer_gaps" } } as Choice,
            ] : []),
          ],
        });
        return;
      }
      const shownProposals = mode === "improve" ? changing : result.proposals.filter((p) => p.ops.length);
      const answer = mode === "improve" ? { ...result, proposals: changing } : result;
      const followUps: Choice[] = shownProposals.length
        ? s.target.kind === "term"
          ? [
              { label: "Try a later start", action: { kind: "later-start" } },
              ...(mode === "build" ? [{ label: "Fewer campus days", action: { kind: "pref", pref: "fewer_days" } } as Choice] : []),
              { label: "Shorter gaps", action: { kind: "pref", pref: "fewer_gaps" } },
            ]
          : [{ label: "Change settings", action: { kind: "settings" } }]
        : relaxation
          ? [{ label: relaxationText(relaxation).action, action: { kind: "relax", relaxation }, primary: true }, { label: "Change settings", action: { kind: "settings" } }]
          : [{ label: "Change settings", action: { kind: "settings" } }];
      if (!shownProposals.length && relaxation) notes.unshift(relaxationText(relaxation).text);
      lastWhyNot.current = shownProposals.length ? [] : [optionsReply(answer, s, s.target, mode), ...(relaxation ? [relaxationText(relaxation).text] : [])];
      say({
        text: optionsReply(answer, s, s.target, mode),
        notes,
        options: shownProposals.length ? { ids: shownProposals.map((p) => p.id) } : undefined,
        sources: shownProposals[0]?.sources,
        followUps,
      });
      shown.current = shownProposals.length ? { kind: "options", ids: shownProposals.map((p) => p.id) } : shown.current;
      if (shownProposals[0]) setPreviewId(shownProposals[0].id);
    } finally {
      setBusy(null);
    }
  }, [ctx, goalFor, remember, say]);

  const rerun = useCallback((s: Settings) => {
    const last = lastFlow.current;
    if (!last) return;
    if (last.flow === "find") void runFind(s, last.courses);
    else void runOptions(s, last.flow);
  }, [runFind, runOptions]);

  // ── Saving ─────────────────────────────────────────────────────────────────
  /** The fingerprint of the plan as it is in this browser right now, read past React's render cycle. */
  const storedFingerprint = useCallback((): string => {
    try {
      const doc = cleanPlanner(JSON.parse(localStorage.getItem(PLANNER_KEY) ?? "null"));
      return doc ? planFingerprint(doc) : live.current.fingerprint;
    } catch {
      return live.current.fingerprint;
    }
  }, []);

  const post = useCallback(async (change: { id: string; kind: "apply" | "undo"; undoOf?: string; ops: PlanOp[] }, base: string | null = null) => {
    const agreed = await settleAccountPlan();
    if (!agreed) return { ok: false as const, text: syncProblem(accountSyncStatus()) };
    // Checked again now that the account's latest is in: another device may
    // have changed the plan this suggestion's checks were made against.
    if (base && isStale({ base }, storedFingerprint())) return { ok: false as const, code: "STALE", text: "" };
    let res: Response;
    try {
      res = await fetch("/api/plan-ai/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ owner: agreed.owner, baseRev: agreed.rev, change: { ...change, term: live.current.term } }),
      });
    } catch {
      return { ok: false as const, text: "Your plan couldn't reach the server, so nothing was saved. Try again." };
    }
    const body = await res.json().catch(() => null) as { status?: string; code?: string; error?: string; problems?: PatchProblem[]; change?: { id: string; label: string } } | null;
    if (body && (res.ok || res.status === 409 || res.status === 404)) adoptAccountPlan(body);
    if (res.ok && body?.change) return { ok: true as const, status: body.status ?? "applied", change: body.change };
    return { ok: false as const, code: body?.code, problems: body?.problems ?? [], text: body?.error ?? "Your plan couldn't be saved. Nothing changed." };
  }, [storedFingerprint]);

  const applyOps = useCallback(async (ops: PlanOp[], key: string, base: string | null): Promise<boolean> => {
    if (base && isStale({ base }, storedFingerprint())) {
      say({ text: "Your plan changed since this suggestion, so I didn't apply it.", tone: "error", followUps: [{ label: "Update the suggestion", action: { kind: "run", flow: lastFlow.current?.flow ?? "find" }, primary: true }] });
      setStatus("Not applied: your plan changed since the suggestion.");
      return false;
    }
    setBusy("Saving to your plan");
    try {
      const id = attempts.current.get(key) ?? newChangeId();
      attempts.current.set(key, id);
      const result = await post({ id, kind: "apply", ops }, base);
      if (result.ok) {
        attempts.current.delete(key);
        lastChange.current = { id: result.change.id, label: result.change.label };
        const text = result.status === "duplicate" ? `Already saved: ${result.change.label}.` : `${result.change.label}.`;
        say({
          text, tone: "success",
          receipt: { changeId: result.change.id, label: result.change.label, kind: "apply", where: ops.some((o) => o.op.endsWith("_plan")) ? "plan" : "term" },
          notes: ops.some((o) => o.op === "add_term" && !o.selection) ? ["Sections not chosen yet, so its times aren't checked. Choose them on This term."] : undefined,
        });
        setStatus(`Saved to your plan. ${result.change.label}.`);
        return true;
      }
      if (result.code === "STALE") {
        say({ text: "Your plan changed on another tab or device since this suggestion, so I didn't apply it. I've loaded the latest plan.", tone: "error", followUps: [{ label: "Update the suggestion", action: { kind: "run", flow: lastFlow.current?.flow ?? "find" }, primary: true }] });
        setStatus("Not applied: your plan changed since the suggestion.");
        return false;
      }
      const problems = (result.problems ?? []).map((p) => problemText(p, live.current.termName));
      say({
        text: result.code === "PLAN_CHANGED" ? "Your plan changed in another tab or device, so nothing was saved. I've loaded the latest plan." : result.text,
        tone: "error",
        notes: problems,
        followUps: result.code === "PLAN_CHANGED" || result.code === "PATCH_CONFLICT"
          ? [{ label: "Update the suggestion", action: { kind: "run", flow: lastFlow.current?.flow ?? "find" }, primary: true }]
          : [{ label: "Retry", action: { kind: "ops", ops, target: live.current.settings?.target ?? termTarget(live.current.term), label: key }, primary: true }],
      });
      setStatus("Not saved. Nothing changed in your plan.");
      return false;
    } finally {
      setBusy(null);
    }
  }, [post, say, storedFingerprint]);

  const applyProposal = useCallback(async (p: Proposal, how: "click" | "typed") => {
    if (replacesPlan(p) && how === "typed") {
      pending.current = { proposalId: p.id };
      say({
        text: `This removes ${p.removes.join(", ")}${p.adds.length ? ` and adds ${p.adds.map((a) => a.code).join(", ")}` : ""}. Apply it?`,
        options: { ids: [p.id] },
        followUps: [{ label: "Apply changes", action: { kind: "confirm", yes: true }, primary: true }, { label: "Cancel", action: { kind: "confirm", yes: false } }],
      });
      return;
    }
    await applyOps(p.ops, p.id, p.base);
  }, [applyOps, say]);

  /**
   * Adds a course from a card. A card made before the plan last changed is
   * checked again against the week as it is now: added as shown when its
   * sections still fit, shown again with new sections when they don't, and
   * explained when nothing fits any more.
   */
  const addCard = useCallback(async (card: CourseCard, cards: NonNullable<AssistantMessage["cards"]>, target: PlanTarget, explicit: boolean) => {
    const c = ctx();
    const now = storedFingerprint();
    if (cards.base === now || target.kind === "plan") {
      const proposal = addProposal(c, card, target);
      proposal.base = now;
      if (!explicit) {
        remember([proposal]);
        say({ text: `Add ${card.code}?`, options: { ids: [proposal.id] } });
        shown.current = { kind: "options", ids: [proposal.id] };
        return;
      }
      await applyOps(proposal.ops, `card-${card.code}-${now}`, now);
      return;
    }
    setBusy("Checking sections");
    let proposal: Proposal;
    let same = false;
    try {
      await c.data.load([c.data.row(card.code)?.s ?? card.code.split(" ")[0]]);
      const st = standing(c);
      const s = live.current.settings ?? defaultSettings(target);
      const fit = fitCourse(card.code, c.data.detail(card.code)?.sec, st.fixed, askFrom(s, null).constraints, s.preferences);
      if (!fit.config) {
        say({ text: `${card.code} doesn't fit your week any more${fit.blocked?.kind === "clash" ? `: it clashes with ${fit.blocked.with.join(", ")}` : ""}.`, tone: "error" });
        return;
      }
      const row = c.data.row(card.code)!;
      const fresh = cardFor(c, row, fit.config, [...courseChecks(c, row, target, null), ...placementChecks(fit.config, st.fixed, st.undecided)]);
      proposal = addProposal(c, fresh, target);
      proposal.base = now;
      same = Boolean(card.selection && fit.config.selection && sameSelection(card.selection, fit.config.selection));
    } finally {
      setBusy(null);
    }
    if (explicit && same) {
      await applyOps(proposal.ops, `card-${card.code}-${now}`, now);
      return;
    }
    remember([proposal]);
    say({ text: `Your week changed since that list, so ${card.code} needs different sections to fit. Here they are.`, options: { ids: [proposal.id] } });
    shown.current = { kind: "options", ids: [proposal.id] };
    setPreviewId(proposal.id);
  }, [applyOps, ctx, remember, say, storedFingerprint]);

  const undo = useCallback(async (changeId: string) => {
    setBusy("Undoing");
    try {
      const result = await post({ id: newChangeId(), kind: "undo", undoOf: changeId, ops: [] });
      if (result.ok) {
        if (lastChange.current?.id === changeId) lastChange.current = null;
        const text = result.status === "already-undone" ? "That change was already undone." : `${result.change.label}.`;
        say({ text, tone: "success", receipt: { changeId: result.change.id, label: result.change.label, kind: "undo", where: live.current.changeLog.find((c) => c.id === changeId)?.ops.some((o) => o.op.endsWith("_plan")) ? "plan" : "term" } });
        setStatus(text);
        setMessages((prev) => prev.map((m) => (m.role === "assistant" && m.receipt?.changeId === changeId ? { ...m, receipt: { ...m.receipt, undone: true } } : m)));
        return;
      }
      if (result.code === "UNDO_CONFLICT") {
        // A reviewed diff instead: the same removals, against the plan as it is now.
        const l = live.current;
        const entry = l.changeLog.find((c) => c.id === changeId);
        const ops: PlanOp[] = (entry?.inverse ?? []).flatMap((op): PlanOp[] => {
          if (op.op === "remove_term") return l.selectedCourses.some((s) => s.course.code === op.code) ? [{ ...op, expect: l.selections[op.code] ?? null }] : [];
          if (op.op === "set_sections") return [{ ...op, expect: l.selections[op.code] ?? null }];
          return [op];
        });
        say({
          text: "Your plan changed since then, so that change can't be undone exactly.",
          tone: "error",
          notes: (result.problems ?? []).map((p) => problemText(p, l.termName)),
          followUps: ops.length ? [{ label: `Remove ${[...new Set(ops.map((o) => o.code))].join(", ")} anyway`, action: { kind: "ops", ops, target: l.settings?.target ?? termTarget(l.term), label: `undo-anyway-${changeId}` } }] : undefined,
        });
        setStatus("Not undone: your plan changed since then.");
        return;
      }
      say({ text: result.text, tone: "error", followUps: [{ label: "Retry", action: { kind: "undo", changeId }, primary: true }] });
      setStatus("Not undone.");
    } finally {
      setBusy(null);
    }
  }, [post, say]);

  // ── Typed requests ─────────────────────────────────────────────────────────
  const pausedUntil = useRef(0);
  useEffect(() => {
    try { pausedUntil.current = Number(sessionStorage.getItem(PAUSE_KEY)) || 0; } catch { /* none */ }
  }, []);

  /** At most one model call, for words the local parser could not place. */
  const interpret = useCallback(async (text: string, local: Interpretation): Promise<{ reading: Interpretation; fallback: string | null; notes: string[] }> => {
    const l = live.current;
    if (!l.model) return { reading: local, fallback: UNAVAILABLE, notes: [] };
    if (Date.now() < pausedUntil.current) return { reading: local, fallback: UNAVAILABLE, notes: ["AI chat is paused for a moment after a busy period."] };
    const optionsShown = shown.current?.kind === "options" ? shown.current.ids.length : shown.current?.kind === "cards" ? shown.current.codes.length : 0;
    const built = buildInterpretRequest(text, { options: Math.min(optionsShown, 3), pending: Boolean(pending.current) });
    if (!built.ok) return { reading: local, fallback: sensitiveReply(built.reasons), notes: [] };
    setBusy("Reading your request");
    try {
      const res = await fetch("/api/plan-ai/interpret", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(built.body),
        signal: AbortSignal.timeout(20_000),
      });
      const body = await res.json().catch(() => null) as { interpretation?: Interpretation; rejected?: string[]; error?: string; code?: string; reasons?: SensitiveReason[] } | null;
      if (!res.ok || !body?.interpretation) {
        const retry = Number(res.headers.get("retry-after"));
        if (Number.isFinite(retry) && retry > 0) {
          pausedUntil.current = Date.now() + retry * 1000;
          try { sessionStorage.setItem(PAUSE_KEY, String(pausedUntil.current)); } catch { /* memory only */ }
        }
        return { reading: local, fallback: body?.code === "SENSITIVE_INPUT" ? sensitiveReply(body.reasons ?? []) : body?.error ?? UNAVAILABLE, notes: [] };
      }
      const m = body.interpretation;
      const union = (a: string[], b: string[]) => [...new Set([...a, ...b])];
      const reading: Interpretation = {
        ...m,
        kind: local.kind ?? m.kind,
        courses: union(local.courses, m.courses),
        unknownCodes: local.unknownCodes,
        replacement: local.replacement ?? m.replacement,
        optionRef: local.optionRef ?? m.optionRef,
        quarter: local.quarter ?? m.quarter,
        constraints: { ...m.constraints, ...local.constraints },
        preferences: [...new Set([...local.preferences, ...m.preferences])],
        requirement: local.requirement ?? m.requirement,
        subjects: local.subjects.length ? local.subjects : m.subjects,
        keep: union(local.keep, m.keep),
        keepAll: local.keepAll || m.keepAll,
        ask: local.ask,
        // Anything the model helped read is suggested, never carried out by itself.
        explicit: false,
        reply: null,
        leftover: [],
        source: "model",
      };
      const notes = body.rejected?.length ? [`Not in UCSD's catalog, so left out: ${body.rejected.join(", ")}.`] : [];
      if (m.unsupported.length) notes.push(`Not applied: ${m.unsupported.join("; ")}.`);
      return { reading, fallback: null, notes };
    } catch {
      return { reading: local, fallback: UNAVAILABLE, notes: [] };
    } finally {
      setBusy(null);
    }
  }, []);

  const scheduleFor = useCallback((code: string) => live.current.selectedCourses.find((s) => s.course.code === code), []);

  /** Carries out (or proposes) a reading. Explicit local commands act; everything else suggests. */
  const handle = useCallback(async (p: Interpretation, extraNotes: string[]) => {
    const l = live.current;
    let s = l.settings ?? defaultSettings(termTarget(l.term));
    let target: PlanTarget | null = null;
    const notes = [...extraNotes];
    if (p.unknownCodes.length) notes.push(`Not in UCSD's catalog: ${p.unknownCodes.join(", ")}.`);
    if (p.quarter) {
      const q = resolveQuarter(p.quarter, l.targets);
      if (q.kind === "ask") { say({ text: q.text, notes, followUps: [{ label: "Choose a quarter", action: { kind: "settings" } }] }); return; }
      target = q.target;
      if (q.note) notes.push(q.note);
    }
    if (p.keepAll) {
      const all = l.selectedCourses.map((c) => c.course.code);
      p = { ...p, keep: [...new Set([...p.keep, ...all])] };
    }
    if (p.ask === "these-courses") {
      const pool = shown.current?.kind === "cards" ? shown.current.codes : l.selectedCourses.map((c) => c.course.code);
      const focused = focusCourse.current;
      const resolvedKeep = focused && pool.includes(focused) ? [focused] : pool.length === 2 ? pool : null;
      if (!resolvedKeep) {
        say({
          text: "Which courses should I keep?",
          question: { text: "Which courses should I keep?", choices: l.selectedCourses.slice(0, 6).map((c) => ({ label: c.course.code, action: { kind: "keep", code: c.course.code } })) },
        });
        return;
      }
      p = { ...p, keep: [...new Set([...p.keep, ...resolvedKeep])] };
    }
    const oneOff = p.kind === "add_course" || p.kind === "remove_course" || p.kind === "replace_course" || p.kind === "move_course" || p.kind === "undo";
    const merged = absorb(s, p, oneOff ? null : target);
    s = merged.settings;
    setSettings(s);
    if (merged.changed.length && p.kind !== "add_course") notes.push(`Using: ${merged.changed.join(", ")}.`);

    // A one-off command acts on the quarter it names, without moving the conversation there.
    const where: PlanTarget = oneOff && target ? target : s.target;
    const termOps = where.kind === "term";
    switch (p.kind) {
      case "undo": {
        const last = lastChange.current ?? [...l.changeLog].reverse().find((c) => !c.undoneBy && !c.undoOf) ?? null;
        if (!last) { say({ text: "There's no Plan with AI change to undo.", notes }); return; }
        if (!p.explicit) { say({ text: `Undo "${last.label}"?`, followUps: [{ label: "Undo", action: { kind: "undo", changeId: last.id }, primary: true }] }); return; }
        await undo(last.id);
        return;
      }
      case "add_course": {
        if (p.optionRef != null) {
          const pick = shown.current?.kind === "options"
            ? resolveRef(p.optionRef, shown.current.ids)
            : shown.current?.kind === "cards" ? resolveRef(p.optionRef, shown.current.codes) : resolveRef(p.optionRef, [] as string[]);
          if ("problem" in pick) {
            say({ text: pick.problem === "ambiguous" ? "Which one? Say \"the first\", \"the second\" or \"the third\"." : pick.problem === "none" ? "There are no options on screen yet." : "There aren't that many options on screen.", notes });
            return;
          }
          if (shown.current?.kind === "options") {
            const proposal = l.proposals.get(pick.item)!;
            if (target && target.label !== proposal.target.label) {
              say({
                text: `That option was built for ${targetWords(proposal.target)}, not ${targetWords(target)}. Which should it go in?`,
                followUps: [
                  { label: `Add to ${targetWords(proposal.target)}`, action: { kind: "apply", proposalId: proposal.id }, primary: true },
                  { label: `Build one for ${targetWords(target)}`, action: { kind: "run", flow: "build" } },
                ],
              });
              return;
            }
            if (!p.explicit) { say({ text: `Apply option ${pick.index + 1}?`, notes, options: { ids: [proposal.id] } }); return; }
            await applyProposal(proposal, "typed");
            return;
          }
          if (shown.current?.kind === "cards") {
            const cards = cardsByMessage.current.get(shown.current.messageId);
            const card = cards?.items.find((c) => c.code === pick.item);
            if (!card || !cards) return;
            await addCard(card, cards, target ?? cards.target, p.explicit);
            return;
          }
        }
        if (!p.courses.length) { void runFind(s); return; }
        // Named courses: placed with their best-fitting sections, or proposed when that needs a choice.
        const c = ctx();
        await c.data.load([...new Set(p.courses.map((code) => c.data.row(code)?.s ?? code.split(" ")[0]))]);
        const st = standing(c);
        const ops: PlanOp[] = [];
        const cards = [];
        const problems: string[] = [];
        for (const code of p.courses) {
          const row = c.data.row(code)!;
          if (where.kind === "plan") {
            if (l.plannedCourses.some((x) => x.course.code === code)) { problems.push(`${code} is already in your 4-year plan.`); continue; }
            ops.push({ op: "add_plan", code, slot: where.slot });
            cards.push(cardFor(c, row, null, courseChecks(c, row, where, null)));
            continue;
          }
          if (scheduleFor(code)) { problems.push(`${code} is already on ${targetWords(where)}.`); continue; }
          if (row.o !== 1) { problems.push(`${code} isn't on the ${l.termName} schedule.`); continue; }
          const fit = fitCourse(code, c.data.detail(code)?.sec, st.fixed, askFrom(s, null).constraints, s.preferences);
          if (!fit.config) {
            problems.push(fit.blocked?.kind === "clash" ? `${code} clashes with ${fit.blocked.with.join(", ")} in every section${fit.blocked.finals ? " (finals included)" : ""}.` : fit.blocked?.kind === "constraint" ? `${code} has no section within your times or days.` : `${code} has no sections published.`);
            continue;
          }
          ops.push({ op: "add_term", code, selection: fit.config.selection });
          st.fixed.push(fit.config);
          cards.push(cardFor(c, row, fit.config, [...courseChecks(c, row, where, null), ...placementChecks(fit.config, st.fixed.filter((f) => f.course !== code), st.undecided)]));
        }
        if (!ops.length) {
          say({
            text: problems.join(" ") || "Nothing to add.",
            tone: "error",
            notes,
            followUps: p.courses.length === 1 && termOps && !scheduleFor(p.courses[0]) && c.data.row(p.courses[0])?.o === 1
              ? [{ label: `Add ${p.courses[0]} without sections`, action: { kind: "ops", ops: [{ op: "add_term", code: p.courses[0], selection: null }], target: where, label: `bare-${p.courses[0]}` } }]
              : undefined,
          });
          return;
        }
        const proposal = proposalFromOps(c, where, ops, cards, { title: `Add ${ops.map((o) => o.code).join(", ")}`, reasons: [] });
        remember([proposal]);
        if (!p.explicit || problems.length) {
          say({ text: problems.length ? `${problems.join(" ")} The rest can be added.` : `Here's where ${ops.map((o) => o.code).join(" and ")} would go.`, notes, options: { ids: [proposal.id] } });
          shown.current = { kind: "options", ids: [proposal.id] };
          setPreviewId(proposal.id);
          return;
        }
        if (notes.length) say({ text: notes.join(" "), tone: "info" });
        await applyOps(proposal.ops, proposal.id, proposal.base);
        return;
      }
      case "remove_course": {
        if (!p.courses.length) { say({ text: "Which course should I remove?", notes }); return; }
        const ops: PlanOp[] = [];
        const problems: string[] = [];
        for (const code of p.courses) {
          if (where.kind === "plan") {
            const entry = l.plannedCourses.find((x) => x.course.code === code);
            if (entry) ops.push({ op: "remove_plan", code, slot: { year: entry.year, quarter: entry.quarter } });
            else problems.push(`${code} isn't in your 4-year plan.`);
          } else if (scheduleFor(code)) {
            ops.push({ op: "remove_term", code, expect: l.selections[code] ?? null });
          } else {
            const planned = l.plannedCourses.find((x) => x.course.code === code);
            if (planned) ops.push({ op: "remove_plan", code, slot: { year: planned.year, quarter: planned.quarter } });
            else problems.push(`${code} isn't on ${targetWords(where)} or in your 4-year plan.`);
          }
        }
        if (!ops.length) { say({ text: problems.join(" "), tone: "error", notes }); return; }
        const proposal = proposalFromOps(ctx(), where, ops, [], { title: `Remove ${ops.map((o) => o.code).join(", ")}`, reasons: [] });
        remember([proposal]);
        if (!p.explicit) { say({ text: `Remove ${ops.map((o) => o.code).join(" and ")}?`, notes, options: { ids: [proposal.id] } }); return; }
        await applyProposal(proposal, "typed");
        return;
      }
      case "replace_course": {
        const old = p.courses[0];
        if (!old) { say({ text: "Which course should I replace?", notes }); return; }
        if (!p.replacement) {
          // A replacement of the same kind, fitted where the old one was.
          s = { ...s, keep: s.keep.filter((k) => k !== old) };
          say({ text: `Looking for courses that fit where ${old} is now. Pick one to replace it with.`, tone: "info" });
          await runFind(s);
          return;
        }
        const c = ctx();
        await c.data.load([...new Set([old, p.replacement].map((code) => c.data.row(code)?.s ?? code.split(" ")[0]))]);
        const st = standing(c);
        const rest = st.fixed.filter((f) => f.course !== old);
        const row = c.data.row(p.replacement)!;
        if (where.kind === "plan") {
          const entry = l.plannedCourses.find((x) => x.course.code === old);
          if (!entry) { say({ text: `${old} isn't in your 4-year plan.`, tone: "error" }); return; }
          const slot = { year: entry.year, quarter: entry.quarter };
          const proposal = proposalFromOps(c, where, [{ op: "remove_plan", code: old, slot }, { op: "add_plan", code: p.replacement, slot }], [cardFor(c, row, null, courseChecks(c, row, where, null))], { title: `Replace ${old}`, reasons: [] });
          remember([proposal]);
          if (!p.explicit) { say({ text: `Replace ${old} with ${p.replacement}?`, options: { ids: [proposal.id] } }); return; }
          await applyProposal(proposal, "typed");
          return;
        }
        if (!scheduleFor(old)) { say({ text: `${old} isn't on ${targetWords(where)}.`, tone: "error" }); return; }
        const fit = fitCourse(p.replacement, c.data.detail(p.replacement)?.sec, rest, askFrom(s, null).constraints, s.preferences);
        if (!fit.config) {
          say({ text: `${p.replacement} doesn't fit where ${old} is now${fit.blocked?.kind === "clash" ? `: it clashes with ${fit.blocked.with.join(", ")}` : ""}.`, tone: "error", notes });
          return;
        }
        const card = cardFor(c, row, fit.config, [...courseChecks(c, row, where, null), ...placementChecks(fit.config, rest, st.undecided)]);
        const proposal = proposalFromOps(c, where, [{ op: "remove_term", code: old, expect: l.selections[old] ?? null }, { op: "add_term", code: p.replacement, selection: fit.config.selection }], [card], { title: `Replace ${old}`, reasons: [] });
        remember([proposal]);
        if (!p.explicit) { say({ text: `Replace ${old} with ${p.replacement}?`, notes, options: { ids: [proposal.id] } }); shown.current = { kind: "options", ids: [proposal.id] }; setPreviewId(proposal.id); return; }
        await applyProposal(proposal, "typed");
        return;
      }
      case "move_course": {
        const code = p.courses[0] ?? focusCourse.current;
        if (!code) { say({ text: "Which course should I move?", notes }); return; }
        if (!target || target.kind !== "plan") {
          say({ text: `Moves are between quarters of your 4-year plan. Which quarter should ${code} go to?`, followUps: [{ label: "Choose a quarter", action: { kind: "settings" } }] });
          return;
        }
        const entry = l.plannedCourses.find((x) => x.course.code === code);
        const c = ctx();
        const consequences = await moveConsequences(c, code, target.slot);
        const ops: PlanOp[] = entry
          ? [{ op: "move_plan", code, from: { year: entry.year, quarter: entry.quarter }, to: target.slot }]
          : [{ op: "add_plan", code, slot: target.slot }];
        const proposal = proposalFromOps(c, target, ops, [], { title: `Move ${code}`, reasons: [] });
        remember([proposal]);
        const clear = moveIsClear(consequences);
        if (p.explicit && clear) {
          say({ text: moveReply(consequences), tone: "info" });
          await applyProposal(proposal, "typed");
          return;
        }
        say({
          text: moveReply(consequences),
          move: consequences,
          notes: entry ? notes : [...notes, `${code} isn't in your 4-year plan yet, so this would add it.`],
          followUps: [{ label: clear ? `Move ${code} to ${target.label}` : "Move it anyway", action: { kind: "apply", proposalId: proposal.id }, primary: clear }],
        });
        return;
      }
      case "explain_choice": {
        const focusCode = p.courses[0] ?? focusCourse.current;
        const c = ctx();
        if (focusCode && c.data.row(focusCode)) {
          await c.data.load([c.data.row(focusCode)!.s]);
          const row = c.data.row(focusCode)!;
          const checks = [...courseChecks(c, row, s.target, null), ...requirementsFor(row, c.student, c.data.ge)];
          const reqs = requirementsFor(row, c.student, c.data.ge);
          say({
            text: `${focusCode}: ${reqs.length ? reqs.map(checkText).join(" ") : "It isn't on any requirement list UCSDPlans has for you."}`,
            notes: checks.filter((x) => !x.code.startsWith("REQ_")).map(checkText),
          });
          return;
        }
        if (lastWhyNot.current.length) { say({ text: lastWhyNot.current[0], notes: lastWhyNot.current.slice(1) }); return; }
        say({ text: "Open \"Why this fits\" on a course to see every check, or name the course, like \"why ECON 1?\"", notes });
        return;
      }
      case "compare_options": {
        if (shown.current?.kind === "options" && shown.current.ids.length > 1) {
          const lines = shown.current.ids.map((id, i) => {
            const o = l.proposals.get(id);
            if (!o) return "";
            const a = o.after;
            const first = a.earliest != null ? `, first class at ${clockLabel(a.earliest)}` : "";
            return `Option ${i + 1}, ${o.title.toLowerCase()}: ${a.units} units, ${a.days.length} ${a.days.length === 1 ? "day" : "days"}, ${minutes(a.gapMinutes)} of gaps a week${first}.`;
          }).filter(Boolean);
          say({ text: "Here's how the options differ.", notes: lines });
          return;
        }
        if (lastFlow.current?.flow === "find") { await runFind(s, lastFlow.current.courses, seenInFind.current); return; }
        await runOptions(s, "improve");
        return;
      }
      case "improve_plan":
        await runOptions(s, "improve");
        return;
      case "build_quarter":
        await runOptions(s, "build");
        return;
      case "find_fitting_course":
        await runFind(s, p.courses);
        return;
      case "clarify":
        if (p.ask === "easier") {
          say({
            text: "What would make it easier for you?",
            notes: ["Historical grades and instructor ratings are separate signals, and neither one measures workload."],
            question: {
              text: "What would make it easier for you?",
              choices: [
                { label: "Fewer units", action: { kind: "units", min: 12, max: 12 } },
                ...(s.target.kind === "term" ? [
                  { label: "Fewer campus days", action: { kind: "pref", pref: "fewer_days" } } as Choice,
                  { label: "Later start", action: { kind: "later-start" } } as Choice,
                ] : []),
                { label: "No prerequisites", action: { kind: "set", patch: { noPrerequisites: true }, flow: "find" } },
              ],
            },
          });
          return;
        }
        break;
      default:
        break;
    }
    if (merged.changed.length && lastFlow.current) {
      rerun(s);
      return;
    }
    say({ text: "What would you like to do?", notes, question: { text: "What would you like to do?", choices: STARTERS } });
  }, [addCard, applyOps, applyProposal, ctx, remember, rerun, runFind, runOptions, say, scheduleFor, setSettings, undo]);

  const send = useCallback((raw: string) => {
    const text = raw.trim();
    if (!text) return;
    setMessages((prev) => [...prev, { id: mid(), role: "user", text }]);
    void (async () => {
      const local = parseLocal(text, live.current.vocab);
      if (local.reply) {
        const waiting = pending.current;
        pending.current = null;
        if (!waiting) { say({ text: "There's nothing waiting for a yes or no." }); return; }
        if (local.reply === "no") { say({ text: "Okay, nothing changed." }); return; }
        const proposal = live.current.proposals.get(waiting.proposalId);
        if (proposal) await applyProposal(proposal, "click");
        return;
      }
      if (isComplete(local)) { await handle(local, []); return; }
      const read = await interpret(text, local);
      if (read.fallback) {
        const unread = local.leftover.length ? `I couldn't read: "${local.leftover.join(" ")}".` : "";
        if (local.kind && local.kind !== "clarify") {
          say({ text: read.fallback, tone: "info", notes: [unread, ...read.notes].filter(Boolean) });
          await handle({ ...local, explicit: false }, []);
          return;
        }
        say({
          text: read.fallback,
          tone: "info",
          notes: [unread, ...read.notes, "Commands that work now: \"add CSE 11\", \"remove CSE 11\", \"undo\", \"no classes before 10\", \"12-16 units\", \"a course about film\"."].filter(Boolean),
          question: { text: "", choices: STARTERS },
        });
        return;
      }
      await handle(read.reading, read.notes);
    })();
  }, [applyProposal, handle, interpret, say]);

  // ── Buttons ────────────────────────────────────────────────────────────────
  const act = useCallback((a: Action) => {
    const s = live.current.settings ?? defaultSettings(termTarget(live.current.term));
    switch (a.kind) {
      case "start": {
        if (a.flow === "find") {
          const college = collegeKey(live.current.selectedCollege);
          const choices: Choice[] = [
            ...(college === "warren"
              ? [{ label: "A Warren PofC course", action: { kind: "goal", ref: { kind: "warren_pofc", discipline: null, program: null } } } as Choice]
              : college ? [{ label: `A ${collegeName(college)} GE`, action: { kind: "goal", ref: { kind: "college_ge", college, area: null, words: null } } } as Choice] : []),
            { label: "A DEI course", action: { kind: "goal", ref: { kind: "university", list: "campus:DEI" } } },
            { label: "A major course", action: { kind: "goal", ref: { kind: "major" } } },
            { label: "Any course that fits", action: { kind: "goal", ref: null } },
          ];
          say({ text: "What kind of course?", question: { text: "What kind of course?", choices } });
          lastFlow.current = { flow: "find", courses: [] };
          return;
        }
        if (a.flow === "improve" && s.target.kind === "plan") {
          // Days, gaps and start times need a published schedule; a 4-year plan quarter has courses only.
          say({
            text: `${targetWords(s.target)} has no published times yet, so I can add courses there but can't change days or gaps.`,
            followUps: [
              { label: "Fill to 12+ units", action: { kind: "units", min: 12, max: s.units.max ?? 16 }, primary: true },
              { label: "Change settings", action: { kind: "settings" } },
            ],
          });
          lastFlow.current = { flow: "improve", courses: [] };
          return;
        }
        if (a.flow === "improve") {
          say({
            text: "What should change?",
            question: {
              text: "What should change?",
              choices: [
                { label: "Shorter gaps", action: { kind: "pref", pref: "fewer_gaps" } },
                { label: "Fewer campus days", action: { kind: "pref", pref: "fewer_days" } },
                { label: "Later start", action: { kind: "later-start" } },
                { label: "Fill to 12+ units", action: { kind: "units", min: 12, max: s.units.max ?? 16 } },
              ],
            },
          });
          lastFlow.current = { flow: "improve", courses: [] };
          return;
        }
        // What the build keeps: the chosen quarter's own courses, This term's or a 4-year plan slot's.
        const t = s.target;
        const kept = t.kind === "plan"
          ? live.current.plannedCourses.filter((p) => p.year === t.slot.year && p.quarter === t.slot.quarter).map((p) => p.course.code)
          : live.current.selectedCourses.map((c) => c.course.code);
        say({
          text: `I'll build ${targetWords(t)} around ${kept.length ? kept.join(", ") : t.kind === "plan" ? "an empty quarter" : "an empty week"}, ${unitsLabel(s.units)}, ${goalRefLabel(s.goal).toLowerCase()}. Change anything first?`,
          followUps: [
            { label: "Build it", action: { kind: "run", flow: "build" }, primary: true },
            { label: "Change settings", action: { kind: "settings" } },
          ],
        });
        lastFlow.current = { flow: "build", courses: [] };
        return;
      }
      case "run":
        if (a.flow === "find") void runFind(s, lastFlow.current?.courses ?? []);
        else void runOptions(s, a.flow);
        return;
      case "goal": {
        const next = { ...s, goal: a.ref };
        setSettings(next);
        const flow = lastFlow.current?.flow ?? "find";
        if (flow === "find") void runFind(next, lastFlow.current?.courses ?? []);
        else void runOptions(next, flow);
        return;
      }
      case "pref": {
        const next = { ...s, preferences: [...new Set([...s.preferences, a.pref])] };
        setSettings(next);
        const flow = lastFlow.current?.flow;
        void runOptions(next, flow === "build" ? "build" : "improve");
        return;
      }
      case "later-start": {
        const base = s.earliestStart ?? 9 * 60;
        const next = { ...s, earliestStart: Math.min(base + 60, 14 * 60) };
        setSettings(next);
        rerun(next);
        if (!lastFlow.current) void runOptions(next, "improve");
        return;
      }
      case "units": {
        const next = { ...s, units: { min: a.min, max: a.max } };
        setSettings(next);
        void runOptions(next, lastFlow.current?.flow === "build" ? "build" : "improve");
        return;
      }
      case "relax": {
        const next = relax(s, a.relaxation);
        setSettings(next);
        rerun(next);
        return;
      }
      case "add-card": {
        const cards = cardsByMessage.current.get(a.messageId);
        const card = cards?.items.find((c) => c.code === a.code);
        if (card && cards) void addCard(card, cards, cards.target, true);
        return;
      }
      case "set": {
        const next = { ...s, ...a.patch };
        setSettings(next);
        const flow = a.flow ?? lastFlow.current?.flow ?? null;
        if (flow === "find") void runFind(next, lastFlow.current?.courses ?? []);
        else if (flow) void runOptions(next, flow);
        return;
      }
      case "more":
        void runFind(s, lastFlow.current?.courses ?? [], seenInFind.current);
        return;
      case "apply": {
        const proposal = live.current.proposals.get(a.proposalId);
        if (proposal) void applyProposal(proposal, "click");
        return;
      }
      case "ops":
        void applyOps(a.ops, a.label, null);
        return;
      case "undo":
        void undo(a.changeId);
        return;
      case "keep": {
        const next = { ...s, keep: [...new Set([...s.keep, a.code])] };
        setSettings(next);
        say({ text: `I'll keep ${a.code} as it is.`, tone: "info" });
        if (lastFlow.current && lastFlow.current.flow !== "find") rerun(next);
        return;
      }
      case "confirm": {
        const waiting = pending.current;
        pending.current = null;
        if (!waiting || !a.yes) { say({ text: "Okay, nothing changed." }); return; }
        const proposal = live.current.proposals.get(waiting.proposalId);
        if (proposal) void applyProposal(proposal, "click");
        return;
      }
      case "settings":
        return; // the page opens its settings drawer
      case "say":
        send(a.text);
        return;
    }
  }, [addCard, applyOps, applyProposal, rerun, runFind, runOptions, say, send, setSettings, undo]);

  // A request typed on /discover arrives once the plan and data are ready.
  const handedOff = useRef(false);
  useEffect(() => {
    if (!ready || handedOff.current) return;
    handedOff.current = true;
    const text = takeHandoff();
    if (text) send(text);
  }, [ready, send]);

  const focusProposal = useCallback((id: string | null) => setPreviewId(id), []);

  // The previewed draft, drawn on the week: its new sections as outlines,
  // the courses it would remove or re-section faded where they are.
  const previewPlan = useMemo(() => {
    const ghosts: CalEvent[] = [];
    const fading = new Set<string>();
    const p = previewId ? proposals.get(previewId) : null;
    if (!p || p.target.kind !== "term" || p.base !== fingerprint) return { ghosts, fading };
    const subs = majorSubjects(selectedMajor);
    for (const op of p.ops) {
      if (op.op === "remove_term") fading.add(op.code);
      if ((op.op === "add_term" || op.op === "set_sections") && op.selection) {
        if (op.op === "set_sections") fading.add(op.code);
        const row = data.row(op.code);
        const rows = selectedSections(groupSections(data.detail(op.code)?.sec ?? []), op.selection);
        const role = row ? roleOf(platRowToCourse(row, subs)) : "elective";
        for (const r of rows) ghosts.push(...eventsForRow({ code: op.code, title: row?.t ?? op.code, role }, r, { ghost: "preview" }));
      }
    }
    return { ghosts, fading };
  }, [previewId, proposals, fingerprint, data, roleOf, selectedMajor]);
  const setFocusCourse = useCallback((code: string | null) => { focusCourse.current = code; }, []);
  const previewProposal = previewId ? proposals.get(previewId) ?? null : null;

  return {
    messages,
    settings,
    busy,
    status,
    model,
    preview: previewProposal ? { proposal: previewProposal } : null,
    proposals,
    fingerprint,
    ready,
    send,
    act,
    setSettings,
    focusProposal,
    focusCourse: setFocusCourse,
    targets,
    previewPlan,
  };
}

export { STARTERS, slotTarget };
