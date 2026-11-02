"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Cloud, CloudCheck, CloudOff, HardDrive, LogIn, RefreshCw } from "lucide-react";
import { retryAccountSync, type SyncStatus } from "@/lib/plan/sync";

/**
 * Whether the plan on screen is saved to the student's account.
 *
 * Quiet when it is — a small grey cloud — and in words whenever it is not,
 * on every screen size, because that is the one state a student needs to
 * know about: a plan that is only on this device will not be on their phone.
 * It used to hide those words on phones and explain only on hover, which a
 * touch screen does not have, and showed nothing at all for an expired
 * session. Now the badge is a button: tapping it explains the state and
 * offers the one thing that helps (try again, or sign in again).
 */

interface Copy {
  icon: typeof Cloud;
  label: string;
  detail: string;
  warn: boolean;
  action?: "retry" | "sign-in";
}

const COPY: Record<SyncStatus, Copy | null> = {
  idle: null,
  loading: {
    icon: Cloud,
    label: "Checking account",
    detail: "Fetching the plan saved to your account.",
    warn: false,
  },
  saving: {
    icon: Cloud,
    label: "Saving",
    detail: "Saving your changes to your account.",
    warn: false,
  },
  synced: {
    icon: CloudCheck,
    label: "Saved to account",
    detail: "Saved to your account. Sign in on any device to pick up where you left off.",
    warn: false,
  },
  offline: {
    icon: CloudOff,
    label: "Saved on this device",
    detail: "Your account couldn't be reached. Your changes are kept in this browser and will be saved to your account when the connection is back.",
    warn: true,
    action: "retry",
  },
  error: {
    icon: CloudOff,
    label: "Not saved",
    detail: "Your account didn't accept this plan, so for now it is only in this browser. Your next change tries again, or try now.",
    warn: true,
    action: "retry",
  },
  unavailable: {
    icon: HardDrive,
    label: "Saved on this device",
    detail: "Saving plans to accounts isn't set up on this server yet, so this plan is only in this browser.",
    warn: true,
  },
  "signed-out": {
    icon: LogIn,
    label: "Sign in again",
    detail: "Your sign-in has expired. Your changes are kept in this browser; sign in again and they'll be saved to your account.",
    warn: true,
    action: "sign-in",
  },
  "storage-full": {
    icon: CloudOff,
    label: "Not saved",
    detail: "This browser's storage is full, so your latest changes aren't kept here or sent to your account. They stay on screen until you close this tab. Clear some site data for other sites, then make a change to save again.",
    warn: true,
  },
  "storage-blocked": {
    icon: CloudOff,
    label: "Not saved",
    detail: "This browser is blocking site storage (a private window, or blocked site data), so this plan can't be kept or saved to your account. Changes stay on screen until you close this tab.",
    warn: true,
  },
};

export default function SyncBadge({ status }: { status: SyncStatus }) {
  const [open, setOpen] = useState(false);
  const panel = useId();
  const box = useRef<HTMLSpanElement>(null);
  const path = usePathname();

  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const copy = COPY[status];
  if (!copy) return null;
  const Icon = copy.icon;
  return (
    <span ref={box} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panel}
        title={copy.detail}
        className={`flex min-h-9 items-center gap-1.5 rounded-lg px-1.5 text-xs font-medium transition hover:bg-gray-100 dark:hover:bg-white/10 ${
          copy.warn ? "text-amber-800 dark:text-amber-300" : "text-gray-500 dark:text-gray-400"
        }`}
      >
        <Icon className="h-4 w-4 shrink-0" aria-hidden />
        {/* Trouble is always in words, phones included; a quiet state is announced but not drawn. */}
        <span className={copy.warn ? "whitespace-nowrap" : "sr-only"}>{copy.label}</span>
      </button>
      {/* A live region only for trouble: announcing "Saving" on every click would drown a screen reader. */}
      {copy.warn && <span role="status" className="sr-only">{copy.label}</span>}
      {open && (
        <span
          id={panel}
          className="absolute right-0 top-full z-50 mt-1 block w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-gray-200 bg-white p-3 text-left text-xs leading-relaxed text-gray-700 shadow-lg dark:border-white/10 dark:bg-[#111a2b] dark:text-gray-200"
        >
          <span className="block font-semibold text-gray-900 dark:text-white">{copy.label}</span>
          <span className="mt-1 block">{copy.detail}</span>
          {copy.action === "retry" && (
            <button
              type="button"
              onClick={() => { retryAccountSync(); setOpen(false); }}
              className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[#182B49] px-3 py-1.5 font-semibold text-white hover:bg-[#1e3a63] dark:bg-[#FFCD00] dark:text-[#182B49]"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Try again now
            </button>
          )}
          {copy.action === "sign-in" && (
            <Link
              href={`/login?next=${encodeURIComponent(path || "/planner")}`}
              className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[#182B49] px-3 py-1.5 font-semibold text-white hover:bg-[#1e3a63] dark:bg-[#FFCD00] dark:text-[#182B49]"
            >
              <LogIn className="h-3.5 w-3.5" aria-hidden /> Sign in again
            </Link>
          )}
        </span>
      )}
    </span>
  );
}
