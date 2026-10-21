"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, LoaderCircle, MessagesSquare, SlidersHorizontal } from "lucide-react";
import { usePlanner } from "@/app/planner/PlannerProvider";
import { useMediaQuery } from "@/components/planner/useMediaQuery";
import { loadGE, type GEFile } from "@/lib/plat";
import { goalRefLabel, timeLabel, unitsLabel } from "@/lib/planAi/conversation";
import { targetOptions } from "@/lib/planAi/terms";
import { collegeKey } from "@/lib/planAi/vocabulary";
import MessageView from "./MessageView";
import PlanPanel from "./PlanPanel";
import SettingsDrawer, { type SettingsField } from "./SettingsDrawer";
import { STARTERS, usePlanAi } from "./usePlanAi";
import type { Action } from "./types";

/**
 * Plan with AI: a conversation beside the live plan.
 *
 * About four tenths conversation and six tenths plan on a laptop, at most
 * 1360px wide; one pane at a time below 1024px, switched from a bar that
 * keeps the plan's units and the draft in view. The composer stays put
 * under the conversation, never over it. The plan is the Planner's own —
 * the same provider, the same saved record — so a change made here is on
 * This term and the 4-year plan the moment the account has it.
 */

const COMPOSER_PLACEHOLDER = "Keep my current courses and find a GE after 10 a.m.";

