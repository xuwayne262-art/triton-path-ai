"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Check, ExternalLink, Loader2, RotateCw, Trash2 } from "lucide-react";
import PlatShell from "@/components/plat/PlatShell";
import PageHeader from "@/components/plat/PageHeader";
import { LABEL, PAGE_GAP, PAGE_PAD, SECTION_TITLE } from "@/components/plat/typeScale";
import { loadIndex } from "@/lib/plat";
import type { ParsedHistory } from "@/lib/history/parse";
import { listAttempts, STANDING_LABEL, type Standing } from "@/lib/history/attempts";
import { historyTermName, termOrder } from "@/lib/history/terms";
import { currentAcademicYear, planStartFor, planYearNow } from "@/lib/history/planLayer";
import { announceHistoryChange } from "@/lib/history/events";
import {
  addManualCourse, addManualTransfer, addPaste, cleanGrade, dropUnplaced, editCourse, emptyDraft, hasDraft,
  keepCourse, placeCourse, previewDraft, removeCourse, savePayload, setPlanStart,
  type Draft, type ManualCourse, type ManualTransfer,
} from "@/lib/history/importFlow";
import type { ReadMessage } from "@/lib/history/tss";
import type { ReviewReason } from "@/lib/history/types";
import { todayInSanDiego } from "@/lib/housing/terms";
import { ACADEMIC_HISTORY_HELP_URL, TSS_PORTAL_URL } from "@/lib/links";

/**
 * Import an Academic History by pasting it from TSS (Triton Student System).
 *
 * The record is already on screen in TSS. Downloading it, finding the file
 * and dragging it back are steps that exist only to move that text, and each
 * one is a place a student gives up, especially on a phone.
 *
 * The paste is read here, in the browser, and dropped as soon as it is read:
 * only its courses go into the review, and only the reviewed course list is
 * sent to the server. A paste adds to what is saved; nothing saved is
 * removed unless the student removes it.
 */

type SavedRecord = ParsedHistory & { savedAt?: string };
type SavedState = "loading" | "none" | "saved" | "signedOut" | "failed";
type SavePhase = "idle" | "saving" | "saved" | "deleted";

const REASON_TEXT: Record<ReviewReason, string> = {
  "unknown-grade": "Grade not recognised",
  "points-mismatch": "Grade points don't match the units",
  "no-quarter": "No quarter shown",
  "no-units": "No units shown",
  "conflicting-copies": "Copied twice with different grades",
};

const STANDING_TONE: Record<Standing, string> = {
  "completed": "text-emerald-800 dark:text-emerald-300",
  "in-progress": "text-sky-800 dark:text-sky-300",
  "missing-grade": "text-amber-800 dark:text-amber-200",
  "needs-review": "text-amber-800 dark:text-amber-200",
  "no-credit": "text-gray-600 dark:text-gray-300",
  "withdrawn": "text-gray-600 dark:text-gray-300",
  "incomplete": "text-gray-600 dark:text-gray-300",
};

const BUTTON = "inline-flex items-center gap-2 rounded-lg bg-[#182B49] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1e3a63] disabled:opacity-50 dark:bg-[#FFCD00] dark:text-[#182B49]";
const QUIET_BUTTON = "inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 dark:border-white/15 dark:hover:bg-white/10";
const LINK_BUTTON = "text-xs font-semibold underline underline-offset-2 hover:no-underline";
const FIELD = "rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-white/15 dark:bg-white/5";

const savedDay = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" }) : "";

