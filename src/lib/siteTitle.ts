/**
 * How the site names itself in a browser tab and in search results. The home
 * page is named in full; every other page puts its own name first, so a row
 * of tabs reads by page before site.
 *
 * The root layout's title template comes from here, and so does every title
 * set where the template does not reach: link previews (og:title), and a
 * housing listing that renames its tab once it has loaded.
 */
export const SITE_NAME = "UCSDPlans";

/** The home page's title, and the fallback for a page that names none. */
export const HOME_TITLE = `${SITE_NAME} — UCSD Course Planner, Grades & Professor Ratings`;

/**
 * The home page's description, the snippet a search result shows under the
 * title. Also the fallback for a page that describes itself in no other way.
 * The home page's introduction says the same things on screen.
 */
export const HOME_DESCRIPTION =
  "Explore UCSD courses, compare historical grades and professor ratings, find GEs by college, and build your quarterly schedule with UCSDPlans.";

/** A page's full title: "ECON 110B Short Run Macroeconomics | UCSDPlans". */
export const pageTitle = (page: string): string => `${page} | ${SITE_NAME}`;

/** The same, in the form Next.js's `title.template` takes. */
export const TITLE_TEMPLATE = pageTitle("%s");
