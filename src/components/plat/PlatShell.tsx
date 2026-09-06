"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Moon, Sparkles, Sun } from "lucide-react";
import SearchBox from "./SearchBox";
import TridentMark from "./TridentMark";
import { useTheme } from "./theme";
import { loadIndex, type IndexMeta } from "@/lib/plat";

/**
 * Minimal chrome. The old nav carried Courses / Easy GEs / Planner plus a
 * search plus a term chip; browsing and GE-hunting are both just search with
 * different filters, so only the planner earns a permanent slot.
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

  return (
    <div className="min-h-screen bg-white text-gray-900 dark:bg-[#0d1420] dark:text-gray-100">
      <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/90 backdrop-blur dark:border-white/10 dark:bg-[#0d1420]/90">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex shrink-0 items-center gap-2.5">
            <TridentMark className="h-8 w-8" />
            <span className="text-[15px] font-bold tracking-tight">
              UCSD<span className="text-[#1B2C4F] dark:text-[#FFC72C]">Plans</span>
            </span>
          </Link>

          {!hideSearch && <SearchBox className="min-w-0 flex-1" />}

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={toggle}
              aria-label="Toggle dark mode"
              className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 dark:hover:bg-white/10"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            {/* The planner is the other half of the product, so it gets a filled
                button rather than a text link that reads as chrome. */}
            <Link
              href="/planner"
              aria-current={pathname.startsWith("/planner") ? "page" : undefined}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold shadow-sm transition ${
                pathname.startsWith("/planner")
                  ? "bg-[#FFCD00] text-[#182B49] ring-2 ring-[#182B49]/20 dark:ring-white/25"
                  : "bg-[#182B49] text-white hover:bg-[#1e3a63] dark:bg-[#FFCD00] dark:text-[#182B49] dark:hover:bg-[#FFD740]"
              }`}
            >
              <Sparkles className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">AI Planner</span>
              <span className="sm:hidden">Plan</span>
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
              </a>
              , matched to{" "}
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
              . Snapshot {meta.generated}. Historical grades describe the past, not your quarter —
              confirm requirements with your college advisor.
            </p>
          )}
          <p>
            How the letter badge is worked out: it is not a grade anyone received. For each course we
            take every published grade record (one per instructor per quarter), average their GPAs
            weighted by the number of quarters each instructor taught it, and round that average to
            the nearest official UCSD grade point — 3.85+ shows A, 3.50+ A−, 3.15+ B+, 2.85+ B, 2.50+
            B−, 2.15+ C+, 1.85+ C, anything lower C−. Quarters the archive publishes without a GPA
            (fully pass/no-pass offerings, sections too small to report) are left out of that average
            rather than counted as zeros. The colour follows a coarser scale of the same
            average (3.70+ very generous, 3.40+ generous, 3.00+ average, 2.60+ tough, below that
            brutal), an amber dot means a single term of history stands behind the letter, and a dash
            means no published history at all. Weighting counts terms taught rather than students
            enrolled, so an instructor with many small sections pulls the average further than one
            with a couple of large lectures. Professor badges apply the same rule to that professor’s
            own records.
          </p>
        </div>
      </footer>
    </div>
  );
}
