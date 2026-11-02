"use client";

import { useState } from "react";
import Link from "next/link";
import { Popover } from "radix-ui";
import { FileText, LogOut, Moon, RefreshCw, Sun, UserRound } from "lucide-react";
import { useTheme } from "./theme";
import type { Account } from "./useSignedIn";

/**
 * The signed-in student's own corner of the bar: who they are signed in as,
 * their Academic History, the theme, and signing out or switching accounts.
 *
 * There was no way to sign out at all. On a shared computer that left the
 * next person in someone else's planner. Signing out uses Auth.js's own
 * sign-out with its CSRF token, then returns to the home page; "Use another
 * account" signs out and goes to the login page, whose Google step always
 * shows the account chooser.
 */
export default function AccountMenu({ account }: { account: Account }) {
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const { theme, toggle } = useTheme();

  const signOut = async (then: string) => {
    setLeaving(true);
    try {
      const { csrfToken } = await fetch("/api/auth/csrf", { cache: "no-store" }).then((r) => r.json()) as { csrfToken?: string };
      const form = document.createElement("form");
      form.method = "POST";
      form.action = "/api/auth/signout";
      for (const [name, value] of [["csrfToken", csrfToken ?? ""], ["callbackUrl", then]]) {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = name;
        input.value = value;
        form.appendChild(input);
      }
      document.body.appendChild(form);
      form.submit();
    } catch {
      setLeaving(false);
    }
  };

  const row = "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFCD00] disabled:opacity-60 dark:hover:bg-white/5";
  const initial = (account.name ?? account.email).trim().charAt(0).toUpperCase();

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={`Account: ${account.email}`}
          title={account.email}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-sm font-bold text-[#182B49] transition hover:bg-gray-200 data-[state=open]:ring-2 data-[state=open]:ring-[#182B49]/30 dark:bg-white/10 dark:text-[#FFCD00] dark:hover:bg-white/15"
        >
          {initial || <UserRound className="h-4 w-4" aria-hidden />}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          collisionPadding={12}
          className="z-50 w-[min(17rem,calc(100vw-1.5rem))] rounded-2xl border border-gray-200 bg-white p-2 text-gray-900 shadow-xl outline-none dark:border-white/10 dark:bg-[#101a2b] dark:text-gray-100"
        >
          <div className="px-2.5 pb-2 pt-1.5">
            <p className="text-xs text-gray-600 dark:text-gray-400">Signed in as</p>
            {account.name && <p className="truncate text-sm font-semibold">{account.name}</p>}
            <p className="truncate text-sm text-gray-700 dark:text-gray-300">{account.email}</p>
          </div>
          <div className="border-t border-gray-100 pt-1 dark:border-white/10">
            <Link href="/import" className={row} onClick={() => setOpen(false)}>
              <FileText className="h-4 w-4 text-gray-500" aria-hidden /> Academic History
            </Link>
            <button type="button" className={row} onClick={toggle}>
              {theme === "dark" ? <Sun className="h-4 w-4 text-gray-500" aria-hidden /> : <Moon className="h-4 w-4 text-gray-500" aria-hidden />}
              {theme === "dark" ? "Light theme" : "Dark theme"}
            </button>
          </div>
          <div className="mt-1 border-t border-gray-100 pt-1 dark:border-white/10">
            <button type="button" className={row} disabled={leaving} onClick={() => signOut("/login")}>
              <RefreshCw className="h-4 w-4 text-gray-500" aria-hidden /> Use another account
            </button>
            <button type="button" className={row} disabled={leaving} onClick={() => signOut("/")}>
              <LogOut className="h-4 w-4 text-gray-500" aria-hidden /> {leaving ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