export default function PlanWithAI() {
  const ai = usePlanAi();
  const { selectedCourses, selectedCollege, totalUnits } = usePlanner();
  const narrow = useMediaQuery("(max-width: 1023.98px)");
  const phone = useMediaQuery("(max-width: 767.98px)");
  const [pane, setPane] = useState<"chat" | "plan">("chat");
  const [drawer, setDrawer] = useState<{ open: boolean; field: SettingsField }>({ open: false, field: null });
  const [text, setText] = useState("");
  const [ge, setGe] = useState<GEFile | null>(null);
  const [disclosure, setDisclosure] = useState(false);
  const log = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { loadGE().then(setGe).catch(() => {}); }, []);

  // New messages scroll into view; a student reading back is not dragged down by a progress line alone.
  const count = ai.messages.length;
  useEffect(() => {
    const el = log.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ top: el.scrollHeight, behavior: reduce ? "auto" : "smooth" });
  }, [count]);

  const act = (a: Action) => {
    if (a.kind === "settings") { setDrawer({ open: true, field: null }); return; }
    ai.act(a);
  };
  const submit = () => {
    const t = text.trim();
    if (!t || ai.busy || !ai.ready) return;
    ai.send(t);
    setText("");
  };

  const settings = ai.settings;
  const preview = ai.preview?.proposal ?? null;
  const draftAdds = preview && preview.base === ai.fingerprint ? preview.adds.length : 0;
  // Whether the plan itself is saved is the planner bar's to say; this says what is only a draft.
  const draftLabel = preview && preview.base === ai.fingerprint
    ? `Draft: ${[draftAdds ? `+${draftAdds}` : "", preview.removes.length ? `−${preview.removes.length}` : "", preview.resections.length ? `${preview.resections.length} re-sectioned` : ""].filter(Boolean).join(" ") || "no change"}, not saved`
    : ai.busy === "Saving to your plan" ? "Saving…" : "";
  const options = ai.targets.datasetTerm ? targetOptions(ai.targets) : [];
  const chips: { field: SettingsField; label: string; value: string }[] = settings ? [
    { field: "target", label: "Quarter", value: settings.target.label },
    { field: "units", label: "Units", value: unitsLabel(settings.units) },
    { field: "time", label: "Time", value: timeLabel(settings) },
    { field: "goal", label: "Goal", value: goalRefLabel(settings.goal) },
  ] : [];
  const showChat = !narrow || pane === "chat";
  const showPlan = !narrow || pane === "plan";

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-gray-200 bg-white dark:border-white/10 dark:bg-gray-800">
        <div className="mx-auto flex w-full max-w-[1360px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-[#182B49] dark:text-white">
            <MessagesSquare aria-hidden className="h-4 w-4 text-[#0f6e7a] dark:text-[#5fd0dc]" />
            Plan with AI
          </h1>
          {settings && options.length > 0 && (
            <label className="flex min-w-0 items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
              <span className="max-sm:sr-only">Quarter</span>
              <select
                value={options.findIndex((o) => o.label === settings.target.label)}
                onChange={(e) => ai.setSettings({ ...settings, target: options[Number(e.target.value)] })}
                className="h-9 max-w-[16rem] rounded-lg border border-gray-300 bg-white px-2 text-xs font-semibold text-gray-900 focus-visible:outline-2 focus-visible:outline-[#0f6e7a] dark:border-white/15 dark:bg-gray-900 dark:text-gray-100"
              >
                {options.map((o, i) => <option key={o.label} value={i}>{o.kind === "term" ? `${o.label} (sections)` : o.label}</option>)}
              </select>
            </label>
          )}
          <p className="ml-auto text-xs text-gray-700 dark:text-gray-300" aria-live="polite">{draftLabel}</p>
        </div>
        {narrow && (
          <div role="tablist" aria-label="Plan with AI views" className="mx-auto flex w-full max-w-[1360px] gap-1 px-4 pb-2">
            {(["chat", "plan"] as const).map((id) => (
              <button key={id} type="button" role="tab" aria-selected={pane === id} onClick={() => setPane(id)}
                className={`min-h-10 flex-1 rounded-lg text-sm font-semibold transition ${
                  pane === id ? "bg-[#182B49] text-white dark:bg-[#FFCD00] dark:text-[#182B49]" : "bg-gray-100 text-gray-700 dark:bg-white/5 dark:text-gray-200"
                }`}>
                {id === "chat" ? "Chat" : <>Plan <span className="font-normal">· {preview && draftAdds ? `${preview.after.units}` : totalUnits} units{draftAdds ? ` · draft +${draftAdds}` : ""}</span></>}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mx-auto flex min-h-0 w-full max-w-[1360px] flex-1 lg:gap-4 lg:p-4">
        {/* ── Conversation ─────────────────────────────────────────────────── */}
        <section
          aria-label="Conversation"
          className={`min-h-0 flex-col bg-white dark:bg-gray-800 lg:w-[40%] lg:min-w-[340px] lg:rounded-xl lg:border lg:border-gray-200 lg:dark:border-white/10 ${showChat ? "flex w-full" : "hidden"}`}
        >
          {settings && (
            <div className="flex shrink-0 flex-wrap gap-1.5 border-b border-gray-100 px-4 py-2.5 dark:border-white/10">
              {chips.map((c) => (
                <button key={c.label} type="button" onClick={() => setDrawer({ open: true, field: c.field })}
                  className="inline-flex min-h-8 max-w-full items-center gap-1 rounded-full border border-gray-200 px-2.5 text-xs text-gray-800 transition hover:border-[#0f6e7a] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#0f6e7a] dark:border-white/15 dark:text-gray-100 dark:hover:border-[#5fd0dc]"
                  aria-label={`${c.label}: ${c.value}. Change`}>
                  <span className="text-gray-600 dark:text-gray-400">{c.label}</span>
                  <span className="truncate font-semibold">{c.value}</span>
                </button>
              ))}
              <button type="button" onClick={() => setDrawer({ open: true, field: null })}
                className="inline-flex min-h-8 items-center gap-1 rounded-full px-2 text-xs font-semibold text-[#0f6e7a] hover:underline dark:text-[#5fd0dc]">
                <SlidersHorizontal aria-hidden className="h-3.5 w-3.5" />More
              </button>
            </div>
          )}

          <div ref={log} role="log" aria-live="off" aria-label="Messages" className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-5">
            {ai.messages.length === 0 ? (
              <div className="mx-auto max-w-sm py-8 text-center">
                <h2 className="text-lg font-semibold tracking-tight text-[#182B49] dark:text-white">Build a quarter that works for you.</h2>
                <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-300">Plan around your requirements, your schedule, and the courses you want.</p>
                <div className="mt-6 flex flex-col gap-2">
                  {STARTERS.filter((s) => !(s.action.kind === "start" && s.action.flow === "improve" && !selectedCourses.length)).map((s) => (
                    <button key={s.label} type="button" disabled={!ai.ready || Boolean(ai.busy)} onClick={() => act(s.action)}
                      className="min-h-11 rounded-xl border border-gray-200 bg-white px-4 text-sm font-semibold text-[#182B49] transition hover:border-[#0f6e7a] hover:text-[#0f6e7a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f6e7a] disabled:opacity-50 dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:border-[#5fd0dc] dark:hover:text-[#5fd0dc]">
                      {s.label}
                    </button>
                  ))}
                </div>
                {!ai.ready && <p className="mt-4 text-xs text-gray-600 dark:text-gray-400">Loading your plan and course data…</p>}
              </div>
            ) : (
              ai.messages.map((m) => (
                <MessageView
                  key={m.id}
                  message={m}
                  act={act}
                  busy={Boolean(ai.busy)}
                  fingerprint={ai.fingerprint}
                  proposals={ai.proposals}
                  settings={settings}
                  previewId={preview?.id ?? null}
                  onPreview={(id) => { ai.focusProposal(id); if (id && narrow) setPane("plan"); }}
                  onFocusCourse={ai.focusCourse}
                />
              ))
            )}
            {ai.busy && (
              <p className="flex items-center gap-2 text-xs font-medium text-gray-700 dark:text-gray-300">
                <LoaderCircle aria-hidden className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
                {ai.busy}…
              </p>
            )}
          </div>

          {/* ── Composer ───────────────────────────────────────────────────── */}
          <form className="shrink-0 border-t border-gray-100 px-4 pb-3 pt-3 dark:border-white/10" onSubmit={(e) => { e.preventDefault(); submit(); }}>
            <label htmlFor="plan-ai-input" className="sr-only">Ask Plan with AI</label>
            <div className="flex items-end gap-2 rounded-xl border border-gray-300 bg-white p-1.5 focus-within:border-[#0f6e7a] focus-within:ring-1 focus-within:ring-[#0f6e7a] dark:border-white/15 dark:bg-gray-900 dark:focus-within:border-[#5fd0dc] dark:focus-within:ring-[#5fd0dc]">
              <textarea
                id="plan-ai-input"
                ref={composer}
                value={text}
                rows={1}
                maxLength={400}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); } }}
                placeholder={COMPOSER_PLACEHOLDER}
                aria-describedby="plan-ai-disclosure"
                className="max-h-32 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-base outline-none placeholder:text-gray-500 sm:text-sm dark:placeholder:text-gray-400"
              />
              <button type="submit" disabled={!text.trim() || Boolean(ai.busy) || !ai.ready} aria-label="Send"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#182B49] text-white transition hover:bg-[#243f66] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#182B49] disabled:cursor-not-allowed disabled:opacity-40 dark:bg-[#FFCD00] dark:text-[#182B49]">
                <ArrowUp aria-hidden className="h-4 w-4" />
              </button>
            </div>
            <p id="plan-ai-disclosure" className="mt-2 text-[11px] leading-relaxed text-gray-600 dark:text-gray-400">
              {ai.model === false
                ? "AI chat is off right now. Buttons and simple commands like \"add CSE 11\" or \"undo\" still work."
                : "Requests the planner can't read itself go to Google Gemini. Your plan and Academic History stay here. Leave out personal details. "}
              {ai.model !== false && (
                <button type="button" onClick={() => setDisclosure((v) => !v)} aria-expanded={disclosure} className="font-semibold underline underline-offset-2">Details</button>
              )}
            </p>
            {disclosure && ai.model !== false && (
              <p className="mt-1.5 text-[11px] leading-relaxed text-gray-600 dark:text-gray-400">
                Only the words you type are sent, and only when needed. Your plan, grades, Academic History, name and email never are. Buttons and commands like &quot;add CSE 11&quot; never use it. On Google&rsquo;s free tier, Google may use requests to improve its products, and people may review them. There&rsquo;s a daily limit per student and for the site. Plan with AI changes your UCSDPlans plan only. It doesn&rsquo;t enroll you at UCSD.
              </p>
            )}
          </form>
        </section>

        {/* ── Plan ─────────────────────────────────────────────────────────── */}
        <div className={`min-h-0 flex-col bg-slate-100 dark:bg-gray-900 lg:w-[60%] lg:rounded-xl lg:border lg:border-gray-200 lg:bg-slate-50 lg:dark:border-white/10 lg:dark:bg-gray-800/60 ${showPlan ? "flex w-full" : "hidden"}`}>
          <PlanPanel settings={settings} preview={preview && preview.base === ai.fingerprint ? preview : null} ghosts={ai.previewPlan.ghosts} fading={ai.previewPlan.fading} phone={phone} />
        </div>
      </div>

      {settings && drawer.open && (
        <SettingsDrawer
          field={drawer.field}
          settings={settings}
          targets={ai.targets}
          ge={ge}
          college={collegeKey(selectedCollege)}
          scheduled={selectedCourses.map((s) => s.course.code)}
          onClose={() => setDrawer({ open: false, field: null })}
          onSave={(s) => ai.setSettings(s)}
        />
      )}

      {/* Save results and errors, announced as they happen. */}
      <div role="status" aria-live="polite" className="sr-only">{ai.status}</div>
    </div>
  );
}
