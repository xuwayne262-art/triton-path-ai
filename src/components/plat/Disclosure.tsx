"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

/**
 * Collapsed-by-default section. Secondary detail lives in here so a page opens
 * with one clear answer instead of everything at once.
 */
export default function Disclosure({
  title,
  hint,
  defaultOpen = false,
  children,
}: {
  title: string;
  hint?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-b border-gray-200 dark:border-white/10">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 py-4 text-left"
      >
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
        <span className="flex-1 text-sm font-semibold">{title}</span>
        {hint && <span className="text-xs text-gray-400">{hint}</span>}
      </button>
      {open && <div className="pb-6 pl-7">{children}</div>}
    </section>
  );
}
