"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { CalendarDays, House, Moon, Sun } from "lucide-react";
import ContactMenu from "./ContactMenu";
import SearchBox from "./SearchBox";
import TridentMark from "./TridentMark";
import { useTheme } from "./theme";
import { dayLabel, loadIndex, refreshedLabel, type IndexMeta } from "@/lib/plat";

/**
 * Minimal chrome. The old nav carried Courses / Easy GEs / Planner plus a
 * search plus a term chip; browsing and GE-hunting are both just search with
 * different filters, so only the planner earns a permanent slot — and housing,
 * which is not a filter on courses but the other thing a term needs settled.
 */
export default function PlatShell({
  children,
  hideSearch = false,
}: {
  children: React.ReactNode;
  hideSearch?: boolean;
}) {
  const pathname = usePathname();
  const { theme, toggle } = useTheme();
  const [meta, setMeta] = useState<IndexMeta | null>(null);

  useEffect(() => { loadIndex().then((d) => setMeta(d.meta)).catch(() => {}); }, []);
  const refreshed = refreshedLabel(meta?.refreshed);

  return (
    <div className="min-h-screen bg-white text-gray-900 dark:bg-[#0d1420] dark:text-gray-100">
      <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/90 backdrop-blur dark:border-white/10 dark:bg-[#0d1420]/90">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4 sm:gap-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="UCSDPlans home">
            <TridentMark className="h-8 w-8" />
            {/* On a phone the search needs the width more than the name does. */}
            <span className={`text-[15px] font-bold tracking-tight ${hideSearch ? "" : "hidden sm:inline"}`}>
              UCSD<span className="text-[#1B2C4F] dark:text-[#FFC72C]">Plans</span>
            </span>
          </Link>

          {!hideSearch && <SearchBox className="min-w-0 flex-1" />}

          <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
            {/* Who made this and how to reach them, one click away on every page. */}
            <ContactMenu />

            <button
              type="button"
              onClick={toggle}
              aria-label="Toggle dark mode"
              className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 dark:hover:bg-white/10"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            {/* Icon-only on a phone, where the search needs the width. */}
            <Link
              href="/housing"
              aria-current={pathname.startsWith("/housing") ? "page" : undefined}
              aria-label="Housing"
              className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium transition sm:px-3 ${
                pathname.startsWith("/housing")
                  ? "bg-gray-100 text-[#182B49] dark:bg-white/10 dark:text-[#FFCD00]"
                  : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10"
              }`}
            >
              <House className="h-4 w-4 sm:hidden" />
              <span className="hidden sm:inline">Housing</span>
              <span className="hidden rounded-full bg-[#FFCD00] px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-[#182B49] sm:inline">
                New
              </span>
            </Link>

            <Link
              href="/import"
              aria-current={pathname.startsWith("/import") ? "page" : undefined}
              className={`hidden rounded-lg px-3 py-1.5 text-sm font-medium transition sm:inline-flex ${
                pathname.startsWith("/import")
                  ? "bg-gray-100 text-[#182B49] dark:bg-white/10 dark:text-[#FFCD00]"
                  : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10"
              }`}
            >
              Academic History
            </Link>

            {/* The planner is the other half of the product, so it gets a filled
                button rather than a text link that reads as chrome — icon-only on
                a phone, like Housing, so the search keeps its room. One name
                everywhere: it was "AI Planner" here and "Term workspace" inside. */}
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
      </header>

      <main>{children}</main>

      <footer className="mt-20 border-t border-gray-200 py-8 dark:border-white/10">
        <div className="mx-auto max-w-7xl space-y-3 px-4 text-[11px] leading-relaxed text-gray-400 dark:text-gray-500 sm:px-6 lg:px-8">
          {meta && (
            <p>
              {meta.gradeRecords.toLocaleString()} course–instructor grade distributions, {meta.years},
              from the{" "}
              <a
                href="https://asmain.ucsd.edu/Home/InstructorGradeArchive"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2 hover:text-gray-600 dark:hover:text-gray-300"
              >
                UCSD Associated Students Instructor Grade Archive
              </a>{" "}
              (retrieved {dayLabel(meta.generated, { weekday: false, year: true })}), matched to{" "}
              <a
                href="https://www.ratemyprofessors.com"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2 hover:text-gray-600 dark:hover:text-gray-300"
              >
                RateMyProfessors
              </a>
              . Course listings, units and prerequisites come from the{" "}
              <a
                href="https://catalog.ucsd.edu/front/courses.html"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2 hover:text-gray-600 dark:hover:text-gray-300"
              >
                UCSD General Catalog
              </a>
              ; {meta.termName} sections, rooms and seats from UCSD&rsquo;s{" "}
              <a
                href="https://classplanner.apps.ucsd.edu"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2 hover:text-gray-600 dark:hover:text-gray-300"
              >
                Class Planner
              </a>
              {refreshed ? `, as of ${refreshed}` : ""}. Historical grades describe the past, not your
              quarter — confirm requirements with your college advisor.
            </p>
          )}
          <p>
            How the letter badge is worked out: it is not a grade anyone received. For each course we
            take every published grade record (one per instructor per quarter), average their GPAs
            weighted by the number of quarters each instructor taught it, and round that average to
            the nearest official UCSD grade point — 3.85+ shows A, 3.50+ A−, 3.15+ B+, 2.85+ B, 2.50+
            B−, 2.15+ C+, 1.85+ C, 1.50+ C−, and D or F below that. Quarters the archive publishes without a GPA
            (fully pass/no-pass offerings, sections too small to report) are left out of that average
            rather than counted as zeros. Each letter always has the same colour: A dark green, A− green,
            B+ amber, B and B− orange, C+ and below red. Sorting by best grades orders courses by that
            same average, highest first. An amber dot means a single term of history stands behind the
            letter, and a dash means no published history at all. Weighting counts terms taught rather than students
            enrolled, so an instructor with many small sections pulls the average further than one
            with a couple of large lectures. Professor badges apply the same rule to that professor’s
            own records.
          </p>
        </div>
      </footer>
    </div>
  );
}
