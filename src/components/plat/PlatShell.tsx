"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { CalendarDays, LogIn, Moon, Sun } from "lucide-react";
import ContactMenu from "./ContactMenu";
import SearchBox from "./SearchBox";
import TridentMark from "./TridentMark";
import { useTheme } from "./theme";
import { useSignedIn, useSignInHref } from "./useSignedIn";
import { refreshedLabel, type IndexMeta } from "@/lib/plat";
import { peekIndexFor } from "@/lib/termData";
import { useTerm } from "./useTerm";
import { seatSpan, spanLabel } from "@/lib/freshness";
import { termEntry, withTerm } from "@/lib/terms";

/**
 * The site's frame: one bar with the search and the Planner, and the places a
 * student goes named in plain words — on a wide screen in the bar; narrower,
 * where five links would squeeze the search out of it, in a row of labelled
 * tabs under it, since a row of bare icons made a first-time visitor guess.
 *
 * The explorer is public, so the bar also says "Sign in" to a visitor who is
 * not; the Planner, Academic History and Housing ask them to at the door.
 */

// `quarter`: the page shows one quarter's schedule, so its link carries the
// quarter on screen. A shared Fall link then stays Fall through the header,
// whatever quarter the reader last picked. The others are the same for every
// quarter; they carry it only when the address chose it, so coming back from
// them returns to the quarter the reader came from.
const NAV = [
  { href: "/courses", label: "Courses", quarter: true, match: (p: string) => p === "/courses" || p.startsWith("/courses/") || p.startsWith("/course/") },
  { href: "/ge", label: "Easy GEs", quarter: true, match: (p: string) => p.startsWith("/ge") },
  { href: "/housing", label: "Housing", quarter: false, match: (p: string) => p.startsWith("/housing"), badge: "New" },
  { href: "/import", label: "Academic History", quarter: false, match: (p: string) => p.startsWith("/import") },
  { href: "/announcements", label: "Announcements", quarter: false, match: (p: string) => p.startsWith("/announcements") },
] as const;

