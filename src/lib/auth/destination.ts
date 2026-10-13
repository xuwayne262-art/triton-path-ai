/**
 * What the login page says, for where the student was going.
 *
 * The Planner, the Academic History and Housing all sent students to the same
 * "Welcome to UCSDPlans" screen, with nothing on it about why a sign-in was
 * needed there or what it would unlock. Each destination now says what it is
 * for, and what signing in does and does not mean.
 */

import { isPublicPath } from "./routes";
import { safeInternalPath } from "./redirects";

export interface Destination {
  /** The page's heading: what signing in gets them to. */
  title: string;
  /** One sentence on what the destination does with the account. */
  reason: string;
  /** What stays private, or what will be waiting after sign-in. */
  detail?: string;
}

const COURSE = /^[A-Z]{2,5} \d{1,3}[A-Z]{0,4}$/;

/** The destination's own words, from the path the login page will return to. */
export function destinationFor(next: string): Destination {
  const url = new URL(next, "https://ucsdplans.invalid");
  const path = url.pathname;
  if (path === "/planner" || path.startsWith("/planner/")) {
    const add = (url.searchParams.get("add") ?? "").trim();
    const pick = url.searchParams.get("pick");
    return {
      title: "Sign in to use the Planner",
      reason: "Save your weekly schedule and four-year plan to your UCSD account, so they follow you to any device.",
      detail: COURSE.test(add)
        ? `You’ll land in the Planner with ${add}${pick ? " and the sections you chose" : ""} ready to add.`
        : "Your plan is shown only to you.",
    };
  }
  if (path === "/housing" || path.startsWith("/housing/")) {
    return {
      title: "Sign in to see Housing",
      reason: "View sublets and rooms posted by UCSD students, with the walk to your own classes.",
      detail: "Listings, addresses and contact details are shown only to students signed in with a @ucsd.edu account.",
    };
  }
  if (path === "/import" || path.startsWith("/import/")) {
    return {
      title: "Sign in to import your Academic History",
      reason: "Import your completed courses so the Planner can count them toward your degree.",
      detail: "Your record is saved to your account and shown only to you; you can delete it at any time.",
    };
  }
  if (path.startsWith("/course/")) {
    return {
      title: "Sign in to save courses",
      reason: "Save courses and your section choices to your Planner, synced to your UCSD account.",
      detail: "You’ll come back to the course you were looking at.",
    };
  }
  return {
    title: "Sign in to UCSDPlans",
    reason: "Your Planner, Academic History and Housing need a UCSD account; browsing courses never does.",
  };
}

/**
 * Where "Back to browsing" goes: the page the student came from when it is a
 * public one, so the link can never lead back into the sign-in it escapes.
 */
export function browseBackHref(from: unknown): string {
  const path = safeInternalPath(from, "/");
  const pathname = path.split(/[?#]/)[0];
  return isPublicPath(pathname) ? path : "/";
}

/**
 * The destination Auth.js was holding when a sign-in failed: it keeps the
 * return address in its callback-url cookie through Google's round trip, and
 * its error redirect drops it from the URL. Null when the cookie is missing or
 * names anything but a safe page of this site.
 */
export function destinationFromCookie(value: string | undefined, origin: string): string | null {
  // Auth.js stores an absolute URL; a path is accepted too, anything else is not a destination.
  if (!value || !(/^https?:\/\//i.test(value) || value.startsWith("/"))) return null;
  try {
    const url = new URL(value, origin);
    if (url.origin !== new URL(origin).origin) return null;
    const path = safeInternalPath(url.pathname + url.search, "");
    return path || null;
  } catch {
    return null;
  }
}
