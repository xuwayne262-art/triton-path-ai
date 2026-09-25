"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Check, Loader2, Trash2 } from "lucide-react";
import PlatShell from "@/components/plat/PlatShell";
import { isEmpty, parseAcademicHistory, type ParsedHistory } from "@/lib/history/parse";

/**
 * Import an Academic History by pasting it.
 *
 * The record is already on screen on TritonLink. Downloading it as a PDF,
 * finding the file and dragging it back are three steps that exist only to move
 * that text, and each one is a place a student gives up — especially on a
 * phone, where "download then locate the file" often has no good answer.
 * Select-all, copy, paste is the whole flow.
 *
 * The paste is parsed here, in the browser. What leaves this page is the
 * structured result, which carries courses and terms and deliberately carries
 * no name or PID. The raw text is never sent anywhere and is dropped from state
 * the moment it has been read.
 */

type Phase = "idle" | "parsed" | "saving" | "saved" | "error";

export default function ImportPage() {
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<ParsedHistory | null>(null);
  const [saved, setSaved] = useState<ParsedHistory | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  // What they imported last time, so the page opens on their record rather
  // than on an empty box that looks like nothing was ever saved.
  useEffect(() => {
    let live = true;
    fetch("/api/history", { cache: "no-store" })
      .then(async (res) => {
        if (!live) return;
        if (res.status === 204) return;
        if (!res.ok) throw new Error(String(res.status));
        setSaved((await res.json()) as ParsedHistory);
      })
      .catch(() => {
        /* Nothing saved yet is the common case, not an error worth shouting. */
      })
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, []);

  const review = parsed ?? saved;
  const isPreview = parsed != null;

  function read(value: string) {
    setText(value);
    if (!value.trim()) {
      setParsed(null);
      setPhase("idle");
      return;
    }
    const result = parseAcademicHistory(value);
    if (isEmpty(result)) {
      setParsed(null);
      setPhase("error");
      setMessage(
        "That does not look like an Academic History — no terms or transfer credit were found. "
        + "Select the whole page on TritonLink before copying.",
      );
      return;
    }
    setParsed(result);
    setPhase("parsed");
    setMessage("");
  }

  async function save() {
    if (!parsed) return;
    setPhase("saving");
    try {
      const res = await fetch("/api/history", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || "That did not save.");
      }
      setSaved((await res.json()) as ParsedHistory);
      setParsed(null);
      // The transcript text has done its job; keeping it in memory serves
      // nothing and it is the most sensitive thing on this page.
      setText("");
      setPhase("saved");
      setMessage("");
    } catch (err) {
      setPhase("error");
      setMessage(err instanceof Error ? err.message : "That did not save.");
    }
  }

  async function remove() {
    setPhase("saving");
    try {
      const res = await fetch("/api/history", { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error("That did not delete.");
      setSaved(null);
      setParsed(null);
      setText("");
      setPhase("idle");
    } catch (err) {
      setPhase("error");
      setMessage(err instanceof Error ? err.message : "That did not delete.");
    }
  }

  return (
    <PlatShell>
      <div className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-black">Import your Academic History</h1>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-gray-600 dark:text-gray-300">
          Paste it straight from TritonLink — no download, no file to find. Your
          transcript is read in this browser and never uploaded; only the course
          list is saved to your account, and it carries no name or PID.
        </p>

        <ol className="mt-5 list-decimal space-y-1 rounded-xl bg-gray-50 py-4 pl-9 pr-4 text-sm text-gray-700 dark:bg-white/5 dark:text-gray-300">
          <li>
            Open{" "}
            <a
              href="https://act.ucsd.edu/studentAcademicHistory/acadhistStudentMain"
              target="_blank"
              rel="noreferrer noopener"
              className="font-medium underline underline-offset-2"
            >
              Academic History
            </a>{" "}
            on TritonLink.
          </li>
          <li>Select the whole page and copy it — <kbd className="rounded border px-1 text-xs">Ctrl</kbd>/<kbd className="rounded border px-1 text-xs">⌘</kbd> + <kbd className="rounded border px-1 text-xs">A</kbd>, then <kbd className="rounded border px-1 text-xs">C</kbd>.</li>
          <li>Paste it below and check what came through.</li>
        </ol>

        <textarea
          value={text}
          onChange={(e) => read(e.target.value)}
          spellCheck={false}
          aria-label="Paste your Academic History here"
          placeholder="Paste your Academic History here…"
          className="mt-5 h-40 w-full resize-y rounded-xl border border-gray-300 bg-white p-3 font-mono text-xs leading-relaxed outline-none focus:border-[#182B49] focus:ring-2 focus:ring-[#182B49]/20 dark:border-white/15 dark:bg-white/5 dark:focus:border-[#FFCD00] dark:focus:ring-[#FFCD00]/20"
        />

        {phase === "error" && (
          <p className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-800 dark:bg-red-500/10 dark:text-red-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {message}
          </p>
        )}

        {loading && (
          <p className="mt-6 flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking for a saved record…
          </p>
        )}

        {review && (
          <Review
            history={review}
            preview={isPreview}
            phase={phase}
            onSave={save}
            onDelete={remove}
          />
        )}
      </div>
    </PlatShell>
  );
}

function Review({
  history, preview, phase, onSave, onDelete,
}: {
  history: ParsedHistory;
  preview: boolean;
  phase: Phase;
  onSave: () => void;
  onDelete: () => void;
}) {
  const t = history.totals;
  const busy = phase === "saving";

  const programs = useMemo(
    () => [...history.majors, ...history.minors.map((m) => `${m} (minor)`)].join(" · "),
    [history],
  );

  return (
    <section className="mt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">
          {preview ? "What came through" : "Your saved record"}
        </h2>
        {!preview && phase === "saved" && (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
            <Check className="h-3.5 w-3.5" /> Saved
          </span>
        )}
      </div>

      {(history.college || programs) && (
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
          {[history.college, programs].filter(Boolean).join(" · ")}
        </p>
      )}

      <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Courses" value={String(t.courses)} />
        <Stat label="Units earned" value={String(t.unitsEarned)} />
        <Stat label="In progress" value={String(t.unitsInProgress)} />
        <Stat label="GPA" value={t.gpa == null ? "—" : t.gpa.toFixed(2)} />
      </dl>

      {/*
        Anything the parser could not read is shown, not hidden. A student who
        can see the skipped line knows their record is short by exactly that
        much; one who cannot has no way to tell a complete import from a
        partial one.
      */}
      {history.warnings.length > 0 && (
        <div className="mt-4 rounded-lg bg-amber-50 px-3 py-2.5 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
          <p className="font-semibold">
            {history.warnings.length} line{history.warnings.length === 1 ? "" : "s"} could not be read
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 font-mono">
            {history.warnings.slice(0, 6).map((w, i) => (
              <li key={i} className="break-all">{w}</li>
            ))}
          </ul>
          <p className="mt-1.5">Everything else below came through. Add these by hand if they matter.</p>
        </div>
      )}

      <div className="mt-4 space-y-4">
        {history.terms.map((term) => (
          <div key={term.code}>
            <p className="text-xs font-bold uppercase tracking-wide text-gray-400">
              {term.label}
            </p>
            <ul className="mt-1 list-none space-y-0.5 p-0">
              {term.courses.map((c, i) => (
                <li key={`${c.code}-${i}`} className="flex items-baseline gap-2 text-sm">
                  <Link
                    href={`/course/${c.subject}/${c.number}`}
                    className="w-24 shrink-0 font-mono text-xs font-bold text-[#182B49] hover:underline dark:text-[#FFCD00]"
                  >
                    {c.code}
                  </Link>
                  <span className="min-w-0 flex-1 truncate text-gray-700 dark:text-gray-300">{c.title}</span>
                  <span className="shrink-0 tabular-nums text-xs text-gray-400">{c.units}u</span>
                  <span className="w-8 shrink-0 text-right text-xs font-semibold tabular-nums">
                    {c.grade ?? "—"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}

        {history.transfer.length > 0 && (
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-gray-400">
              Transfer credit · {t.transferUnits} units
            </p>
            <ul className="mt-1 list-none space-y-0.5 p-0">
              {history.transfer.map((x, i) => (
                <li key={i} className="flex items-baseline gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate text-gray-700 dark:text-gray-300">
                    {x.title}
                    <span className="text-gray-400"> · {x.from}</span>
                  </span>
                  <span className="shrink-0 text-xs text-gray-400">
                    {x.equivalents.join(", ") || "—"}
                  </span>
                  <span className="shrink-0 tabular-nums text-xs text-gray-400">{x.units}u</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {preview ? (
          <button
            type="button"
            onClick={onSave}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg bg-[#182B49] px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-[#FFCD00] dark:text-[#182B49]"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Save to my account
          </button>
        ) : (
          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-white/15 dark:text-red-400 dark:hover:bg-red-500/10"
          >
            <Trash2 className="h-4 w-4" /> Delete my record
          </button>
        )}
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 px-3 py-2 dark:border-white/10">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</dt>
      <dd className="mt-0.5 text-lg font-black tabular-nums">{value}</dd>
    </div>
  );
}
