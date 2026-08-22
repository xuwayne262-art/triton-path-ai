"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Moon, Sparkles, Sun } from "lucide-react";
import SearchBox from "./SearchBox";
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
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-4">
          <Link href="/" className="flex shrink-0 items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#182B49] text-[11px] font-black text-[#FFCD00] dark:bg-[#FFCD00] dark:text-[#182B49]">
              TP
            </span>
            <span className="text-sm font-bold">TritonPlat</span>
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
        <div className="mx-auto max-w-5xl px-4 text-xs leading-relaxed text-gray-400">
          {meta && (
            <p>
              {meta.gradeRecords.toLocaleString()} published UCSD grade distributions, {meta.years},
              matched to RateMyProfessors. Snapshot {meta.generated}. Historical grades describe the
              past, not your quarter — confirm requirements with your college advisor.
            </p>
          )}
        </div>
      </footer>
    </div>
  );
}
