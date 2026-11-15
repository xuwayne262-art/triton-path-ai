/**
 * Whether someone is signed in, asked of Auth.js once per page load and shared
 * by everything in the browser that needs to know (the "Sign in" buttons, the
 * plan sync). True or false is Auth.js's answer; null means it could not be
 * reached, which is not the same as signed out, so the failure is forgotten
 * and the next caller asks again.
 */
let asked: Promise<boolean | null> | null = null;

export function sessionSignedIn(): Promise<boolean | null> {
  if (!asked) {
    asked = fetch("/api/auth/session", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`session ${r.status}`))))
      .then((s: { user?: { email?: string } } | null) => Boolean(s?.user?.email))
      .catch(() => {
        asked = null;
        return null;
      });
  }
  return asked;
}
