/**
 * The site's type scale, one class string per role, so every page ranks its
 * text the same way. Titles are set small on purpose: the content — a grade,
 * a seat count, a list of courses — is what should lead, and the display-size
 * titles and hero bands these replaced pushed it below a laptop's fold.
 *
 * Data keeps its own sizes (grade badges, rent, commute minutes): it may
 * outrank the page title, and usually should.
 *
 * Small titles need room around them, or a page reads as crowded: the
 * spacing below is generous on purpose, and scrolling is the accepted cost.
 */

/** One per page: what the page is. Through PageHeader. */
export const PAGE_TITLE = "text-lg font-semibold tracking-tight sm:text-xl";

/** A line or two under the title saying what the page holds. */
export const PAGE_DESCRIPTION = "text-sm leading-relaxed text-gray-600 dark:text-gray-300";

/**
 * Opens a section or a card. No colour of its own, so it reads correctly on
 * the plain page and inside a tinted notice alike.
 */
export const SECTION_TITLE = "text-sm font-semibold";

/** Names a group rather than opening a section: list groups, fields, table heads. */
export const LABEL = "text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400";

/** A page's own padding inside the site frame: room above the title, more below the content. */
export const PAGE_PAD = "pb-16 pt-8 sm:pt-10";

/** From the page header to the first thing under it. */
export const PAGE_GAP = "mt-8 sm:mt-10";
