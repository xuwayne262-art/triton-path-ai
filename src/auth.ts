import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import {
  AUTH_CONFIGURED,
  AUTH_SECRET,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/auth/config";
import { isEligibleIdentity, normalizeEmail } from "@/lib/auth/eligibility";
import { safeRedirectUrl } from "@/lib/auth/redirects";

/**
 * Google sign-in for UCSDPlans.
 *
 * Every eligibility decision happens here, on the server, against the claims
 * Auth.js took from Google's ID token — never against anything the browser
 * sent us. The browser's only influence on this flow is which Google account
 * it picks, and Google is what tells us the result.
 */

/** Error codes the login page knows how to phrase for a student. */
export const LOGIN_ERROR = {
  ineligible: "ucsd_only",
  cancelled: "cancelled",
  failed: "failed",
} as const;

/**
 * The provider list is empty until credentials exist, so an unconfigured
 * deployment cannot start a sign-in it has no way to finish.
 */
const providers = AUTH_CONFIGURED
  ? [
      Google({
        clientId: GOOGLE_CLIENT_ID,
        clientSecret: GOOGLE_CLIENT_SECRET,
        authorization: {
          params: {
            // Always show the account chooser, so someone rejected on a
            // personal address can immediately pick their @ucsd.edu one.
            prompt: "select_account",
            scope: "openid email profile",
          },
        },
      }),
    ]
  : [];

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  secret: AUTH_SECRET,
  // Behind a proxy (Vercel and friends) the forwarded host is the real one.
  trustHost: true,
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE_SECONDS },
  pages: {
    signIn: "/login",
    // Auth.js failures land back on our own page rather than its default one.
    error: "/login",
  },
  callbacks: {
    /**
     * The gate. `profile` is the verified ID-token payload; a `false` return
     * would produce Auth.js's generic AccessDenied, which we cannot tell apart
     * from the student simply cancelling at Google, so an ineligible account
     * gets its own redirect and its own message.
     */
    async signIn({ profile }) {
      return isEligibleIdentity(profile) ? true : `/login?error=${LOGIN_ERROR.ineligible}`;
    },

    /**
     * Re-checked when the token is minted, so a session can never outlive the
     * rule that allowed it — if `signIn` were ever loosened by accident, this
     * still refuses to issue a token for an ineligible address.
     */
    async jwt({ token, profile }) {
      if (profile) {
        if (!isEligibleIdentity(profile)) return null;
        token.email = normalizeEmail(profile.email) ?? undefined;
        token.name = typeof profile.name === "string" ? profile.name : undefined;
        token.picture = typeof profile.picture === "string" ? profile.picture : undefined;
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.email = token.email ?? "";
        session.user.name = token.name ?? null;
        session.user.image = token.picture ?? null;
      }
      return session;
    },

    /** Same-origin destinations only; anything else becomes the site root. */
    async redirect({ url, baseUrl }) {
      return safeRedirectUrl(url, baseUrl);
    },
  },
});
