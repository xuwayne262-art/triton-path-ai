/**
 * The words in the browser tab. The home page is named in full; every other
 * page puts its own name first, so a row of tabs reads by page before site.
 *
 * The root layout's title template comes from here, and so does every title
 * set where the template does not reach: link previews (og:title), and a
 * housing listing that renames its tab once it has loaded.
 */
export const SITE_NAME = "UCSDPlans";

/** The home page's title, and the fallback for a page that names none. */
export const HOME_TITLE = `${SITE_NAME} — UCSD Course Planner`;

/** A page's full title: "ECON 110B Intermediate Macroeconomics | UCSDPlans". */
export const pageTitle = (page: string): string => `${page} | ${SITE_NAME}`;

/** The same, in the form Next.js's `title.template` takes. */
export const TITLE_TEMPLATE = pageTitle("%s");
