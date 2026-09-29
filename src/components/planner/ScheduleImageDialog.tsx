"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, Download, Loader2, Share, X } from "lucide-react";
import {
  imageFileName, layoutImage, paintSchedule, type ScheduleImageInput,
} from "@/lib/scheduleImage";

/**
 * The week as a picture, shown before it is saved.
 *
 * The picture is drawn as soon as this opens, so every button below acts on a
 * file that already exists. That matters on an iPhone: Safari only opens the
 * share sheet — the way to "Save Image" into Photos — from a tap, and drawing
 * the picture after the tap could outlast it.
 */

/** Drawn at twice CSS size, so text stays sharp when zoomed on a phone. */
const SCALE = 2;

const FALLBACK_FONTS = `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;

interface Ready {
  url: string;
  blob: Blob;
  file: File;
  canShare: boolean;
  canCopy: boolean;
}

async function render(input: ScheduleImageInput): Promise<Blob> {
  // The page's own Geist, if next/font put it on the body; loaded explicitly,
  // because a canvas silently falls back when a font has not arrived yet.
  const geist = getComputedStyle(document.body).getPropertyValue("--font-geist-sans").trim();
  const font = geist ? `${geist}, ${FALLBACK_FONTS}` : FALLBACK_FONTS;
  try {
    await Promise.all([
      document.fonts.load(`800 16px ${font}`),
      document.fonts.load(`500 16px ${font}`),
    ]);
  } catch {
    /* Drawn in the fallback font instead. */
  }

  const layout = layoutImage(input);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(layout.width * SCALE);
  canvas.height = Math.round(layout.height * SCALE);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.scale(SCALE, SCALE);
  paintSchedule(ctx, input, layout, font);

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("no image"))), "image/png"),
  );
}

export default function ScheduleImageDialog({
  input, onClose,
}: {
  input: ScheduleImageInput;
  onClose: () => void;
}) {
  const [ready, setReady] = useState<Ready | null>(null);
  const [failed, setFailed] = useState(false);
  const [note, setNote] = useState<{ text: string; ok: boolean } | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const name = imageFileName(input.termName);

  useEffect(() => {
    let live = true;
    let url: string | null = null;
    render(input)
      .then((blob) => {
        if (!live) return;
        url = URL.createObjectURL(blob);
        const file = new File([blob], name, { type: "image/png" });
        let canShare = false;
        try {
          canShare = typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
        } catch {
          canShare = false;
        }
        const canCopy = typeof ClipboardItem !== "undefined" && typeof navigator.clipboard?.write === "function";
        setReady({ url, blob, file, canShare, canCopy });
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [input, name]);

  // Focus moves in, Escape leaves, and focus goes back where it came from —
  // once per opening. Keyed on `onClose`, a caller passing a fresh function
  // each render pulled focus back to Close whenever the planner re-rendered.
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCloseRef.current(); };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      opener?.focus();
    };
  }, []);

  const share = async () => {
    if (!ready) return;
    try {
      await navigator.share({ files: [ready.file], title: `${input.termName} schedule` });
    } catch (err) {
      // Closing the share sheet is a choice, not a failure.
      if (err instanceof DOMException && err.name === "AbortError") return;
      setNote({ text: "Could not open the share sheet — use Download instead.", ok: false });
    }
  };

  const copy = async () => {
    if (!ready) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": ready.blob })]);
      setNote({ text: "Copied — paste it into a message or a note.", ok: true });
    } catch {
      setNote({ text: "This browser would not copy the picture — use Download instead.", ok: false });
    }
  };

  const button =
    "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40";

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4">
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="schedule-image-title"
        className="relative flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-white text-gray-900 shadow-2xl dark:bg-gray-800 dark:text-gray-100 sm:rounded-2xl"
      >
        <div className="flex shrink-0 items-start gap-3 border-b border-gray-200 px-4 py-3 dark:border-white/10">
          <div className="min-w-0 flex-1">
            <h2 id="schedule-image-title" className="text-base font-bold">Your week as a picture</h2>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              Every class Monday to Friday with its time and room, plus your finals — easy to keep on your phone.
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 shrink-0 rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-slate-100 p-3 dark:bg-gray-900">
          {ready ? (
            // eslint-disable-next-line @next/next/no-img-element -- a local blob, nothing to optimise
            <img
              src={ready.url}
              alt={`Your ${input.termName} weekly schedule`}
              className="mx-auto h-auto w-full max-w-[1200px] rounded-lg shadow-sm"
            />
          ) : failed ? (
            <p className="py-16 text-center text-sm text-red-600 dark:text-red-400">
              This browser could not draw the picture. Try again in Chrome or Safari.
            </p>
          ) : (
            <p className="flex items-center justify-center gap-2 py-16 text-sm text-gray-500 dark:text-gray-400">
              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> Drawing your week…
            </p>
          )}
        </div>

        <div className="shrink-0 border-t border-gray-200 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:border-white/10">
          <div className="flex flex-wrap items-center gap-2">
            {ready ? (
              <a
                href={ready.url}
                download={name}
                className={`${button} bg-[#182B49] text-white hover:bg-[#1e3a63] dark:bg-[#FFCD00] dark:text-[#182B49] dark:hover:bg-[#FFD740]`}
              >
                <Download className="h-4 w-4" /> Download PNG
              </a>
            ) : (
              <button type="button" disabled className={`${button} bg-[#182B49] text-white dark:bg-[#FFCD00] dark:text-[#182B49]`}>
                <Download className="h-4 w-4" /> Download PNG
              </button>
            )}
            {ready?.canShare && (
              <button
                type="button"
                onClick={share}
                className={`${button} border border-gray-200 hover:bg-gray-50 dark:border-white/15 dark:hover:bg-white/5`}
              >
                <Share className="h-4 w-4" /> Share or save to Photos
              </button>
            )}
            {ready?.canCopy && (
              <button
                type="button"
                onClick={copy}
                className={`${button} border border-gray-200 hover:bg-gray-50 dark:border-white/15 dark:hover:bg-white/5`}
              >
                <Copy className="h-4 w-4" /> Copy
              </button>
            )}
            {note && (
              <span
                role="status"
                className={`flex items-center gap-1 text-xs ${note.ok ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}
              >
                {note.ok && <Check className="h-3.5 w-3.5" />}
                {note.text}
              </span>
            )}
          </div>
          <p className="mt-2 hidden text-[11px] text-gray-500 pointer-coarse:block dark:text-gray-400">
            On an iPhone, tap <span className="font-semibold">Share or save to Photos</span>, then{" "}
            <span className="font-semibold">Save Image</span> — or press and hold the picture.
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
