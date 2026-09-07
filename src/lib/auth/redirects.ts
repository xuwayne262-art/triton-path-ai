/**
 * Post-login destinations.
 *
 * An open redirect here would let a phishing link send a student to an
 * attacker's page immediately after a real sign-in, so only same-site paths
 * are ever returned. Everything else falls back to the homepage.
 */

export const DEFAULT_AFTER_LOGIN = "/";

/** Paths that must never be a landing destination — they would loop. */
function isAuthPath(path: string): boolean {
  return (
    path === "/login" ||
    path.startsWith("/login/") ||
    path.startsWith("/login?") ||
    path.startsWith("/api/auth")
  );
}

/**
 * Returns `raw` when it is a safe same-site path, otherwise `fallback`.
 *
 * Rejects absolute URLs ("https://evil.test"), protocol-relative ones
 * ("//evil.test"), backslash variants that some browsers normalise to a slash
 * ("/\evil.test"), and control characters used to smuggle those past a check.
 */
export function safeInternalPath(
  raw: unknown,
  fallback: string = DEFAULT_AFTER_LOGIN,
): string {
  if (typeof raw !== "string") return fallback;

  const value = raw.trim();
  if (value === "" || !value.startsWith("/")) return fallback;
  if (value.startsWith("//")) return fallback;
  if (value.includes("\\")) return fallback;
  // "/ //evil.test" stays same-origin once encoded, so it is not an open
  // redirect — but no real route starts with a slash and a space, and letting
  // it through only invites a parser somewhere else to disagree with us.
  if (/^\/\s/.test(value)) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(value)) return fallback;
  if (isAuthPath(value)) return fallback;

  return value;
}

/**
 * Resolves whatever Auth.js hands the `redirect` callback down to a same-origin
 * URL string, or the site root.
 */
export function safeRedirectUrl(url: string, baseUrl: string): string {
  let target: URL;
  let base: URL;
  try {
    base = new URL(baseUrl);
    target = new URL(url, base);
  } catch {
    return baseUrl;
  }

  if (target.origin !== base.origin) return base.toString();

  const path = safeInternalPath(target.pathname + target.search, DEFAULT_AFTER_LOGIN);
  return new URL(path, base).toString();
}
