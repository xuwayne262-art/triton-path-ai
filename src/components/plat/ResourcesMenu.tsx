"use client";

import { useState } from "react";
import Link from "next/link";
import { Popover } from "radix-ui";
import { ChevronDown, Home, Info, Megaphone } from "lucide-react";

/** Where the secondary places live on a wide screen: one menu instead of three more links beside the search. */
export const RESOURCES = [
  { href: "/housing", label: "Housing", hint: "Sublets and rooms from @ucsd.edu students · sign-in required", icon: Home },
  { href: "/announcements", label: "Announcements", hint: "What's new on UCSDPlans", icon: Megaphone },
  { href: "/about", label: "About & data sources", hint: "Where every number comes from", icon: Info },
] as const;

export default function ResourcesMenu({ active, className = "" }: { active: boolean; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={`${className} data-[state=open]:bg-gray-100 dark:data-[state=open]:bg-white/10`}
          aria-current={active ? "page" : undefined}
        >
          Resources <ChevronDown className="h-3.5 w-3.5" aria-hidden />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={8}
          collisionPadding={12}
          className="z-50 w-[min(20rem,calc(100vw-1.5rem))] rounded-2xl border border-gray-200 bg-white p-1.5 text-gray-900 shadow-xl outline-none dark:border-white/10 dark:bg-[#101a2b] dark:text-gray-100"
        >
          {RESOURCES.map((r) => (
            <Link
              key={r.href}
              href={r.href}
              onClick={() => setOpen(false)}
              className="flex items-start gap-3 rounded-xl px-2.5 py-2 transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFCD00] dark:hover:bg-white/5"
            >
              <r.icon className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" aria-hidden />
              <span>
                <span className="block text-sm font-semibold">{r.label}</span>
                <span className="block text-xs text-gray-600 dark:text-gray-400">{r.hint}</span>
              </span>
            </Link>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