export default function PlatShell({
  children,
  hideSearch = false,
}: {
  children: React.ReactNode;
  hideSearch?: boolean;
}) {
  const pathname = usePathname();
  const { theme, toggle } = useTheme();
  const signedIn = useSignedIn();
  const signInHref = useSignInHref();
  const resolved = useTerm();
  const term = resolved?.term ?? null;
  const carried = resolved?.source === "url" ? term : null;
  const navHref = (n: (typeof NAV)[number]) => withTerm(n.href, n.quarter ? term : carried);

  // The footer describes the quarter on screen, from the term manifest; its
  // counts come from that quarter's index only when the page itself loaded
  // it. A page that needs no schedule (Announcements, Housing) used to
  // download one, 375 KB on a phone, for a footnote. Kept with the quarter it
  // describes, so a quarter that failed is never given the last one's numbers.
  // Checked after the page's own effects have run (a parent's run after its
  // children's), and once more for a page that asks a moment later.
  const [loaded, setLoaded] = useState<{ term: string; meta: IndexMeta } | null>(null);
  useEffect(() => {
    if (!term) return;
    let live = true;
    let asked = false;
    const check = () => {
      const pending = asked ? null : peekIndexFor(term);
      if (!pending) return;
      asked = true;
      pending.then((d) => { if (live) setLoaded({ term, meta: d.meta }); }).catch(() => {});
    };
    const timers = [window.setTimeout(check, 0), window.setTimeout(check, 2500)];
    return () => { live = false; timers.forEach((t) => window.clearTimeout(t)); };
  }, [term]);
  const meta = loaded && loaded.term === term ? loaded.meta : null;
  const entry = termEntry(term);
  // When UCSD last refreshed the schedule, and when each seat count was
  // taken, are two different facts; the footer used to give them as one.
  const refreshed = refreshedLabel(entry?.refreshed ?? meta?.refreshed);
  // Class Planner counts each section's seats on its own clock, so one dataset
  // holds counts weeks apart: the footer gives the span, never one date.
  const span = meta?.seatsNewest ? seatSpan([meta.seatsAsOf, meta.seatsNewest]) : null;
  const seatTimes = entry?.features.seatTimes ?? meta?.features?.seatTimes ?? true;
  const schedule = refreshed ? `, schedule refreshed ${refreshed}` : "";
  const seats = !seatTimes
    ? "UCSD gives no time for each seat count."
    : span
      ? `Seat counts were taken ${spanLabel(span)}, ${new Date(span.newest).getUTCFullYear()}; each section shows its own time.`
      : "Each seat count shows its time where Class Planner gives one.";

  const tab = (active: boolean) =>
    `inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
      active
        ? "bg-gray-100 text-[#182B49] dark:bg-white/10 dark:text-[#FFCD00]"
        : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10"
    }`;

  return (
    <div className="min-h-screen bg-white text-gray-900 dark:bg-[#0d1420] dark:text-gray-100">
      <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/90 backdrop-blur dark:border-white/10 dark:bg-[#0d1420]/90">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4 sm:gap-3 sm:px-6 lg:px-8">
          <Link href={withTerm("/", term)} className="flex shrink-0 items-center gap-2.5" aria-label="UCSDPlans home">
            <TridentMark className="h-8 w-8" />
            {/* On a phone the search needs the width more than the name does. */}
            <span className={`text-[15px] font-bold tracking-tight ${hideSearch ? "" : "hidden sm:inline"}`}>
              UCSD<span className="text-[#1B2C4F] dark:text-[#FFC72C]">Plans</span>
            </span>
          </Link>

          {!hideSearch && <SearchBox className="min-w-0 flex-1 lg:max-w-md" />}

          <nav aria-label="Main" className="ml-auto hidden items-center gap-1 xl:flex">
            {NAV.map((n) => (
              <Link key={n.href} href={navHref(n)} aria-current={n.match(pathname) ? "page" : undefined} className={tab(n.match(pathname))}>
                {n.label}
                {"badge" in n && (
                  <span className="rounded-full bg-[#FFCD00] px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-[#182B49]">
                    {n.badge}
                  </span>
                )}
              </Link>
            ))}
          </nav>

          <div className={`flex shrink-0 items-center gap-1 sm:gap-2 ${hideSearch ? "ml-auto" : ""} xl:ml-0`}>
            {/* Who made this and how to reach them, one click away on every page. */}
            <ContactMenu iconOnly />

            <button
              type="button"
              onClick={toggle}
              aria-label="Toggle dark mode"
              className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/10"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

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
              href={withTerm("/planner", term)}
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
            {NAV.map((n) => (
              <Link key={n.href} href={navHref(n)} aria-current={n.match(pathname) ? "page" : undefined} className={tab(n.match(pathname))}>
                {n.label}
                {"badge" in n && (
                  <span className="rounded-full bg-[#FFCD00] px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-[#182B49]">
                    {n.badge}
                  </span>
                )}
              </Link>
            ))}
          </div>
        </nav>
      </header>

      <main>{children}</main>

      <footer className="mt-20 border-t border-gray-200 py-8 dark:border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 text-xs leading-relaxed text-gray-500 dark:text-gray-400 sm:px-6 lg:flex-row lg:items-start lg:justify-between lg:px-8">
          <p className="max-w-3xl">
            {entry
              ? `${meta ? `${meta.gradeRecords.toLocaleString()} course–instructor grade distributions (${meta.years})` : "Course–instructor grade distributions"} from the UCSD Associated Students Instructor Grade Archive; descriptions and prerequisites from the UCSD General Catalog; ${entry.name} sections and seats from UCSD’s Class Planner${schedule}. ${seats} Seats are not live, so check TSS before you enroll. `
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
