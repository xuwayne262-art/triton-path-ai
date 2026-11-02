/**
 * One rule for every request that changes a student's data: it comes from
 * this site.
 *
 * Browsers send `Origin` on every cross-site POST, PUT and DELETE, so a
 * request whose Origin names another site was made by another site's page —
 * the shape of a cross-site request forgery riding the student's cookie. The
 * session cookie is SameSite=Lax already; this is the second lock. A request
 * with no Origin at all comes from something that is not a browser page
 * (curl, a server) and still needs the student's session, so it is allowed,
 * matching Plan with AI's apply and interpret handlers.
 */
export function fromAnotherSite(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return origin !== new URL(request.url).origin;
  } catch {
    return true;
  }
}

/** The response to a request {@link fromAnotherSite} refused. */
export function crossSiteResponse(): Response {
  return Response.json(
    { error: "Please make this change from UCSDPlans itself.", code: "INVALID_ORIGIN" },
    { status: 403, headers: { "Cache-Control": "no-store" } },
  );
}
