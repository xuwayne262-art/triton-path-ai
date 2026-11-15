"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Check, Copy, Heart, X } from "lucide-react";
import {
  OPEN_SUPPORT_EVENT,
  SUPPORT_DELAY_MS,
  SUPPORT_DISMISSED_KEY,
  SUPPORT_SHOWN_KEY,
  ZELLE_PHONE,
  ZELLE_QR,
  shouldAutoOpen,
} from "@/lib/support";

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#182B49] dark:focus-visible:outline-[#FFCD00]";

/** Storage that a private window or a blocked site may refuse: then the note just asks again next time. */
function read(store: () => Storage, key: string): string | null {
  try {
    return store().getItem(key);
  } catch {
    return null;
  }
}
function write(store: () => Storage, key: string, value: string) {
  try {
    store().setItem(key, value);
  } catch {
    /* nothing kept */
  }
}

/**
 * The donation note: a small card in the bottom corner, never over the page's
 * own controls (nothing else is pinned there), never modal. It opens by itself
 * once a session after a while on a page; the footer's "Support UCSDPlans"
 * opens it any time.
 */
export default function SupportPopup() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const panel = useRef<HTMLElement>(null);
  const askedByVisitor = useRef(false);

  useEffect(() => {
    const dismissed = Number(read(() => window.localStorage, SUPPORT_DISMISSED_KEY));
    const allowed = shouldAutoOpen({
      now: Date.now(),
      dismissedAt: dismissed > 0 ? dismissed : null,
      shownThisSession: read(() => window.sessionStorage, SUPPORT_SHOWN_KEY) === "1",
      pathname,
    });
    if (!allowed) return;
    const timer = window.setTimeout(() => {
      write(() => window.sessionStorage, SUPPORT_SHOWN_KEY, "1");
      setOpen(true);
    }, SUPPORT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  useEffect(() => {
    const show = () => {
      askedByVisitor.current = true;
      setOpen(true);
    };
    window.addEventListener(OPEN_SUPPORT_EVENT, show);
    return () => window.removeEventListener(OPEN_SUPPORT_EVENT, show);
  }, []);

  // Opened from the footer: take the visitor to it. Opened by itself: leave their focus alone.
  useEffect(() => {
    if (open && askedByVisitor.current) panel.current?.focus();
  }, [open]);

  const close = () => {
    setOpen(false);
    askedByVisitor.current = false;
    write(() => window.localStorage, SUPPORT_DISMISSED_KEY, String(Date.now()));
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(ZELLE_PHONE.replace(/\D/g, ""));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* the number is on screen to copy by hand */
    }
  };

  if (!open) return null;

  return (
    <aside
      ref={panel}
      tabIndex={-1}
      aria-labelledby="support-title"
      onKeyDown={(e) => { if (e.key === "Escape") close(); }}
      className="fixed inset-x-3 bottom-3 z-30 mx-auto max-w-[22rem] rounded-2xl border border-gray-200 bg-white p-4 text-gray-900 shadow-2xl outline-none dark:border-white/10 dark:bg-[#111a2b] dark:text-gray-100 sm:inset-x-auto sm:bottom-5 sm:right-5 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4"
    >
      <div className="flex items-start gap-2.5">
        <Heart aria-hidden className="mt-0.5 h-4 w-4 shrink-0 fill-[#FFCD00] text-[#FFCD00]" />
        <h2 id="support-title" className="flex-1 text-sm font-semibold leading-snug">Help keep UCSDPlans running</h2>
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className={`-m-1.5 rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white ${FOCUS}`}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <p className="mt-2 text-[13px] leading-relaxed text-gray-700 dark:text-gray-200">
        UCSDPlans is free and run by one UCSD student. Hosting, data updates and keeping it reliable cost real money
        every month. Students have already chipped in to make it better. If it helped you, any amount keeps it going.
        Thank you!
      </p>

      <div className="mt-3 flex items-center gap-3 rounded-xl bg-gray-50 p-2.5 dark:bg-white/5">
        <Image
          src={ZELLE_QR}
          alt="Zelle QR code for donating to UCSDPlans"
          width={753}
          height={764}
          unoptimized
          loading="eager"
          className="h-24 w-24 shrink-0 rounded-lg"
        />
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">Zelle</p>
          <p className="text-[15px] font-semibold tabular-nums">{ZELLE_PHONE}</p>
          <button
            type="button"
            onClick={copy}
            className={`mt-1 inline-flex items-center gap-1.5 rounded-md text-xs font-semibold text-[#182B49] hover:underline dark:text-[#FFCD00] ${FOCUS}`}
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy number"}
          </button>
          <p className="mt-1 text-xs leading-snug text-gray-600 dark:text-gray-400">Scan with your bank&rsquo;s app.</p>
        </div>
      </div>

      <div className="mt-3 flex items-end gap-3">
        <p className="flex-1 text-[11px] leading-snug text-gray-600 dark:text-gray-400">
          Optional, not tax-deductible, and it goes to the student who runs the site. UCSDPlans isn&rsquo;t part of UC
          San Diego.
        </p>
        <button
          type="button"
          onClick={close}
          className={`shrink-0 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-white/10 dark:text-gray-200 dark:hover:bg-white/5 ${FOCUS}`}
        >
          Not now
        </button>
      </div>
    </aside>
  );
}

/** The footer's way to open the note. */
export function SupportButton({ className = "" }: { className?: string }) {
  return (
    <button type="button" onClick={() => window.dispatchEvent(new Event(OPEN_SUPPORT_EVENT))} className={className}>
      Support UCSDPlans
    </button>
  );
}
