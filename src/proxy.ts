import { NextResponse } from "next/server";
import { auth, LOGIN_ERROR } from "@/auth";
import { decideAccess } from "@/lib/auth/routes";
import { safeInternalPath } from "@/lib/auth/redirects";
import { isEligibleEmail } from "@/lib/auth/eligibility";

/**
 * Server-side protection for every page, API route and dataset file.
 *
 * This runs before any route handler, so an unauthenticated request never
 * reaches page code, an API handler or a JSON file under /data. It fails
 * closed: when sign-in is unconfigured no session can exist, so everything
 * except the login page stays shut rather than falling open.
 */
export default auth((req) => {
  const { pathname, search } = req.nextUrl;

  const decision = decideAccess(pathname, search, req.auth?.user?.email, isEligibleEmail);

  if (decision.kind === "allow") return NextResponse.next();

  // A fetch() following a 302 into an HTML login page fails at JSON.parse and
  // looks like a bug, so data callers get a status they can act on.
  if (decision.kind === "json401") {
    return NextResponse.json(
      { error: "Sign in to continue.", code: "AUTH_REQUIRED" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  // Remembered so login can return the student to what they actually asked for.
  if (decision.next) {
    const wanted = safeInternalPath(decision.next);
    if (wanted !== "/") url.searchParams.set("next", wanted);
  }
  // Signed in but on the wrong domain: say why, rather than looping silently.
  if (decision.ineligible) url.searchParams.set("error", LOGIN_ERROR.ineligible);
  return NextResponse.redirect(url);
});

export const config = {
  /**
   * Everything except Next's build output and image optimiser. The allowlist
   * proper lives in `isPublicPath`, so it stays one readable list that the
   * tests can exercise directly.
   */
  matcher: ["/((?!_next/static|_next/image).*)"],
};
