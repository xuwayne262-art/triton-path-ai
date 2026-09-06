"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  BookOpen, Calendar, ChevronLeft, GraduationCap, LayoutGrid, Moon, Sun,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import TridentMark from "@/components/plat/TridentMark";
import { COLLEGES, type College } from "@/components/triton/types";
import { UCSD_MAJORS, UCSD_MINORS } from "@/data/ucsdMajorsMinors";
import { PlannerProvider, usePlanner } from "./PlannerProvider";

/**
 * Chrome shared by both planner pages: who you are (major / minor / college)
 * and which of the two views you are looking at. Living in the layout means
 * the provider below it stays mounted across the tab switch, so moving between
 * the term workspace and the four-year plan never rebuilds the plan.
 */

const TABS = [
  { href: "/planner", label: "Term workspace", icon: Calendar },
  { href: "/planner/four-year", label: "4-year plan", icon: LayoutGrid },
] as const;

function PlannerChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const {
    darkMode, toggleDarkMode,
    selectedMajor, setSelectedMajor,
    selectedMinor, setSelectedMinor,
    selectedCollege, setSelectedCollege,
  } = usePlanner();

  const [majorSearch, setMajorSearch] = useState("");
  const [majorOpen, setMajorOpen] = useState(false);
  const [minorSearch, setMinorSearch] = useState("");
  const [minorOpen, setMinorOpen] = useState(false);
  const majorRef = useRef<HTMLDivElement>(null);
  const minorRef = useRef<HTMLDivElement>(null);

  // Close comboboxes on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (majorRef.current && !majorRef.current.contains(e.target as Node)) {
        setMajorOpen(false);
        setMajorSearch("");
      }
      if (minorRef.current && !minorRef.current.contains(e.target as Node)) {
        setMinorOpen(false);
        setMinorSearch("");
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const selectCls = `text-sm rounded-lg border px-2 py-1 outline-none focus:ring-1 focus:ring-blue-500 ${
    darkMode ? "bg-gray-700 border-gray-600 text-white" : "bg-white border-gray-200 text-gray-900"
  }`;
  const dividerCls = `w-px h-5 flex-shrink-0 ${darkMode ? "bg-gray-700" : "bg-gray-200"}`;
  const labelCls = `text-xs font-medium flex-shrink-0 ${darkMode ? "text-gray-400" : "text-gray-500"}`;

  return (
    <div className={`h-screen flex flex-col ${darkMode ? "bg-gray-900" : "bg-slate-100"}`}>
      {/* ── Top header bar ─────────────────────────────────────────────────── */}
      <header
        className={`flex items-center gap-4 px-5 h-14 border-b flex-shrink-0 ${
          darkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"
        }`}
      >
        {/* Logo — also the way back to the course explorer */}
        <Link href="/" className="flex items-center gap-2.5 flex-shrink-0" title="Back to courses">
          <TridentMark className="w-8 h-8" />
          <div className="hidden sm:block">
            <p className={`font-bold text-sm leading-tight ${darkMode ? "text-white" : "text-gray-900"}`}>
              UCSDPlans
            </p>
            <p className={`text-[10px] leading-none mt-0.5 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
              UCSD Planner
            </p>
          </div>
        </Link>

        <Link
          href="/"
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition flex-shrink-0 ${
            darkMode ? "text-gray-300 hover:bg-white/10" : "text-gray-600 hover:bg-gray-100"
          }`}
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Courses</span>
        </Link>

        <div className={dividerCls} />

        {/* Academic profile selectors — Major / Minor / College */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {/* Major — searchable combobox */}
          <div ref={majorRef} className="flex items-center gap-1.5 flex-shrink-0">
            <BookOpen className="w-3.5 h-3.5 text-gray-400" />
            <span className={labelCls}>Major</span>
            <div className="relative">
              <input
                type="text"
                placeholder="— Select a Major —"
                value={majorOpen ? majorSearch : selectedMajor}
                onFocus={() => { setMajorOpen(true); setMajorSearch(""); }}
                onBlur={() => setMajorOpen(false)}
                onChange={(e) => setMajorSearch(e.target.value)}
                className={`${selectCls} w-44 cursor-pointer`}
              />
              {majorOpen && (
                <ul
                  className={`absolute top-full left-0 z-50 mt-0.5 w-80 max-h-72 overflow-y-auto rounded-lg border shadow-lg m-0 p-0 list-none ${
                    darkMode ? "bg-gray-800 border-gray-600" : "bg-white border-gray-200"
                  }`}
                >
                  {(() => {
                    const filtered = !majorSearch
                      ? UCSD_MAJORS
                      : UCSD_MAJORS.filter((m) => m?.toLowerCase().includes(majorSearch.toLowerCase()));
                    if (filtered.length === 0) {
                      return (
                        <li className={`px-3 py-3 text-sm text-center list-none ${darkMode ? "text-gray-500" : "text-gray-400"}`}>
                          No majors found
                        </li>
                      );
                    }
                    return filtered.map((major) => (
                      <li
                        key={major}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setSelectedMajor(major);
                          setMajorOpen(false);
                          setMajorSearch("");
                        }}
                        className={`px-3 py-1.5 text-sm cursor-pointer transition-colors list-none ${
                          major === selectedMajor
                            ? darkMode ? "bg-blue-800 text-blue-200" : "bg-blue-50 text-blue-700"
                            : darkMode ? "text-gray-200 hover:bg-gray-700" : "text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        {major}
                      </li>
                    ));
                  })()}
                </ul>
              )}
            </div>
          </div>

          <div className={dividerCls} />

          {/* Minor — searchable combobox */}
          <div ref={minorRef} className="flex items-center gap-1.5 flex-shrink-0">
            <span className={labelCls}>Minor</span>
            <div className="relative">
              <input
                type="text"
                placeholder="— None / Select a Minor —"
                value={minorOpen ? minorSearch : selectedMinor === "None" ? "" : selectedMinor}
                onFocus={() => { setMinorOpen(true); setMinorSearch(""); }}
                onBlur={() => setMinorOpen(false)}
                onChange={(e) => setMinorSearch(e.target.value)}
                className={`${selectCls} w-36 cursor-pointer`}
              />
              {minorOpen && (
                <ul
                  className={`absolute top-full left-0 z-50 mt-0.5 w-64 max-h-64 overflow-y-auto rounded-lg border shadow-lg m-0 p-0 list-none ${
                    darkMode ? "bg-gray-800 border-gray-600" : "bg-white border-gray-200"
                  }`}
                >
                  {UCSD_MINORS.filter(
                    (m) => m === "None" || m.toLowerCase().includes(minorSearch.toLowerCase()),
                  ).map((minor) => (
                    <li
                      key={minor}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setSelectedMinor(minor);
                        setMinorOpen(false);
                        setMinorSearch("");
                      }}
                      className={`px-3 py-1.5 text-sm cursor-pointer transition-colors list-none ${
                        minor === selectedMinor
                          ? darkMode ? "bg-blue-800 text-blue-200" : "bg-blue-50 text-blue-700"
                          : minor === "None"
                          ? darkMode ? "text-gray-500 hover:bg-gray-700 italic" : "text-gray-400 hover:bg-gray-50 italic"
                          : darkMode ? "text-gray-200 hover:bg-gray-700" : "text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      {minor === "None" ? "— None / No Minor —" : minor}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className={dividerCls} />

          {/* College */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <GraduationCap className="w-3.5 h-3.5 text-gray-400" />
            <span className={labelCls}>College</span>
            <select
              value={selectedCollege ?? ""}
              onChange={(e) =>
                setSelectedCollege(e.target.value ? (e.target.value as College) : null)
              }
              className={selectCls}
            >
              <option value="">— None —</option>
              {COLLEGES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Right: pass-time badge + dark-mode toggle */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={toggleDarkMode}
                aria-label={darkMode ? "Light mode" : "Dark mode"}
                className={`p-1.5 rounded-lg ${
                  darkMode ? "hover:bg-gray-700 text-yellow-400" : "hover:bg-gray-100 text-gray-600"
                }`}
              >
                {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
            </TooltipTrigger>
            <TooltipContent>{darkMode ? "Light Mode" : "Dark Mode"}</TooltipContent>
          </Tooltip>
        </div>
      </header>

      {/* ── Page tabs ──────────────────────────────────────────────────────── */}
      {/* These were a toggle inside the calendar pane, which made the four-year
          plan read as a mode of the week rather than a view of its own. */}
      <nav
        className={`flex items-center gap-1 px-4 py-2 border-b flex-shrink-0 ${
          darkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"
        }`}
      >
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                active
                  ? "bg-blue-600 text-white"
                  : darkMode
                  ? "text-gray-300 hover:bg-gray-700"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Each page supplies its own panes. */}
      <div className="flex flex-1 overflow-hidden">{children}</div>
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