export default function ImportPage() {
  const today = useMemo(() => todayInSanDiego(), []);
  const [saved, setSaved] = useState<SavedRecord | null>(null);
  const [savedState, setSavedState] = useState<SavedState>("loading");
  const [retries, setRetries] = useState(0);
  const [retrying, setRetrying] = useState(false);

  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editing, setEditing] = useState(false);
  const [typed, setTyped] = useState("");
  const [readNote, setReadNote] = useState<{ level: "ok" | ReadMessage["level"]; text: string } | null>(null);
  const [phase, setPhase] = useState<SavePhase>("idle");
  const [saveError, setSaveError] = useState<{ text: string; signIn?: boolean } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const noteRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  // The catalog, to read "WCWP-010B" as "WCWP 10B" and to mark retired codes.
  // Reading never waits for it: the planner matches codes again when it shows them.
  const catalog = useRef<Set<string> | null>(null);
  useEffect(() => {
    loadIndex().then((idx) => { catalog.current = new Set(idx.courses.map((c) => c.k)); }).catch(() => {});
  }, []);

  // What they saved last time, so the page opens on their record.
  useEffect(() => {
    let live = true;
    fetch("/api/history", { cache: "no-store" })
      .then(async (res) => {
        if (!live) return;
        if (res.status === 204) { setSavedState("none"); return; }
        if (res.status === 401) { setSavedState("signedOut"); return; }
        if (!res.ok) throw new Error(String(res.status));
        const record = (await res.json()) as SavedRecord;
        if (!live) return;
        setSaved(record);
        setSavedState("saved");
      })
      .catch(() => { if (live) setSavedState("failed"); })
      .finally(() => live && setRetrying(false));
    return () => { live = false; };
  }, [retries]);

  const retry = () => { setRetrying(true); setRetries((n) => n + 1); };

  // Focus follows the outcome, once it is on screen: the confirmation after a
  // save or delete, the error after a failed one.
  useEffect(() => { if (phase === "saved" || phase === "deleted") doneRef.current?.focus(); }, [phase]);
  useEffect(() => { if (saveError) errorRef.current?.focus(); }, [saveError]);

  const reviewing = hasDraft(draft) || editing;
  const preview = useMemo(() => previewDraft(saved, draft, today), [saved, draft, today]);

  /** Reads one paste into the review. The text is never stored. */
  function read(text: string) {
    if (!text.trim()) return;
    const has = catalog.current ? (c: string) => catalog.current!.has(c) : null;
    const { draft: next, report, added } = addPaste(draft, text, { today, has });
    setDraft(next);
    setPhase("idle");
    setSaveError(null);
    const lead = report.messages[0];
    if (!added && !next.incoming.transfer.length) {
      setReadNote({ level: "error", text: lead?.text ?? "No courses came through." });
    } else {
      const quarters = new Set([...next.incoming.terms.map((t) => t.code)]).size;
      setReadNote({
        level: "ok",
        text: `Read ${added} ${added === 1 ? "course" : "courses"}${quarters ? ` in ${quarters} ${quarters === 1 ? "quarter" : "quarters"}` : ""}. The pasted text was cleared. Check the review below.`,
      });
    }
    setTimeout(() => noteRef.current?.focus(), 0);
  }

  async function save() {
    setPhase("saving");
    setSaveError(null);
    try {
      const res = await fetch("/api/history", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(savePayload(saved, preview)),
      });
      if (res.status === 409) {
        // Saved elsewhere since this page loaded: the review is rebuilt on that copy, never saved over it.
        const body = (await res.json().catch(() => ({}))) as { current?: SavedRecord | null };
        setSaved(body.current ?? null);
        setSavedState(body.current ? "saved" : "none");
        setPhase("idle");
        setSaveError({ text: "Your saved Academic History changed on another device or tab. The review below now includes it. Check it, then save again." });
        return;
      }
      if (res.status === 401) {
        setPhase("idle");
        setSaveError({ text: "You're signed out, so nothing was saved. Sign in again in a new tab, then come back and press Save. Your review stays here.", signIn: true });
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || "That didn't save.");
      }
      const record = (await res.json()) as SavedRecord;
      setSaved(record);
      setSavedState("saved");
      setDraft(emptyDraft());
      setEditing(false);
      setReadNote(null);
      setPhase("saved");
      announceHistoryChange();
    } catch (err) {
      setPhase("idle");
      setSaveError({ text: `${err instanceof Error ? err.message : "That didn't save."} Nothing was changed. Your review stays here; try again.` });
      setTimeout(() => errorRef.current?.focus(), 0);
    }
  }

  async function remove() {
    setPhase("saving");
    setSaveError(null);
    try {
      const res = await fetch("/api/history", { method: "DELETE" });
      if (res.status === 401) {
        setPhase("idle");
        setSaveError({ text: "You're signed out, so nothing was deleted. Sign in again in a new tab, then try again.", signIn: true });
        return;
      }
      if (!res.ok && res.status !== 204) throw new Error("That didn't delete.");
      setSaved(null);
      setSavedState("none");
      setDraft(emptyDraft());
      setEditing(false);
      setConfirmDelete(false);
      setReadNote(null);
      setPhase("deleted");
      announceHistoryChange();
    } catch (err) {
      setPhase("idle");
      setSaveError({ text: `${err instanceof Error ? err.message : "That didn't delete."} Your saved Academic History is unchanged.` });
    }
  }

  function discard() {
    setDraft(emptyDraft());
    setEditing(false);
    setReadNote(null);
    setSaveError(null);
    setTyped("");
  }

  return (
    <PlatShell>
      <div className={`mx-auto max-w-3xl px-4 sm:px-6 ${PAGE_PAD}`}>
        <PageHeader
          title="Your Academic History"
          description="Paste it from TSS. It's read in this browser, and only the course list is saved to your account, with no name or ID."
        />

        {savedState === "loading" && (
          <p className="mt-6 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking for a saved Academic History…
          </p>
        )}

        {savedState === "none" && !reviewing && phase !== "deleted" && (
          <p className="mt-6 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
            <span className="font-semibold text-gray-900 dark:text-gray-100">No Academic History saved yet.</span>{" "}
            Saving one puts the courses you&rsquo;ve taken and are taking into your{" "}
            <Link href="/planner/four-year" className="font-medium underline underline-offset-2">4-year plan</Link>,
            counts them in degree progress, and checks suggested courses against them. You can delete it at any time.
          </p>
        )}

        {savedState === "signedOut" && (
          <div role="alert" className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-500/30 dark:bg-amber-500/10">
            <p className="text-sm font-bold text-amber-900 dark:text-amber-100">You&rsquo;re signed out</p>
            <p className="mt-1 text-sm text-amber-800 dark:text-amber-200">
              Your sign-in expired, so your saved Academic History can&rsquo;t be shown. Sign in again to see it.
            </p>
            <a href="/login?next=%2Fimport" className={`mt-3 ${BUTTON}`}>Sign in again</a>
          </div>
        )}

        {savedState === "failed" && (
          <div role="alert" className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-5 dark:border-red-500/30 dark:bg-red-500/10">
            <p className="flex items-center gap-2 text-sm font-bold text-red-900 dark:text-red-200">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Couldn&rsquo;t load your saved Academic History
            </p>
            <p className="mt-1 text-sm text-red-800 dark:text-red-300">
              If you saved one, it is still there. This was a problem loading it, on our side, not yours.
              Saving now would add to it, so wait until it loads.
              {retries > 0 && !retrying
                && ` Still not loading after ${retries === 1 ? "a retry" : `${retries} retries`}. If it keeps happening, tell us through Contact in the top bar.`}
            </p>
            <button type="button" onClick={retry} disabled={retrying} className={`mt-3 ${BUTTON}`}>
              {retrying ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCw className="h-4 w-4" />}
              {retrying ? "Retrying…" : "Retry"}
            </button>
          </div>
        )}

        {(phase === "saved" || phase === "deleted") && (
          <div ref={doneRef} tabIndex={-1} role="status" className="mt-6 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900 outline-none dark:bg-emerald-500/10 dark:text-emerald-100">
            <p className="flex items-center gap-2 font-semibold">
              <Check className="h-4 w-4" /> {phase === "saved" ? "Saved." : "Deleted."}
            </p>
            <p className="mt-0.5">
              {phase === "saved"
                ? "Your 4-year plan, degree progress and suggestions now use it."
                : "Its courses are off your 4-year plan, degree progress and suggestions. Courses you planned yourself are still there."}{" "}
              <Link href="/planner/four-year" className="font-semibold underline underline-offset-2">Open your 4-year plan</Link>
            </p>
          </div>
        )}

        <h2 className={`${PAGE_GAP} ${SECTION_TITLE}`}>
          {savedState === "saved" ? "Add newer quarters from TSS" : "Copy it from TSS"}
        </h2>
        <ol className="mt-3 list-decimal space-y-1.5 rounded-xl bg-gray-50 py-4 pl-9 pr-5 text-sm text-gray-700 dark:bg-white/5 dark:text-gray-300">
          <li>
            Open{" "}
            <a href={TSS_PORTAL_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 font-medium underline underline-offset-2">
              TSS
              <ExternalLink aria-hidden className="h-3 w-3" />
              <span className="sr-only"> (Triton Student System, opens in a new tab)</span>
            </a>{" "}
            and choose UCSD SSO.
          </li>
          <li>
            Open My Academic History: the Academic History icon under More Links - Main Campus, or search for
            &ldquo;My Academic History&rdquo;.
          </li>
          <li>In Academic History, choose Undergraduate and By Quarter. Open each quarter you want so its courses show.</li>
          <li>
            Select all and copy: <kbd className="rounded border px-1 text-xs">Ctrl</kbd>/<kbd className="rounded border px-1 text-xs">⌘</kbd>{" "}
            + <kbd className="rounded border px-1 text-xs">A</kbd>, then <kbd className="rounded border px-1 text-xs">C</kbd>. Paste it below.
          </li>
        </ol>
        <p className="mt-2 text-xs leading-relaxed text-gray-600 dark:text-gray-400">
          A copy holds only what TSS has on screen. If a quarter is missing, paste it next: each paste adds to the
          review. UCSD says some late grades and transfer credit aren&rsquo;t in TSS yet (
          <a href={ACADEMIC_HISTORY_HELP_URL} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
            UCSD&rsquo;s Academic History guide<span className="sr-only">, opens in a new tab</span>
          </a>
          ). A copy of the old TritonLink Academic History still works too.
        </p>

        <label htmlFor="history-paste" className="sr-only">Paste your Academic History here</label>
        <textarea
          id="history-paste"
          value={typed}
          onPaste={(e) => {
            // Read straight from the clipboard; the text never enters the page's state.
            const text = e.clipboardData.getData("text/plain");
            if (!text) return;
            e.preventDefault();
            setTyped("");
            read(text);
          }}
          onChange={(e) => setTyped(e.target.value)}
          spellCheck={false}
          placeholder="Paste your Academic History here…"
          className="mt-5 h-32 w-full resize-y rounded-xl border border-gray-300 bg-white p-3 font-mono text-xs leading-relaxed outline-none focus:border-[#182B49] focus:ring-2 focus:ring-[#182B49]/20 dark:border-white/15 dark:bg-white/5 dark:focus:border-[#FFCD00] dark:focus:ring-[#FFCD00]/20"
        />
        {typed.trim() && (
          <div className="mt-2 flex gap-2">
            <button type="button" className={QUIET_BUTTON} onClick={() => { const t = typed; setTyped(""); read(t); }}>
              Read it
            </button>
            <button type="button" className={QUIET_BUTTON} onClick={() => setTyped("")}>Clear</button>
          </div>
        )}

        {readNote && (
          <div
            ref={noteRef}
            tabIndex={-1}
            role={readNote.level === "error" ? "alert" : "status"}
            className={`mt-4 flex items-start gap-2 rounded-lg px-4 py-3 text-sm outline-none ${
              readNote.level === "error"
                ? "bg-red-50 text-red-800 dark:bg-red-500/10 dark:text-red-300"
                : "bg-gray-50 text-gray-700 dark:bg-white/5 dark:text-gray-200"
            }`}
          >
            {readNote.level === "error" ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <Check className="mt-0.5 h-4 w-4 shrink-0" />}
            <span>{readNote.text}</span>
          </div>
        )}

        {reviewing && (
          <Review
            saved={saved}
            draft={draft}
            setDraft={setDraft}
            preview={preview}
            today={today}
            catalog={catalog}
            busy={phase === "saving"}
            onSave={save}
            onDiscard={discard}
            saveError={saveError}
            errorRef={errorRef}
          />
        )}

        {!reviewing && saved && (
          <SavedView
            saved={saved}
            today={today}
            busy={phase === "saving"}
            confirmDelete={confirmDelete}
            setConfirmDelete={setConfirmDelete}
            onEdit={() => { setEditing(true); setPhase("idle"); }}
            onDelete={remove}
            saveError={saveError}
          />
        )}
      </div>
    </PlatShell>
  );
}

