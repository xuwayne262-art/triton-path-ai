"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, Info, RotateCcw, TriangleAlert } from "lucide-react";
import type { Settings } from "@/lib/planAi/conversation";
import type { Proposal } from "@/lib/planAi/types";
import CourseCardView from "./CourseCardView";
import ProposalView from "./ProposalView";
import type { Action, ChatMessage, Choice } from "./types";

/**
 * One turn of the conversation. A student's words on the right; an answer
 * on the left as a short line or two, then whatever carries the substance:
 * course cards, options, a question with its answers, a saved change with
 * its Undo. No avatars, no typing delay: the answer is shown when it is
 * ready, and the work in between is named while it happens.
 */

function ChoiceButtons({ choices, act, disabled }: { choices: Choice[]; act: (a: Action) => void; disabled: boolean }) {
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {choices.map((c, i) => (
        <button
          key={`${c.label}-${i}`}
          type="button"
          disabled={disabled}
          onClick={() => act(c.action)}
          className={`inline-flex min-h-9 items-center rounded-full border px-3 text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
            c.primary
              ? "border-[#182B49] bg-[#182B49] text-white hover:bg-[#243f66] focus-visible:outline-[#182B49] dark:border-[#FFCD00] dark:bg-[#FFCD00] dark:text-[#182B49] dark:focus-visible:outline-[#FFCD00]"
              : "border-gray-300 bg-white text-gray-800 hover:border-[#0f6e7a] hover:text-[#0f6e7a] focus-visible:outline-[#0f6e7a] dark:border-white/20 dark:bg-white/5 dark:text-gray-100 dark:hover:border-[#5fd0dc] dark:hover:text-[#5fd0dc]"
          }`}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}

export default function MessageView({
  message, act, busy, fingerprint, proposals, settings, previewId, onPreview, onFocusCourse,
}: {
  message: ChatMessage;
  act: (a: Action) => void;
  busy: boolean;
  fingerprint: string;
  proposals: Map<string, Proposal>;
  settings: Settings | null;
  previewId: string | null;
  onPreview: (id: string | null) => void;
  onFocusCourse: (code: string | null) => void;
}) {
  const [more, setMore] = useState(false);
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-[#182B49] px-3.5 py-2 text-sm text-white dark:bg-white/15">
          <span className="sr-only">You said: </span>{message.text}
        </p>
      </div>
    );
  }
  const m = message;
  const Icon = m.tone === "error" ? TriangleAlert : m.tone === "success" ? CheckCircle2 : m.tone === "info" ? Info : null;
  const stale = (base: string) => base !== fingerprint;
  return (
    <div className="max-w-full">
      {m.text && (
        <p className={`flex gap-2 text-sm leading-relaxed ${m.tone === "error" ? "text-red-800 dark:text-red-300" : "text-gray-900 dark:text-gray-100"}`}>
          {Icon && <Icon aria-hidden className={`mt-0.5 h-4 w-4 shrink-0 ${m.tone === "success" ? "text-green-700 dark:text-green-400" : m.tone === "error" ? "text-red-700 dark:text-red-400" : "text-[#0f6e7a] dark:text-[#5fd0dc]"}`} />}
          <span>{m.text}</span>
        </p>
      )}
      {m.notes && m.notes.filter(Boolean).length > 0 && (
        <ul className="mt-1.5 space-y-0.5 text-xs leading-relaxed text-gray-600 dark:text-gray-400">
          {m.notes.filter(Boolean).map((n, i) => <li key={i}>{n}</li>)}
        </ul>
      )}

      {m.receipt && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {m.receipt.kind === "apply" && !m.receipt.undone && (
            <button type="button" disabled={busy} onClick={() => act({ kind: "undo", changeId: m.receipt!.changeId })}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-gray-300 px-3 text-xs font-semibold text-gray-800 transition hover:bg-gray-50 disabled:opacity-50 dark:border-white/20 dark:text-gray-100 dark:hover:bg-white/5">
              <RotateCcw aria-hidden className="h-3.5 w-3.5" />
              Undo
            </button>
          )}
          {m.receipt.undone && <span className="text-xs text-gray-600 dark:text-gray-400">Undone</span>}
          <Link href={m.receipt.where === "plan" ? "/planner/four-year" : "/planner"} className="text-xs font-semibold text-[#0f6e7a] underline underline-offset-2 dark:text-[#5fd0dc]">
            {m.receipt.where === "plan" ? "Open 4-year plan" : "Open This term"}
          </Link>
        </div>
      )}

      {m.question && (
        <div className="mt-1">
          {m.question.note && <p className="text-xs text-gray-600 dark:text-gray-400">{m.question.note}</p>}
          <ChoiceButtons choices={m.question.choices} act={act} disabled={busy} />
          {m.question.more && m.question.more.length > 0 && (
            more
              ? <ChoiceButtons choices={m.question.more} act={act} disabled={busy} />
              : <button type="button" onClick={() => setMore(true)} className="mt-2 min-h-9 text-xs font-semibold text-[#0f6e7a] underline underline-offset-2 dark:text-[#5fd0dc]">Programs with their own course lists ({m.question.more.length})</button>
          )}
        </div>
      )}

      {m.cards && m.cards.items.length > 0 && (
        <div className="mt-3 space-y-3">
          {m.cards.items.map((card) => (
            <CourseCardView
              key={card.code}
              card={card}
              disabled={busy}
              onFocus={onFocusCourse}
              action={stale(m.cards!.base)
                ? { label: "Update", run: () => act({ kind: "run", flow: "find" }) }
                : { label: m.cards!.target.kind === "plan" ? `Add to ${m.cards!.target.slot.quarter}` : "Add to plan", run: () => act({ kind: "add-card", messageId: m.id, code: card.code }) }}
            />
          ))}
          {stale(m.cards.base) && <p className="text-xs text-amber-800 dark:text-amber-200">Your plan changed since these were found, so they&rsquo;ll be checked again before anything is added.</p>}
        </div>
      )}

      {m.options && m.options.ids.length > 0 && (
        <div className="mt-3 space-y-3">
          {m.options.ids.map((id, i) => {
            const p = proposals.get(id);
            if (!p) return null;
            return (
              <ProposalView
                key={id}
                proposal={p}
                index={i}
                settings={settings}
                stale={stale(p.base)}
                previewing={previewId === id}
                busy={busy}
                onApply={() => act({ kind: "apply", proposalId: id })}
                onUpdate={() => act({ kind: "run", flow: p.removes.length || p.resections.length ? "improve" : "build" })}
                onPreview={() => onPreview(previewId === id ? null : id)}
              />
            );
          })}
        </div>
      )}

      {m.followUps && m.followUps.length > 0 && <ChoiceButtons choices={m.followUps} act={act} disabled={busy} />}
    </div>
  );
}
