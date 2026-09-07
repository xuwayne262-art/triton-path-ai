"use server";

import { signIn } from "@/auth";
import { AUTH_CONFIGURED } from "@/lib/auth/config";
import { safeInternalPath } from "@/lib/auth/redirects";

/**
 * Starts the Google redirect from the server.
 *
 * A server action rather than a client-side call: the button works without
 * JavaScript, there is no CSRF round-trip in the browser, and the destination
 * is sanitised here rather than trusted from the form.
 *
 * `signIn` throws a redirect on success, so there is nothing to return.
 */
export async function signInWithGoogle(formData: FormData): Promise<void> {
  if (!AUTH_CONFIGURED) {
    // No provider exists; refuse rather than surface an Auth.js internal error.
    throw new Error("Google sign-in is not configured on this server.");
  }
  const next = safeInternalPath(formData.get("next"));
  await signIn("google", { redirectTo: next });
}