/** A row's standing in words, with what needs a look. */
function StatusTag({ standing, review }: { standing: Standing; review?: ReviewReason[] }) {
  return (
    <span className={`text-xs font-semibold ${STANDING_TONE[standing]}`}>
      {STANDING_LABEL[standing]}
      {review?.length ? <span className="font-normal">: {review.map((r) => REASON_TEXT[r]).join("; ")}</span> : null}
    </span>
  );
}

function Stats({ totals }: { totals: ReturnType<typeof previewDraft>["totals"] }) {
  return (
    <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Stat label="Completed" value={`${totals.earnedUnits} units`} />
      <Stat label="In progress" value={`${totals.currentUnits} units`} />
      <Stat label="Need a look" value={String(totals.needsReview + totals.missingGrade)} />
      <Stat label="Transfer credit" value={`${totals.transferUnits} units`} />
    </dl>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 px-3 py-2 dark:border-white/10">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="mt-0.5 text-base font-bold tabular-nums">{value}</dd>
    </div>
  );
}

/** Quarters a row can be placed in: the review's own, and the academic years around today. */
function quarterOptions(draft: Draft, saved: ParsedHistory | null, today: string): string[] {
  const ay = currentAcademicYear(today);
  const set = new Set<string>([...draft.incoming.terms, ...(saved?.terms ?? [])].map((t) => t.code).filter((c) => c !== "XFER"));
  for (let y = ay - 5; y <= ay; y++) {
    const yy = (n: number) => String(n).slice(2);
    for (const c of [`FA${yy(y)}`, `WI${yy(y + 1)}`, `SP${yy(y + 1)}`, `S1${yy(y + 1)}`, `S2${yy(y + 1)}`, `SS${yy(y + 1)}`]) set.add(c);
  }
  if (draft.suggestedTerm) set.add(draft.suggestedTerm);
  return [...set].sort((a, b) => termOrder(b) - termOrder(a));
}

