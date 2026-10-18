/**
 * What the middleware lets through unauthenticated.
 *
 * Browsing is open, the way UCSBPlat's is: the course explorer — home, the
 * department and course pages, professors, GEs, About, Announcements — and
 * the dataset they read, so a link sent to a friend or found on a search
 * engine opens the page instead of a sign-in wall. What belongs to a student
 * stays behind their @ucsd.edu sign-in: the Planner, the Academic History,
 * housing (listers posted expecting only UCSD students to see their place
 * and contacts), and every API that reads or writes their data.
 */

/**
 * Prefixes reachable without a session. Each ends in a slash: "/login" as a
 * bare prefix also let through any future page whose path merely began with
 * it — "/logins", "/login-history" — unauthenticated. The page itself is the
 * exact match below.
 */
const PUBLIC_PREFIXES = [
  "/login/",
  "/api/auth/",
  "/_next/",
  "/brand/", // the UCSDPlans logo shown on the login page
  // The course explorer and what it reads.
  "/courses/",
  "/course/",
  "/professor/",
  "/data/plat/",
  // Checks CRON_SECRET itself; the scheduler has no session to show.
  "/api/cron/",
] as const;

/** Exact paths reachable without a session. */
const PUBLIC_FILES = new Set([
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
  "/manifest.webmanifest",
  "/apple-touch-icon.png",
]);

/** Exact pages and read-only endpoints anyone may open. */
const PUBLIC_PAGES = new Set([
  "/",
  "/courses",
  "/discover",
  // Public availability probe only. POST performs its own server session check.
  "/api/course-search",
  "/ge",
  "/about",
  "/announcements",
  // Seat counts over time, read by the public course page.
  "/api/seats",
]);

export function isPublicPath(pathname: string): boolean {
  if (pathname === "/login") return true;
  if (PUBLIC_FILES.has(pathname) || PUBLIC_PAGES.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/**
 * API and data requests get a 401 rather than a redirect: a fetch() that
 * follows a 302 to an HTML login page fails confusingly at the JSON parse.
 */
export function expectsJson(pathname: string): boolean {
  return pathname.startsWith("/api/") || pathname.startsWith("/data/");
}

/** What the proxy should do with one request. */
export type AccessDecision =
  | { kind: "allow" }
  | { kind: "json401" }
  | { kind: "redirect"; next: string | null; ineligible: boolean };

/**
 * The complete access rule, as a pure function so it can be tested directly
 * rather than only through a running server.
 *
 * `email` is whatever the session carries — eligibility is re-checked here on
 * every request, so a session that outlives a change to the rule loses access
 * immediately instead of coasting on having once been valid.
 */
export function decideAccess(
  pathname: string,
  search: string,
  email: unknown,
  isEligible: (email: unknown) => boolean,
): AccessDecision {
  if (isPublicPath(pathname)) return { kind: "allow" };
  if (isEligible(email)) return { kind: "allow" };
  if (expectsJson(pathname)) return { kind: "json401" };

  const wanted = pathname + search;
  return {
    kind: "redirect",
    next: wanted === "/" ? null : wanted,
    ineligible: typeof email === "string" && email !== "",
  };
}
