"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, Calendar, LayoutGrid, MessagesSquare, Moon, Sun } from "lucide-react";
import ContactMenu from "@/components/plat/ContactMenu";
import TridentMark from "@/components/plat/TridentMark";
import ProgramPicker from "@/components/planner/ProgramPicker";
import SyncBadge from "@/components/planner/SyncBadge";
import { PlannerProvider, usePlanner } from "./PlannerProvider";

/**
 * Chrome shared by the planner pages: which view you are looking at, and
 * whose program it is. Living in the layout means the provider below it stays
 * mounted across tab switches, so moving between This term, the 4-year plan
 * and Plan with AI never rebuilds the plan.
 *
 * It is one row. It used to be two — a bar of major, minor and college
 * selectors, then a bar of page tabs — which spent a sixth of a laptop screen
 * on settings made once a year, above the calendar that is the point.
 */

// One name each, on every screen: the first was "Term workspace" here, "This
// term" on a phone, and "AI Planner" in the site's own bar.
const TABS = [
  { href: "/planner", label: "This term", icon: Calendar, phoneIcon: false },
  { href: "/planner/four-year", label: "4-year plan", icon: LayoutGrid, phoneIcon: false },
  // The conversation beside the same plan. A phone's bar has no room for a
  // third label beside the program picker, so there it is its icon, with the
  // full name still read out.
  { href: "/planner/ai", label: "Plan with AI", icon: MessagesSquare, phoneIcon: true },
] as const;

function PlannerChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const {
    darkMode, toggleDarkMode, syncStatus,
    selectedMajor, setSelectedMajor,
    selectedMinor, setSelectedMinor,
    selectedCollege, setSelectedCollege,
  } = usePlanner();
  // Where the tab row scrolls, the page you are on stays in view, also once
  // the controls beside it finish loading and narrow it. Only the row moves.
  const tabs = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const row = tabs.current;
    if (!row) return;
    const show = () => {
      const active = row.querySelector<HTMLElement>('[aria-current="page"]');
      if (!active) return;
      const r = row.getBoundingClientRect();
      const a = active.getBoundingClientRect();
      if (a.left < r.left) row.scrollLeft -= r.left - a.left;
      else if (a.right > r.right) row.scrollLeft += a.right - r.right;
    };
    const watch = new ResizeObserver(show);
    watch.observe(row);
    return () => watch.disconnect();
  }, [pathname]);

  return (
    // dvh, not vh: on an iPhone 100vh is the height with Safari's toolbar
    // hidden, so a vh-tall app ran its bottom edge underneath the toolbar.
    <div className="flex h-dvh flex-col bg-slate-100 text-gray-900 dark:bg-gray-900 dark:text-gray-100">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-gray-200 bg-white px-3 dark:border-white/10 dark:bg-gray-800 sm:gap-3 sm:px-4">
        {/* Logo — also the way back to the course explorer */}
        <Link href="/" className="flex shrink-0 items-center gap-2" title="Back to courses">
          <TridentMark className="h-8 w-8" />
          <span className="hidden text-[15px] font-bold tracking-tight lg:inline">
            UCSD<span className="text-[#1B2C4F] dark:text-[#FFC72C]">Plans</span>
          </span>
        </Link>

        <nav aria-label="Planner" className="flex min-w-0 items-center gap-1">
          {/* On a phone the logo beside it is the way back, and the tabs need the room. */}
          <Link
            href="/"
            className="flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white max-sm:hidden"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Courses</span>
          </Link>
          <span aria-hidden className="mx-1 hidden h-5 w-px shrink-0 bg-gray-200 dark:bg-white/10 sm:block" />
          {/* Scrolls sideways rather than run under the controls on the narrowest phones. */}
          <div ref={tabs} className="flex min-w-0 items-center gap-0.5 overflow-x-auto rounded-lg bg-gray-100 p-0.5 [scrollbar-width:none] dark:bg-white/5 [&::-webkit-scrollbar]:hidden">
            {TABS.map(({ href, label, icon: Icon, phoneIcon }) => {
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-[13px] font-semibold transition max-[380px]:px-1.5 sm:px-2.5 sm:text-sm ${
                    active
                      ? "bg-white text-[#182B49] shadow-sm dark:bg-white/15 dark:text-white"
                      : "text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
                  }`}
                >
                  <Icon aria-hidden className={phoneIcon ? "h-4 w-4" : "hidden h-4 w-4 min-[400px]:block"} />
                  {phoneIcon ? <span className="max-sm:sr-only">{label}</span> : label}
                </Link>
              );
            })}
          </div>
        </nav>

        <div className="ml-auto flex min-w-0 items-center gap-2">
          <ProgramPicker
            major={selectedMajor}
            minor={selectedMinor}
            college={selectedCollege}
            onMajor={setSelectedMajor}
            onMinor={setSelectedMinor}
            onCollege={setSelectedCollege}
          />
          <SyncBadge status={syncStatus} />
          {/* A phone's planner bar has no room left; the site's own bar carries it there. */}
          <ContactMenu iconOnly className="max-md:hidden" />
          <button
            type="button"
            onClick={toggleDarkMode}
            aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
            title={darkMode ? "Light mode" : "Dark mode"}
            className="shrink-0 rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white"
          >
            {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </header>

      {/* Each page supplies its own panes. */}
      <div className="flex min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}

export default function PlannerLayout({ children }: { children: React.ReactNode }) {
  return (
    <PlannerProvider>
      <PlannerChrome>{children}</PlannerChrome>
    </PlannerProvider>
  );
}
