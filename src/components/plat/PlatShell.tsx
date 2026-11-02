"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { CalendarDays, LogIn, Moon, Sun } from "lucide-react";
import AccountMenu from "./AccountMenu";
import DatasetNotice from "./DatasetNotice";
import ContactMenu from "./ContactMenu";
import ResourcesMenu, { RESOURCES } from "./ResourcesMenu";
import SearchBox from "./SearchBox";
import TridentMark from "./TridentMark";
import { useTheme } from "./theme";
import { useAccount, useSignInHref } from "./useSignedIn";
import { loadIndex, refreshedLabel, type IndexMeta } from "@/lib/plat";
import { afterIdle } from "@/lib/idle";
import { seatSpan, spanLabel } from "@/lib/freshness";

/**
 * The site's frame, built around two things: finding a course and the
 * Planner. Search sits in the bar; Courses and the requirement finder are the
 * two places named beside it; Housing, Announcements and About wait one click
 * away under Resources; the Planner is the one filled button. A signed-in
 * student's Academic History, theme and sign-out live in their account menu.
 *
 * Five links of equal weight used to compete with the search and the Planner,
 * and "Easy GEs" promised something its own page then hedged. Every old
 * address still works: /ge is the requirement finder, under a truthful name.
 *
 * Below 1280px the places go in a row of labelled tabs under the bar, every
 * one of them listed, since a row of bare icons made a first-time visitor guess.
 */

const PRIMARY = [
  { href: "/courses", label: "Courses", match: (p: string) => p === "/courses" || p.startsWith("/courses/") || p.startsWith("/course/") || p.startsWith("/professor/") || p.startsWith("/discover") },
  { href: "/ge", label: "Requirements", match: (p: string) => p.startsWith("/ge") },
] as const;

const resourceActive = (p: string) => RESOURCES.some((r) => p.startsWith(r.href));