function Review({
  saved, draft, setDraft, preview, today, catalog, busy, onSave, onDiscard, saveError, errorRef,
}: {
  saved: SavedRecord | null;
  draft: Draft;
  setDraft: (d: Draft) => void;
  preview: ReturnType<typeof previewDraft>;
  today: string;
  catalog: React.RefObject<Set<string> | null>;
  busy: boolean;
  onSave: () => void;
  onDiscard: () => void;
  saveError: { text: string; signIn?: boolean } | null;
  errorRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [editingRow, setEditingRow] = useState<string | null>(null);
  const [gradeIn, setGradeIn] = useState("");
  const [unitsIn, setUnitsIn] = useState("");
  const [rowError, setRowError] = useState<string | null>(null);
  const [placing, setPlacing] = useState<Record<number, string>>({});
  const [manual, setManual] = useState<ManualCourse>({ term: "", code: "", title: "", units: "4", grade: "" });
  const [manualError, setManualError] = useState<string | null>(null);
  const [transfer, setTransfer] = useState<ManualTransfer>({ from: "", title: "", units: "", equivalent: "" });
  const [transferError, setTransferError] = useState<string | null>(null);

  const d = preview.diff;
  const attempts = listAttempts(preview.result, today);
  const changeOf = new Map<string, string>();
  for (const a of d.added) changeOf.set(`${a.term}|${a.code}`, "New");
  for (const u of d.updated) changeOf.set(`${u.term}|${u.code}`, `Updated: ${u.changes.join(", ")}`);
  const removals = [...d.removed, ...(draft.mode === "replace" ? d.untouched : [])];
  const ay = currentAcademicYear(today);
  const ayLabel = `${ay}–${String(ay + 1).slice(2)}`;
  const planStart = preview.result.planStart;
  const nowYear = planStart != null ? planYearNow(planStart, today) : null;
  const options = quarterOptions(draft, saved, today);
  const has = () => (catalog.current ? (c: string) => catalog.current!.has(c) : null);

  const startEdit = (term: string, code: string, grade: string | null, units: number) => {
    setEditingRow(`${term}|${code}`);
    setGradeIn(grade ?? "");
    setUnitsIn(String(units || ""));
    setRowError(null);
  };
  const applyEdit = (term: string, code: string) => {
    const g = cleanGrade(gradeIn);
    if (!g.ok) { setRowError("That grade isn't one UCSD uses. Leave it blank if none is shown."); return; }
    const units = Number.parseFloat(unitsIn);
    if (!Number.isFinite(units) || units <= 0 || units > 30) { setRowError("Enter the units, like 4."); return; }
    setDraft(editCourse(draft, saved, term, code, { grade: g.grade, units }, today));
    setEditingRow(null);
  };

  const byTerm = new Map<string, typeof attempts>();
  for (const a of attempts) byTerm.set(a.term, [...(byTerm.get(a.term) ?? []), a]);
  const summary: string[] = [];
  if (!saved) summary.push(`Saving keeps ${preview.totals.courses} ${preview.totals.courses === 1 ? "course" : "courses"} in ${preview.result.terms.length} ${preview.result.terms.length === 1 ? "quarter" : "quarters"}.`);
  else {
    const parts = [
      d.added.length ? `adds ${d.added.length} ${d.added.length === 1 ? "course" : "courses"}` : null,
      d.updated.length ? `updates ${d.updated.length}` : null,
      removals.length ? `removes ${removals.length}` : null,
      d.transferAdded ? `adds ${d.transferAdded} transfer ${d.transferAdded === 1 ? "row" : "rows"}` : null,
    ].filter(Boolean);
    summary.push(parts.length ? `Saving ${parts.join(", ")}.` : "Nothing here changes your saved Academic History yet.");
    if (draft.mode === "merge" && d.untouched.length) summary.push(`It keeps the ${d.untouched.length} saved ${d.untouched.length === 1 ? "course" : "courses"} this paste doesn't mention.`);
  }

  return (
    <section className="mt-12" aria-labelledby="review-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="review-title" className={SECTION_TITLE}>Check it before saving</h2>
        {saved?.savedAt && <p className="text-xs text-gray-600 dark:text-gray-400">Saved copy from {savedDay(saved.savedAt)}</p>}
      </div>

      {draft.report && draft.report.messages.filter((m) => m.level !== "error").length > 0 && (
        <ul className="mt-3 space-y-1.5 rounded-lg bg-amber-50 px-4 py-3 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-100">
          {draft.report.messages.filter((m) => m.level !== "error").map((m, i) => (
            <li key={i} className="flex gap-1.5">
              <AlertTriangle aria-hidden className="mt-0.5 h-3 w-3 shrink-0" />
              {m.text}
            </li>
          ))}
        </ul>
      )}
      {draft.lines.length > 0 && (
        <details className="mt-3 rounded-lg bg-amber-50 px-4 py-3 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
          <summary className="cursor-pointer font-semibold">
            {draft.lines.length} {draft.lines.length === 1 ? "line" : "lines"} could not be read (not saved)
          </summary>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 font-mono">
            {draft.lines.slice(0, 12).map((w, i) => <li key={i} className="break-all">{w}</li>)}
          </ul>
        </details>
      )}

      <Stats totals={preview.totals} />

      <div className="mt-6 space-y-6">
        {[...byTerm.entries()].map(([term, rows]) => (
          <div key={term}>
            <h3 className={LABEL}>{historyTermName(term)}</h3>
            <ul className="mt-2 list-none divide-y divide-gray-100 p-0 dark:divide-white/5">
              {rows.map((a) => {
                const key = a.key;
                const c = a.course;
                const isEditing = editingRow === key;
                return (
                  <li key={key} className="py-2 text-sm">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="w-24 shrink-0 font-mono text-xs font-bold text-[#182B49] dark:text-[#FFCD00]">
                        {c.code}
                      </span>
                      <span className="min-w-0 flex-1 text-gray-700 dark:text-gray-300">
                        {c.title || "Untitled"}
                        {c.src && c.src.replace("-", " ") !== c.code && (
                          <span className="text-xs text-gray-500 dark:text-gray-400"> · printed {c.src}</span>
                        )}
                        {c.unmatched && <span className="text-xs text-gray-500 dark:text-gray-400"> · not in the current catalog</span>}
                      </span>
                      <span className="shrink-0 tabular-nums text-xs text-gray-600 dark:text-gray-400">{c.units} units</span>
                      <span className="w-14 shrink-0 text-right text-xs font-semibold tabular-nums">{c.grade ?? "No grade"}</span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 pl-0 sm:pl-[6.75rem]">
                      <StatusTag standing={a.standing} review={c.review} />
                      {c.cnv && <span className="text-xs text-gray-600 dark:text-gray-400">Converted from the old system</span>}
                      {a.repeated && <span className="text-xs text-gray-600 dark:text-gray-400">Taken more than once; counted once</span>}
                      <span className="text-xs text-gray-600 dark:text-gray-400">{changeOf.get(key) ?? (saved ? "Saved" : "")}</span>
                      <span className="ml-auto flex gap-3">
                        <button type="button" className={LINK_BUTTON} onClick={() => startEdit(a.term, c.code, c.grade, c.units)}>
                          Edit<span className="sr-only"> {c.code}, {historyTermName(term)}</span>
                        </button>
                        <button type="button" className={LINK_BUTTON} onClick={() => setDraft(removeCourse(draft, saved, a.term, c.code))}>
                          Remove<span className="sr-only"> {c.code}, {historyTermName(term)}</span>
                        </button>
                      </span>
                    </div>
                    {isEditing && (
                      <form
                        className="mt-2 flex flex-wrap items-end gap-2 sm:pl-[6.75rem]"
                        onSubmit={(e) => { e.preventDefault(); applyEdit(a.term, c.code); }}
                      >
                        <label className="text-xs">
                          <span className="block text-gray-600 dark:text-gray-400">Grade (blank if none)</span>
                          <input value={gradeIn} onChange={(e) => setGradeIn(e.target.value)} className={`${FIELD} w-20`} autoFocus />
                        </label>
                        <label className="text-xs">
                          <span className="block text-gray-600 dark:text-gray-400">Units</span>
                          <input value={unitsIn} onChange={(e) => setUnitsIn(e.target.value)} inputMode="decimal" className={`${FIELD} w-20`} />
                        </label>
                        <button type="submit" className={QUIET_BUTTON}>Apply</button>
                        <button type="button" className={QUIET_BUTTON} onClick={() => setEditingRow(null)}>Cancel</button>
                        {rowError && <p role="alert" className="basis-full text-xs text-red-700 dark:text-red-300">{rowError}</p>}
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      {draft.unplaced.length > 0 && (
        <div className="mt-6 rounded-xl border border-amber-200 p-4 dark:border-amber-500/30">
          <h3 className={SECTION_TITLE}>Courses with no quarter</h3>
          <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
            The paste didn&rsquo;t say which quarter these were in, so they aren&rsquo;t saved until you pick one.
          </p>
          <ul className="mt-2 space-y-2">
            {draft.unplaced.map((c, i) => (
              <li key={`${c.code}-${i}`} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="w-24 font-mono text-xs font-bold">{c.code}</span>
                <span className="min-w-0 flex-1 text-gray-700 dark:text-gray-300">{c.title}</span>
                <label className="sr-only" htmlFor={`place-${i}`}>Quarter for {c.code}</label>
                <select
                  id={`place-${i}`}
                  value={placing[i] ?? ""}
                  onChange={(e) => setPlacing({ ...placing, [i]: e.target.value })}
                  className={FIELD}
                >
                  <option value="">Choose a quarter</option>
                  {options.map((t) => (
                    <option key={t} value={t}>{historyTermName(t)}{t === draft.suggestedTerm ? " (under way now)" : ""}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className={QUIET_BUTTON}
                  disabled={!placing[i]}
                  onClick={() => { setDraft(placeCourse(draft, i, placing[i], today)); setPlacing({}); }}
                >
                  Place
                </button>
                <button type="button" className={LINK_BUTTON} onClick={() => { setDraft(dropUnplaced(draft, i)); setPlacing({}); }}>
                  Drop
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {removals.length > 0 && (
        <div className="mt-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-900 dark:bg-red-500/10 dark:text-red-200">
          <p className="font-semibold">Saving removes {removals.length} {removals.length === 1 ? "course" : "courses"}</p>
          <ul className="mt-1 space-y-0.5 text-xs">
            {removals.map((r) => (
              <li key={`${r.term}|${r.code}`} className="flex flex-wrap gap-2">
                <span>{r.code}, {historyTermName(r.term)}</span>
                {d.removed.some((x) => x.term === r.term && x.code === r.code) && (
                  <button type="button" className={LINK_BUTTON} onClick={() => setDraft(keepCourse(draft, r.term, r.code))}>
                    Keep it<span className="sr-only">: {r.code}</span>
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <details className="mt-6 text-sm">
        <summary className="cursor-pointer font-semibold">Add a course by hand</summary>
        <form
          className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5"
          onSubmit={(e) => {
            e.preventDefault();
            const r = addManualCourse(draft, manual, today, has());
            setManualError(r.error);
            if (!r.error) { setDraft(r.draft); setManual({ term: manual.term, code: "", title: "", units: "4", grade: "" }); }
          }}
        >
          <label className="col-span-2 text-xs sm:col-span-1">
            <span className="block text-gray-600 dark:text-gray-400">Quarter</span>
            <select value={manual.term} onChange={(e) => setManual({ ...manual, term: e.target.value })} className={`${FIELD} w-full`}>
              <option value="">Choose</option>
              {options.map((t) => <option key={t} value={t}>{historyTermName(t)}</option>)}
            </select>
          </label>
          <label className="text-xs">
            <span className="block text-gray-600 dark:text-gray-400">Course</span>
            <input value={manual.code} onChange={(e) => setManual({ ...manual, code: e.target.value })} placeholder="ECON 110B" className={`${FIELD} w-full`} />
          </label>
          <label className="text-xs">
            <span className="block text-gray-600 dark:text-gray-400">Units</span>
            <input value={manual.units} onChange={(e) => setManual({ ...manual, units: e.target.value })} inputMode="decimal" className={`${FIELD} w-full`} />
          </label>
          <label className="text-xs">
            <span className="block text-gray-600 dark:text-gray-400">Grade (blank if none)</span>
            <input value={manual.grade} onChange={(e) => setManual({ ...manual, grade: e.target.value })} className={`${FIELD} w-full`} />
          </label>
          <div className="flex items-end">
            <button type="submit" className={QUIET_BUTTON}>Add</button>
          </div>
          <label className="col-span-2 text-xs sm:col-span-5">
            <span className="block text-gray-600 dark:text-gray-400">Title (optional)</span>
            <input value={manual.title} onChange={(e) => setManual({ ...manual, title: e.target.value })} className={`${FIELD} w-full`} />
          </label>
          {manualError && <p role="alert" className="col-span-2 text-xs text-red-700 sm:col-span-5 dark:text-red-300">{manualError}</p>}
        </form>
      </details>

      <div className="mt-6">
        <h3 className={LABEL}>Transfer and test credit · {preview.totals.transferUnits} units</h3>
        {preview.result.transfer.length > 0 ? (
          <ul className="mt-2 list-none space-y-1 p-0">
            {preview.result.transfer.map((x, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-2 text-sm">
                <span className="min-w-0 flex-1 text-gray-700 dark:text-gray-300">
                  {x.title}<span className="text-gray-500 dark:text-gray-400"> · {x.from}</span>
                </span>
                <span className="text-xs text-gray-600 dark:text-gray-400">
                  {[x.code, ...x.equivalents].filter(Boolean).join(", ") || "No UCSD course named"}
                </span>
                <span className="tabular-nums text-xs text-gray-600 dark:text-gray-400">{x.units} units</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">None in this review.</p>
        )}
        <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
          Kept apart from UCSD courses. It counts toward no requirement here; your degree audit says how it applies.
        </p>
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer font-semibold">Add transfer or test credit</summary>
          <form
            className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5"
            onSubmit={(e) => {
              e.preventDefault();
              const r = addManualTransfer(draft, transfer);
              setTransferError(r.error);
              if (!r.error) { setDraft(r.draft); setTransfer({ from: "", title: "", units: "", equivalent: "" }); }
            }}
          >
            <label className="text-xs">
              <span className="block text-gray-600 dark:text-gray-400">From</span>
              <input value={transfer.from} onChange={(e) => setTransfer({ ...transfer, from: e.target.value })} placeholder="AP" className={`${FIELD} w-full`} />
            </label>
            <label className="text-xs sm:col-span-2">
              <span className="block text-gray-600 dark:text-gray-400">Course or exam</span>
              <input value={transfer.title} onChange={(e) => setTransfer({ ...transfer, title: e.target.value })} placeholder="Macroeconomics" className={`${FIELD} w-full`} />
            </label>
            <label className="text-xs">
              <span className="block text-gray-600 dark:text-gray-400">Units</span>
              <input value={transfer.units} onChange={(e) => setTransfer({ ...transfer, units: e.target.value })} inputMode="decimal" className={`${FIELD} w-full`} />
            </label>
            <label className="text-xs">
              <span className="block text-gray-600 dark:text-gray-400">UCSD course, if TSS names one</span>
              <input value={transfer.equivalent} onChange={(e) => setTransfer({ ...transfer, equivalent: e.target.value })} placeholder="Leave blank if none" className={`${FIELD} w-full`} />
            </label>
            <div className="col-span-2 sm:col-span-5">
              <button type="submit" className={QUIET_BUTTON}>Add</button>
            </div>
            {transferError && <p role="alert" className="col-span-2 text-xs text-red-700 sm:col-span-5 dark:text-red-300">{transferError}</p>}
          </form>
        </details>
      </div>

      <div className="mt-8 rounded-xl border border-gray-200 p-4 dark:border-white/10">
        <label htmlFor="plan-year-now" className="text-sm font-semibold">Place it in your 4-year plan</label>
        <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">
          Optional. Say which plan year {ayLabel} is, and each course shows in the quarter you took it.
        </p>
        <select
          id="plan-year-now"
          value={nowYear != null ? String(Math.min(Math.max(nowYear, 1), 5)) : ""}
          onChange={(e) => setDraft(setPlanStart(draft, e.target.value ? planStartFor(Number(e.target.value), ay) : null))}
          className={`mt-2 ${FIELD}`}
        >
          <option value="">Not now</option>
          <option value="1">{ayLabel} is Year 1 (Freshman)</option>
          <option value="2">{ayLabel} is Year 2 (Sophomore)</option>
          <option value="3">{ayLabel} is Year 3 (Junior)</option>
          <option value="4">{ayLabel} is Year 4 (Senior)</option>
          <option value="5">{ayLabel} is after Year 4</option>
        </select>
      </div>

      <div className="mt-8 space-y-2 text-sm text-gray-700 dark:text-gray-300">
        {summary.map((s, i) => <p key={i}>{s}</p>)}
        {(preview.reviewRows > 0 || draft.unplaced.length > 0) && (
          <p className="text-amber-900 dark:text-amber-200">
            {preview.reviewRows > 0 && `${preview.reviewRows} ${preview.reviewRows === 1 ? "row needs" : "rows need"} a look. ${preview.reviewRows === 1 ? "It's saved marked Needs review and counts" : "They're saved marked Needs review and count"} toward nothing until fixed. `}
            {draft.unplaced.length > 0 && `${draft.unplaced.length} ${draft.unplaced.length === 1 ? "course has" : "courses have"} no quarter and won't be saved until placed.`}
          </p>
        )}
        {saved && (
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.mode === "replace"}
              onChange={(e) => setDraft({ ...draft, mode: e.target.checked ? "replace" : "merge" })}
              className="mt-1"
            />
            <span>
              Replace my saved Academic History with only what&rsquo;s above
              <span className="block text-xs text-gray-600 dark:text-gray-400">
                Saved quarters this paste doesn&rsquo;t mention are removed. Transfer credit stays.
              </span>
            </span>
          </label>
        )}
      </div>

      {saveError && (
        <div ref={errorRef} tabIndex={-1} role="alert" className="mt-4 flex items-start gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800 outline-none dark:bg-red-500/10 dark:text-red-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {saveError.text}
            {saveError.signIn && (
              <>
                {" "}
                <a href="/login?next=%2Fimport" target="_blank" rel="noopener" className="font-semibold underline underline-offset-2">
                  Sign in again<span className="sr-only"> (opens in a new tab)</span>
                </a>
              </>
            )}
          </span>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <button type="button" onClick={onSave} disabled={busy || !preview.changes || (!preview.result.terms.length && !preview.result.transfer.length)} className={BUTTON}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Save history and update planner
        </button>
        <button type="button" onClick={onDiscard} disabled={busy} className={QUIET_BUTTON}>
          Discard this review
        </button>
      </div>
    </section>
  );
}

function SavedView({
  saved, today, busy, confirmDelete, setConfirmDelete, onEdit, onDelete, saveError,
}: {
  saved: SavedRecord;
  today: string;
  busy: boolean;
  confirmDelete: boolean;
  setConfirmDelete: (v: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
  saveError: { text: string; signIn?: boolean } | null;
}) {
  const preview = previewDraft(saved, emptyDraft(), today);
  const attempts = listAttempts(saved, today);
  const byTerm = new Map<string, typeof attempts>();
  for (const a of attempts) byTerm.set(a.term, [...(byTerm.get(a.term) ?? []), a]);

  return (
    <section className="mt-12" aria-labelledby="saved-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="saved-title" className={SECTION_TITLE}>Your saved Academic History</h2>
        {saved.savedAt && <p className="text-xs text-gray-600 dark:text-gray-400">Saved {savedDay(saved.savedAt)}</p>}
      </div>
      <Stats totals={preview.totals} />
      <div className="mt-6 space-y-6">
        {[...byTerm.entries()].map(([term, rows]) => (
          <div key={term}>
            <h3 className={LABEL}>{term === "XFER" ? "Credit with no term" : historyTermName(term)}</h3>
            <ul className="mt-2 list-none space-y-1 p-0">
              {rows.map((a) => (
                <li key={a.key} className="flex flex-wrap items-baseline gap-x-3 text-sm">
                  <Link href={`/course/${a.course.subject}/${a.course.number}`} className="w-24 shrink-0 font-mono text-xs font-bold text-[#182B49] hover:underline dark:text-[#FFCD00]">
                    {a.course.code}
                  </Link>
                  <span className="min-w-0 flex-1 truncate text-gray-700 dark:text-gray-300">{a.course.title}</span>
                  <span className="shrink-0 tabular-nums text-xs text-gray-600 dark:text-gray-400">{a.course.units} units</span>
                  <span className="w-14 shrink-0 text-right text-xs font-semibold tabular-nums">{a.course.grade ?? "No grade"}</span>
                  <span className="basis-full sm:pl-[6.75rem]"><StatusTag standing={a.standing} review={a.course.review} /></span>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {saved.transfer.length > 0 && (
          <div>
            <h3 className={LABEL}>Transfer and test credit · {preview.totals.transferUnits} units</h3>
            <ul className="mt-2 list-none space-y-1 p-0">
              {saved.transfer.map((x, i) => (
                <li key={i} className="flex items-baseline gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate text-gray-700 dark:text-gray-300">
                    {x.title}<span className="text-gray-500 dark:text-gray-400"> · {x.from}</span>
                  </span>
                  <span className="shrink-0 text-xs text-gray-600 dark:text-gray-400">{[x.code, ...x.equivalents].filter(Boolean).join(", ") || "No UCSD course named"}</span>
                  <span className="shrink-0 tabular-nums text-xs text-gray-600 dark:text-gray-400">{x.units} units</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {saveError && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-500/10 dark:text-red-300">{saveError.text}</p>
      )}

      <div className="mt-8 flex flex-wrap items-center gap-2">
        <button type="button" onClick={onEdit} className={QUIET_BUTTON}>Correct or remove courses</button>
        {!confirmDelete ? (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-white/15 dark:text-red-400 dark:hover:bg-red-500/10"
          >
            <Trash2 className="h-4 w-4" /> Delete my saved Academic History
          </button>
        ) : (
          <div role="group" aria-labelledby="delete-q" className="basis-full rounded-xl border border-red-200 p-4 dark:border-red-500/30">
            <p id="delete-q" className="text-sm font-semibold">Delete your saved Academic History?</p>
            <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">
              Its completed and in-progress courses come off your 4-year plan, degree progress and suggestions.
              Courses you planned yourself stay. This can&rsquo;t be undone, but you can paste it again.
            </p>
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={onDelete} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-red-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Delete it
              </button>
              <button type="button" onClick={() => setConfirmDelete(false)} className={QUIET_BUTTON} autoFocus>Keep it</button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
