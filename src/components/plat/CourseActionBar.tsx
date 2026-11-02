"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarPlus, CheckCircle2, LogIn, Undo2 } from "lucide-react";
import type { SyncStatus } from "@/lib/plan/sync";

/** What happened after "Add", and what can be done about it. */
export interface AddedState {
  code: string;
  label: string;
  undone: boolean;
}

/** The save status in words, the same vocabulary as the Planner's badge. */
export function saveWords(status: SyncStatus): string {
  switch (status) {
    case "synced": return "Saved to your account.";
    case "saving":
    case "loading": return "Saving to your account…";
    case "offline":
    case "unavailable": return "Saved on this device; it will reach your account when it can.";
    case "signed-out": return "Saved on this device. Sign in again to save it to your account.";
    case "storage-full":
    case "storage-blocked":
    case "error": return "Not saved yet. Open the Planner to try again.";
    default: return "Saved on this device.";
  }
}

/** "Added CSE 11 to Fall 2026. Saved to your account. View plan · Undo" */
export function AddedNotice({ added, status, onUndo, compact = false }: {
  added: AddedState;
  status: SyncStatus;
  onUndo: () => void;
  compact?: boolean;
}) {
  return (
    <div role="status" className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${compact ? "text-xs" : "text-sm"}`}>
      <span className="inline-flex items-start gap-1.5">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400" aria-hidden />
        <span>
          {added.undone ? `Undone: ${added.code} is as it was.` : `${added.label}.`}{" "}
          {!added.undone && <span className="text-gray-600 dark:text-gray-400">{saveWords(status)}</span>}
        </span>
      </span>
      <span className="inline-flex items-center gap-3">
        <Link href="/planner" className="inline-flex min-h-9 items-center font-semibold text-[#182B49] underline underline-offset-2 dark:text-[#FFCD00]">View plan</Link>
        {!added.undone && (
          <button type="button" onClick={onUndo} className="inline-flex min-h-9 items-center gap-1 font-semibold text-gray-700 underline underline-offset-2 dark:text-gray-300">
            <Undo2 className="h-3.5 w-3.5" aria-hidden /> Undo
          </button>
        )}
      </span>
    </div>
  );
}

/**
 * The course page's one action, kept in reach on a phone: a bar at the
 * bottom with what is chosen and the button that adds it. It sits above the
 * home indicator (safe-area inset), leaves room under the page so it never
 * covers the last of it, and steps aside while a text field has focus, so it
 * never sits on the software keyboard. Adding to UCSDPlans is not enrolling:
 * "Open in TSS" stays on the page, separate.
 */
export default function CourseActionBar({
  recap, label, disabled, signedOut, onAdd, added, status, onUndo, problem,
}: {
  recap: string;
  label: string;
  disabled: boolean;
  signedOut: boolean;
  onAdd: () => void;
  added: AddedState | null;
  status: SyncStatus;
  onUndo: () => void;
  problem: string;
}) {
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    const field = (el: EventTarget | null) => el instanceof HTMLElement && el.matches("input, textarea, select, [contenteditable=true]");
    const on = (e: FocusEvent) => setTyping(field(e.target));
    const off = () => setTyping(field(document.activeElement));
    document.addEventListener("focusin", on);
    document.addEventListener("focusout", off);
    return () => { document.removeEventListener("focusin", on); document.removeEventListener("focusout", off); };
  }, []);

  return (
    <>
      {/* Room for the bar, so the end of the page is never under it. */}
      <div aria-hidden className="h-28 lg:hidden" />
      <div
        className={`fixed inset-x-0 bottom-0 z-30 border-t border-gray-200 bg-white/95 px-4 pt-2.5 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] backdrop-blur lg:hidden dark:border-white/10 dark:bg-[#0d1420]/95 ${typing ? "hidden" : ""}`}
        style={{ paddingBottom: "max(0.625rem, env(safe-area-inset-bottom))" }}
      >
        {added ? (
          <AddedNotice added={added} status={status} onUndo={onUndo} compact />
        ) : (
          <div className="flex items-center gap-3">
            <p className="min-w-0 flex-1 text-xs leading-snug text-gray-700 dark:text-gray-300">{recap}</p>
            <button
              type="button"
              onClick={onAdd}
              disabled={disabled}
              className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg bg-[#182B49] px-3.5 text-sm font-semibold text-white disabled:bg-gray-200 disabled:text-gray-600 dark:bg-[#FFCD00] dark:text-[#182B49] dark:disabled:bg-white/10 dark:disabled:text-gray-400"
            >
              {signedOut ? <LogIn className="h-4 w-4" aria-hidden /> : <CalendarPlus className="h-4 w-4" aria-hidden />}
              {label}
            </button>
          </div>
        )}
        {problem && <p role="alert" className="mt-1.5 text-xs text-red-800 dark:text-red-300">{problem}</p>}
      </div>
    </>
  );
}
