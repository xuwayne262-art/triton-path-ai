"use client";

import { useEffect, useRef, useState } from "react";
import { Popover } from "radix-ui";
import { ArrowUpRight, Check, Copy, Instagram, Mail } from "lucide-react";

/** Who made UCSDPlans, and how to reach them. */
export const INSTAGRAM_HANDLE = "hereswaynex";
export const INSTAGRAM_URL = `https://www.instagram.com/${INSTAGRAM_HANDLE}/`;
export const CONTACT_EMAIL = "xuwayne262@gmail.com";

/**
 * "Contact" in the top bar: Instagram and email behind one quiet button.
 *
 * It lives in the bar rather than on the home page so it is one click away on
 * every page, and it is one button rather than two so a phone's bar keeps its
 * room for the search. The address can be copied as well as opened: a mailto
 * link does nothing on a laptop with no mail app set up, which is most of them.
 */
export default function ContactMenu({
  className = "",
  iconOnly = false,
}: {
  className?: string;
  /** Never show the "Contact" label, for a bar with no room to spare. */
  iconOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(CONTACT_EMAIL);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard refused (an old browser, or no permission): the address is
      // on screen to select by hand, which is what this was saving.
    }
  };

  const row =
    "group flex items-center gap-3 rounded-xl px-2.5 py-2 transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFCD00] dark:hover:bg-white/5";

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label="Contact the maker of UCSDPlans"
          title="Contact · Instagram and email"
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg p-2 text-sm font-medium text-gray-600 transition hover:bg-gray-100 hover:text-gray-900 data-[state=open]:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white dark:data-[state=open]:bg-white/10 ${iconOnly ? "" : "lg:px-3 lg:py-1.5"} ${className}`}
        >
          <Instagram className="h-4 w-4 shrink-0" />
          {!iconOnly && <span className="hidden lg:inline">Contact</span>}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          collisionPadding={12}
          className="z-50 w-[min(19rem,calc(100vw-1.5rem))] rounded-2xl border border-gray-200 bg-white p-2 text-gray-900 shadow-xl outline-none dark:border-white/10 dark:bg-[#101a2b] dark:text-gray-100"
        >
          <div className="px-2.5 pb-2 pt-1.5">
            <p className="text-sm font-bold">
              Made by <span className="text-[#182B49] dark:text-[#FFCD00]">@{INSTAGRAM_HANDLE}</span>
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
              Found a bug, or have an idea? Say hi.
            </p>
          </div>

          <a
            href={INSTAGRAM_URL}
            target="_blank"
            rel="noreferrer noopener"
            onClick={() => setOpen(false)}
            className={row}
          >
            <span
              aria-hidden
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#feda75] via-[#d62976] to-[#4f5bd5] text-white"
            >
              <Instagram className="h-[18px] w-[18px]" />
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block text-sm font-semibold">Connect on Instagram</span>
              <span className="block truncate text-xs text-gray-500 dark:text-gray-400">@{INSTAGRAM_HANDLE}</span>
            </span>
            <ArrowUpRight className="h-4 w-4 shrink-0 text-gray-400 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>

          <div className="flex items-center gap-1">
            <a
              href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("UCSDPlans")}`}
              onClick={() => setOpen(false)}
              className={`${row} min-w-0 flex-1`}
            >
              <span
                aria-hidden
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#182B49] text-white dark:bg-[#FFCD00] dark:text-[#182B49]"
              >
                <Mail className="h-[18px] w-[18px]" />
              </span>
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block text-sm font-semibold">Email</span>
                <span className="block truncate text-xs text-gray-500 dark:text-gray-400">{CONTACT_EMAIL}</span>
              </span>
            </a>
            <button
              type="button"
              onClick={copy}
              aria-label={copied ? "Email address copied" : "Copy the email address"}
              title={copied ? "Copied" : "Copy the address"}
              className="mr-1 shrink-0 rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFCD00] dark:hover:bg-white/10 dark:hover:text-white"
            >
              {copied ? <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
          <span role="status" className="sr-only">{copied ? "Email address copied" : ""}</span>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
