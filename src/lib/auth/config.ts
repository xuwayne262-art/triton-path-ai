/**
 * Auth environment, read in one place so the login page, the middleware and
 * the Auth.js setup all agree on whether sign-in is usable.
 *
 * Edge-safe: nothing here touches a Node-only API.
 */

/** Auth.js reads AUTH_* by convention; the GOOGLE_* spellings are accepted too. */
export const GOOGLE_CLIENT_ID =
  process.env.AUTH_GOOGLE_ID ?? process.env.GOOGLE_CLIENT_ID ?? "";

export const GOOGLE_CLIENT_SECRET =
  process.env.AUTH_GOOGLE_SECRET ?? process.env.GOOGLE_CLIENT_SECRET ?? "";

const CONFIGURED_SECRET = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "";

/** True only when a real sign-in can actually complete. */
export const AUTH_CONFIGURED = Boolean(
  GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && CONFIGURED_SECRET,
);

/**
 * A random per-process value stands in when AUTH_SECRET is unset.
 *
 * This is not a fallback that lets anything work: with no Google credentials
 * no session can be created in the first place. It exists so an unconfigured
 * deployment fails closed at the login page instead of crashing every request,
 * and a random value cannot be forged the way a hard-coded one could.
 */
export const AUTH_SECRET = CONFIGURED_SECRET || `unconfigured-${crypto.randomUUID()}`;

/** Names of the variables still missing, for the setup notice. */
export function missingAuthEnv(): string[] {
  const missing: string[] = [];
  if (!GOOGLE_CLIENT_ID) missing.push("AUTH_GOOGLE_ID");
  if (!GOOGLE_CLIENT_SECRET) missing.push("AUTH_GOOGLE_SECRET");
  if (!CONFIGURED_SECRET) missing.push("AUTH_SECRET");
  return missing;
}

/** Session lifetime: a week, so a term of planning does not mean weekly logins. */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