export default function PlatShell({
  children,
  hideSearch = false,
}: {
  children: React.ReactNode;
  hideSearch?: boolean;
}) {
  const pathname = usePathname();
  const { theme, toggle } = useTheme();
  const account = useAccount();
  const signedIn = account === undefined ? null : account !== null;
  const signInHref = useSignInHref();
  const [meta, setMeta] = useState<IndexMeta | null>(null);

  // Only the footer's source line uses this, below the fold: fetched when idle,
  // so the index never competes with what a page is drawing first.
  useEffect(() => afterIdle(() => { loadIndex().then((d) => setMeta(d.meta)).catch(() => {}); }, 3000), []);
  const refreshed = refreshedLabel(meta?.refreshed);
  // Class Planner counts each section's seats on its own clock, so one dataset
  // holds counts weeks apart: the footer gives the span, never one date.
  const span = meta?.seatsNewest ? seatSpan([meta.seatsAsOf, meta.seatsNewest]) : null;
  const seats = span
    ? `seat counts taken ${spanLabel(span)}, ${new Date(span.newest).getUTCFullYear()} (each section shows its own)`
    : `seat counts dated where Class Planner gives a time${refreshed ? `; listings refreshed ${refreshed}` : ""}`;

  const tab = (active: boolean) =>
    `inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
      active
        ? "bg-gray-100 text-[#182B49] dark:bg-white/10 dark:text-[#FFCD00]"
        : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10"
    }`;

  return (
    <div className="min-h-screen bg-white text-gray-900 dark:bg-[#0d1420] dark:text-gray-100">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-[60] focus:rounded-lg focus:bg-[#182B49] focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Skip to main content
      </a>
      <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/90 backdrop-blur dark:border-white/10 dark:bg-[#0d1420]/90">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4 sm:gap-3 sm:px-6 lg:px-8">
          <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="UCSDPlans home">
            <TridentMark className="h-8 w-8" />
            {/* On a phone the search needs the width more than the name does. */}
            <span className={`text-[15px] font-bold tracking-tight ${hideSearch ? "" : "hidden sm:inline"}`}>
              UCSD<span className="text-[#1B2C4F] dark:text-[#FFC72C]">Plans</span>
            </span>
          </Link>

          {!hideSearch && <SearchBox className="min-w-0 flex-1 lg:max-w-md" />}

          <nav aria-label="Main" className="ml-auto hidden items-center gap-1 xl:flex">
            {PRIMARY.map((n) => (
              <Link key={n.href} href={n.href} aria-current={n.match(pathname) ? "page" : undefined} className={tab(n.match(pathname))}>
                {n.label}
              </Link>
            ))}
            <ResourcesMenu active={resourceActive(pathname)} className={tab(resourceActive(pathname))} />
          </nav>

          <div className={`flex shrink-0 items-center gap-1 sm:gap-2 ${hideSearch ? "ml-auto" : ""} xl:ml-0`}>
            {/* Who made this and how to reach them, one click away on every page. */}
            <ContactMenu iconOnly />

            {/* Signed in, the theme is in the account menu; a visitor gets it here. */}
            {!account && (
              <button
                type="button"
                onClick={toggle}
                aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
                className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/10"
              >
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
            )}

            {account && <AccountMenu account={account} />}

            {signedIn === false && (
              <Link
                href={signInHref}
                aria-label="Sign in with your @ucsd.edu account"
                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-white/10 sm:px-3"
              >
                <LogIn className="h-4 w-4" />
                <span className="hidden sm:inline">Sign in</span>
              </Link>
            )}

            {/* The planner is the other half of the product, so it gets a filled
                button rather than a text link that reads as chrome — icon-only on
                a phone, where the search keeps its room. */}
            <Link
              href="/planner"
              aria-current={pathname.startsWith("/planner") ? "page" : undefined}
              aria-label="Planner"
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold shadow-sm transition sm:px-3 ${
                pathname.startsWith("/planner")
                  ? "bg-[#FFCD00] text-[#182B49] ring-2 ring-[#182B49]/20 dark:ring-white/25"
                  : "bg-[#182B49] text-white hover:bg-[#1e3a63] dark:bg-[#FFCD00] dark:text-[#182B49] dark:hover:bg-[#FFD740]"
              }`}
            >
              <CalendarDays className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Planner</span>
            </Link>
          </div>
        </div>

        {/* Below 1280px the places go in a row of labelled tabs. */}
        <nav aria-label="Main" className="border-t border-gray-100 xl:hidden dark:border-white/5">
          <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-3 py-1.5 [scrollbar-width:none] sm:px-5">
            {[...PRIMARY, ...RESOURCES.map((r) => ({ href: r.href, label: r.href === "/about" ? "About" : r.label, match: (p: string) => p.startsWith(r.href) }))].map((n) => (
              <Link key={n.href} href={n.href} aria-current={n.match(pathname) ? "page" : undefined} className={tab(n.match(pathname))}>
                {n.label}
              </Link>
            ))}
          </div>
        </nav>
      </header>

      <DatasetNotice />
      {/* At least a screen tall, so the footer never starts in view and then jumps when a page's data arrives. */}
      <main id="main" tabIndex={-1} className="min-h-[100dvh] outline-none">{children}</main>

      <footer className="mt-20 border-t border-gray-200 py-8 dark:border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 text-xs leading-relaxed text-gray-500 dark:text-gray-400 sm:px-6 lg:flex-row lg:items-start lg:justify-between lg:px-8">
          <p className="max-w-3xl">
            {meta
              ? `${meta.gradeRecords.toLocaleString()} course–instructor grade distributions (${meta.years}) from the UCSD Associated Students Instructor Grade Archive; descriptions and prerequisites from the UCSD General Catalog; ${meta.termName} sections and seats from UCSD’s Class Planner, ${seats}. Seats are not live, so check TSS before you enroll. `
              : ""}
            Historical grades describe the past, not your quarter. Confirm requirements with your college advisor.
          </p>
          <nav aria-label="About" className="flex shrink-0 flex-wrap gap-x-4 gap-y-1 font-semibold">
            <Link href="/about" className="hover:text-gray-900 hover:underline dark:hover:text-white">About &amp; data sources</Link>
            <Link href="/about#letter" className="hover:text-gray-900 hover:underline dark:hover:text-white">How the letter grade works</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
