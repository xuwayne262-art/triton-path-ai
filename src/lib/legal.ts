/**
 * The legal pages and the notice at the foot of every page.
 *
 * The wording of the Privacy Policy is tied to how the site actually handles
 * data (sign-in, the plan and Academic History stores, housing, Plan with AI).
 * Change one, and check the other: src/lib/legal.test.ts reads the pages for
 * leftover placeholders, but it cannot tell whether a sentence is still true.
 */

/**
 * The San Diego day the current Privacy Policy, Terms of Use and Disclaimer
 * took effect. Move it to the day a revision goes live, never ahead of it.
 */
export const LEGAL_EFFECTIVE_DATE = "2026-11-09";

export interface LegalLink {
  href: string;
  label: string;
}

/** The three legal pages, in the order the footer lists them. */
export const LEGAL_LINKS: readonly LegalLink[] = [
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms of Use" },
  { href: "/disclaimer", label: "Disclaimer" },
];

/** Everything the footer links: the legal pages, then who runs the site and how to reach them. */
export const FOOTER_LINKS: readonly LegalLink[] = [
  ...LEGAL_LINKS,
  { href: "/about", label: "About & data sources" },
  { href: "/about#contact", label: "Contact" },
];

export const INDEPENDENCE_NOTE =
  "UCSDPlans is an independent, student-created website. It is not affiliated with, sponsored by, endorsed by, or operated by the University of California San Diego, the University of California, or The Regents of the University of California.";

export const ACCURACY_NOTE =
  "Course information, seat counts, grade histories, ratings, and planning suggestions may be incomplete or outdated. Confirm enrollment details and degree requirements through official UC San Diego resources and your academic advisor.";

/** The year in San Diego, the way every other date on the site is read. */
export function sanDiegoYear(now: Date = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", year: "numeric" }).format(now));
}

/**
 * Covers only what the site's maintainer holds rights in: not UCSD's data,
 * the grade archive, RateMyProfessors' scores or anything students post.
 */
export const copyrightLine = (year: number) =>
  `Copyright © ${year} UCSDPlans. Third-party names, marks, and content belong to their respective owners.`;

/** Readable inline links in legal text: underlined, not told apart by colour alone, with a visible focus ring. */
export const LEGAL_LINK =
  "font-medium text-[#182B49] underline underline-offset-2 hover:decoration-2 focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#182B49] dark:text-[#FFCD00] dark:focus-visible:outline-[#FFCD00]";
