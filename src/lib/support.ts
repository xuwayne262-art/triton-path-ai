/**
 * The donation note: a small card in the corner of the explorer pages asking
 * visitors to help pay for the site, with the maintainer's Zelle.
 *
 * It opens by itself at most once per browser session, after a visitor has
 * spent a while on a page, and never on a page where they are filling
 * something in. Closing it keeps it shut for a week. The footer's "Support
 * UCSDPlans" opens it any time.
 */

export const ZELLE_PHONE = "(858) 241-8744";
/** The QR code from Zelle, served as a public file (see PUBLIC_FILES in src/lib/auth/routes.ts). */
export const ZELLE_QR = "/support/zelle-qr.jpg";

/** Fired on window to open the note, from the footer button. */
export const OPEN_SUPPORT_EVENT = "ucsdplans-open-support";
/** localStorage: when the visitor last closed it (ms since epoch). */
export const SUPPORT_DISMISSED_KEY = "ucsdplans-support-dismissed";
/** sessionStorage: it already opened by itself this session. */
export const SUPPORT_SHOWN_KEY = "ucsdplans-support-shown";

/** How long a page is read before the note opens by itself. */
export const SUPPORT_DELAY_MS = 15_000;
/** How long closing it keeps it from opening by itself again. */
export const SUPPORT_QUIET_DAYS = 7;

/** Pages where someone is typing or reading terms: the note waits for another page. */
const QUIET_PATHS = ["/import", "/housing/new", "/privacy", "/terms", "/disclaimer"];

export function isQuietPath(pathname: string): boolean {
  return QUIET_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Whether the note may open by itself now. */
export function shouldAutoOpen({
  now,
  dismissedAt,
  shownThisSession,
  pathname,
}: {
  now: number;
  dismissedAt: number | null;
  shownThisSession: boolean;
  pathname: string;
}): boolean {
  if (shownThisSession || isQuietPath(pathname)) return false;
  if (dismissedAt !== null && Number.isFinite(dismissedAt) && now - dismissedAt < SUPPORT_QUIET_DAYS * 86_400_000) return false;
  return true;
}
