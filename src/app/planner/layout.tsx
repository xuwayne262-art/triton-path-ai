"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, Calendar, LayoutGrid, Moon, Sun } from "lucide-react";
import TridentMark from "@/components/plat/TridentMark";
import ProgramPicker from "@/components/planner/ProgramPicker";
import { PlannerProvider, usePlanner } from "./PlannerProvider";

/**
 * Chrome shared by both planner pages: which of the two views you are looking
 * at, and whose program it is. Living in the layout means the provider below
 * it stays mounted across the tab switch, so moving between the term workspace
 * and the four-year plan never rebuilds the plan.
 *
 * It is one row. It used to be two — a bar of major, minor and college
 * selectors, then a bar of page tabs — which spent a sixth of a laptop screen
 * on settings made once a year, above the calendar that is the point.
 */

const TABS = [
  { href: "/planner", label: "Term workspace", short: "This term", icon: Calendar },
  { href: "/planner/four-year", label: "4-year plan", short: "4 years", icon: LayoutGrid },
] as const;

function PlannerChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const {
    darkMode, toggleDarkMode,
    selectedMajor, setSelectedMajor,
    selectedMinor, setSelectedMinor,
    selectedCollege, setSelectedCollege,
  } = usePlanner();

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
          <Link
            href="/"
            className="flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Courses</span>
          </Link>
          <span aria-hidden className="mx-1 hidden h-5 w-px shrink-0 bg-gray-200 dark:bg-white/10 sm:block" />
          <div className="flex items-center gap-0.5 rounded-lg bg-gray-100 p-0.5 dark:bg-white/5">
            {TABS.map(({ href, label, short, icon: Icon }) => {
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1 text-sm font-semibold transition ${
                    active
                      ? "bg-white text-[#182B49] shadow-sm dark:bg-white/15 dark:text-white"
                      : "text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
                  }`}
                >
                  <Icon className="hidden h-4 w-4 min-[400px]:block" />
                  <span className="sm:hidden">{short}</span>
                  <span className="hidden sm:inline">{label}</span>
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
