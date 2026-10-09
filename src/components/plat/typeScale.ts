/**
 * The site's type scale, one class string per role, so every page ranks its
 * text the same way. Titles are set small on purpose: the content — a grade,
 * a seat count, a list of courses — is what should lead, and the display-size
 * titles and hero bands these replaced pushed it below a laptop's fold.
 *
 * Data keeps its own sizes (grade badges, rent, commute minutes): it may
 * outrank the page title, and usually should.
 */

/** One per page: what the page is. Through PageHeader. */
export const PAGE_TITLE = "text-lg font-semibold tracking-tight sm:text-xl";

/** One line under the title saying what the page holds. */
export const PAGE_DESCRIPTION = "text-sm text-gray-600 dark:text-gray-300";

/**
 * Opens a section or a card. No colour of its own, so it reads correctly on
 * the plain page and inside a tinted notice alike.
 */
export const SECTION_TITLE = "text-sm font-semibold";

/** Names a group rather than opening a section: list groups, fields, table heads. */
export const LABEL = "text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400";
