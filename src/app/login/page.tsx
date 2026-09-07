import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth, LOGIN_ERROR } from "@/auth";
import { AUTH_CONFIGURED, missingAuthEnv } from "@/lib/auth/config";
import { INELIGIBLE_MESSAGE, isEligibleEmail } from "@/lib/auth/eligibility";
import { safeInternalPath } from "@/lib/auth/redirects";
import LoginView from "@/components/auth/LoginView";

export const metadata: Metadata = {
  title: "Sign in — UCSDPlans",
  description: "Sign in with your @ucsd.edu Google account to use UCSDPlans.",
};

// The session and the error banner are per-request; nothing here may be cached.
export const dynamic = "force-dynamic";

/**
 * Turns an Auth.js or Google error code into one sentence a student can act on.
 *
 * Nothing from the query string is echoed back — only these fixed strings are
 * ever rendered, so a crafted `?error=` cannot inject text into the page.
 */
function errorMessage(code: string | undefined): string | null {
  if (!code) return null;
  switch (code) {
    case LOGIN_ERROR.ineligible:
    case "AccessDenied":
      return INELIGIBLE_MESSAGE;
    case "access_denied":
    case LOGIN_ERROR.cancelled:
      return "Sign-in was cancelled. You can try again below.";
    case "Configuration":
      return "Sign-in is not available right now. Please try again later.";
    default:
      return "Something went wrong signing you in. Please try again.";
  }
}

function firstValue(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = safeInternalPath(firstValue(params.next));

  // Already signed in with an account we accept? Go straight into the app.
  if (AUTH_CONFIGURED) {
    const session = await auth();
    if (session?.user && isEligibleEmail(session.user.email)) redirect(next);
  }

  // Shown only when unconfigured, so the operator sees the exact URI to paste
  // into the Google console rather than having to guess the host.
  const host = (await headers()).get("host") ?? "localhost:3000";
  const isLocalHost = host.startsWith("localhost") || host.startsWith("127.0.0.1");
  const scheme = isLocalHost ? "http" : "https";
  const callbackUrls = [`${scheme}://${host}/api/auth/callback/google`];

  return (
    <LoginView
      next={next}
      error={errorMessage(firstValue(params.error))}
      configured={AUTH_CONFIGURED}
      missingEnv={missingAuthEnv()}
      callbackUrls={callbackUrls}
      isLocalHost={isLocalHost}
    />
  );
}
