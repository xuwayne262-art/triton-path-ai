/**
 * The single eligibility rule: the email Google verified must end exactly in
 * "@ucsd.edu".
 *
 * "Exactly" is the point. A subdomain address like alice@eng.ucsd.edu ends in
 * ".ucsd.edu" but not "@ucsd.edu", and is rejected. So is anything that merely
 * contains the string, such as alice@ucsd.edu.example.com.
 *
 * There is deliberately no approval list, no student/faculty check and no
 * hosted-domain parameter — the browser could influence the last one, and the
 * other two are not part of this rule.
 */

export const ALLOWED_EMAIL_SUFFIX = "@ucsd.edu";

/** Lower-cases and trims. Returns null for anything that is not usable text. */
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  return email === "" ? null : email;
}

export function isEligibleEmail(raw: unknown): boolean {
  const email = normalizeEmail(raw);
  if (email === null) return false;
  if (!email.endsWith(ALLOWED_EMAIL_SUFFIX)) return false;

  // Exactly one "@", and something in front of it.
  const local = email.slice(0, -ALLOWED_EMAIL_SUFFIX.length);
  return local.length > 0 && !local.includes("@");
}

/** The claims we rely on, as they arrive from Google's verified ID token. */
export interface GoogleIdentity {
  email?: unknown;
  email_verified?: unknown;
}

/**
 * Google must both verify the address and vouch for the mailbox. An
 * unverified address proves nothing about who controls it.
 *
 * `email_verified` is normally a boolean but some Google responses stringify
 * it, so both spellings of true are accepted and nothing else is.
 */
export function isEligibleIdentity(identity: GoogleIdentity | null | undefined): boolean {
  if (!identity) return false;
  const verified = identity.email_verified;
  if (verified !== true && verified !== "true") return false;
  return isEligibleEmail(identity.email);
}

/** Shown verbatim to anyone Google authenticated but we cannot admit. */
export const INELIGIBLE_MESSAGE = "Please sign in with your @ucsd.edu Google account.";
