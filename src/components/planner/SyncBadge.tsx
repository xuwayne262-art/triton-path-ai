"use client";

import { Cloud, CloudCheck, CloudOff } from "lucide-react";
import type { SyncStatus } from "@/lib/plan/sync";

/**
 * Whether the plan on screen is saved to the student's account.
 *
 * Quiet when it is — a small grey cloud, explained on hover — and in words
 * only when it is not, because that is the one state a student needs to know
 * about: a plan that is only on this device will not be on their phone.
 */

interface Copy {
  icon: typeof Cloud;
  label: string;
  detail: string;
  warn: boolean;
}

const COPY: Record<SyncStatus, Copy | null> = {
  idle: null,
  "signed-out": null,
  loading: {
    icon: Cloud,
    label: "Checking your account",
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
    label: "Saved to your account",
    detail: "Saved to your account. Sign in on any device to pick up where you left off.",
    warn: false,
  },
  offline: {
    icon: CloudOff,
    label: "Not saved yet",
    detail: "Could not reach your account. Your changes are kept on this device and will be saved when the connection is back.",
    warn: true,
  },
  error: {
    icon: CloudOff,
    label: "Not saved",
    detail: "Your account did not accept this plan, so for now it is only on this device. Your next change will try again.",
    warn: true,
  },
  unavailable: {
    icon: CloudOff,
    label: "This device only",
    detail: "Saving plans to accounts is not set up on this server yet, so this plan is only in this browser.",
    warn: true,
  },
};

export default function SyncBadge({ status }: { status: SyncStatus }) {
  const copy = COPY[status];
  if (!copy) return null;
  const Icon = copy.icon;
  return (
    <span
      // A live region only for trouble: announcing "Saving" on every click would drown a screen reader.
      role={copy.warn ? "status" : undefined}
      title={copy.detail}
      className={`flex shrink-0 items-center gap-1.5 px-1 text-xs font-medium ${
        copy.warn ? "text-amber-700 dark:text-amber-400" : "text-gray-400 dark:text-gray-500"
      }`}
    >
      <Icon className="h-4 w-4" aria-hidden />
      <span className={copy.warn ? "sr-only sm:not-sr-only" : "sr-only"}>{copy.label}</span>
    </span>
  );
}
