/**
 * What the middleware lets through unauthenticated.
 *
 * The allowlist is deliberately short: the login page, the Auth.js endpoints,
 * and the assets the login page itself needs to render. Everything else —
 * every app page, every API route, and the course dataset under /data — is
 * protected, because the dataset is the product, not just the pages showing it.
 */

/** Prefixes reachable without a session. */
const PUBLIC_PREFIXES = [
  "/login",
  "/api/auth/",
  "/_next/",
  "/brand/", // the UCSDPlans logo shown on the login page
] as const;

/** Exact paths reachable without a session. */
const PUBLIC_FILES = new Set([
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
  "/manifest.webmanifest",
  "/apple-touch-icon.png",
]);

export function isPublicPath(pathname: string): boolean {
  if (pathname === "/login") return true;
  if (PUBLIC_FILES.has(pathname)) return true;
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
