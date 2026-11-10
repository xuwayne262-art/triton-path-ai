import Link from "next/link";
import {
  ACCURACY_NOTE,
  FOOTER_LINKS,
  INDEPENDENCE_NOTE,
  LEGAL_LINKS,
  copyrightLine,
  sanDiegoYear,
  type LegalLink,
} from "@/lib/legal";

const FOCUS =
  "rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#182B49] dark:focus-visible:outline-[#FFCD00]";

/**
 * The bottom of every explorer page: who runs the site, what to double-check,
 * and the legal pages. It sits in the page's flow after everything else, so
 * it never covers a control; on a phone the links stack one per line.
 */
export function LegalNotice({ before, extra = [] }: { before?: React.ReactNode; extra?: readonly LegalLink[] }) {
  // "Contact" stays last, after any page-specific links.
  const links = [...FOOTER_LINKS.filter((l) => l.label !== "Contact"), ...extra, ...FOOTER_LINKS.filter((l) => l.label === "Contact")];
  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:justify-between lg:gap-16">
      <div className="max-w-3xl space-y-3 text-[13px] leading-relaxed text-gray-600 dark:text-gray-400">
        {before}
        <p>{INDEPENDENCE_NOTE}</p>
        <p>{ACCURACY_NOTE}</p>
        {/* The year is San Diego's on both server and browser; only a page open across New Year's could differ. */}
        <p suppressHydrationWarning>{copyrightLine(sanDiegoYear())}</p>
      </div>
      <nav aria-label="Legal and about" className="shrink-0">
        <ul className="flex flex-col gap-2.5 text-[13px] font-semibold sm:flex-row sm:flex-wrap sm:gap-x-5 lg:flex-col lg:gap-2">
          {links.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className={`text-gray-700 underline-offset-2 hover:text-gray-900 hover:underline dark:text-gray-300 dark:hover:text-white ${FOCUS}`}>
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

/**
 * The Planner fills the window and scrolls inside its panes, so its legal
 * links sit in one slim row under them: part of the layout, never an overlay.
 * A phone keeps the links and drops the sentence, which every other page
 * carries in full.
 */
export function LegalStrip() {
  return (
    <footer className="shrink-0 border-t border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 dark:border-white/10 dark:bg-gray-800 dark:text-gray-300 sm:px-4">
      <div className="flex items-center gap-x-4">
        <p className="hidden min-w-0 truncate md:block">Independent student project, not affiliated with UC San Diego.</p>
        <nav aria-label="Legal" className="flex shrink-0 items-center gap-x-3 md:ml-auto">
          {LEGAL_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className={`font-medium underline-offset-2 hover:text-gray-900 hover:underline dark:hover:text-white ${FOCUS}`}>
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
