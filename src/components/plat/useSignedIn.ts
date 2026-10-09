"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

/**
 * Whether someone is signed in, for the pages anyone can open.
 *
 * The course explorer is public, so the same page is read by a signed-in
 * student and by someone who followed a link. It asks Auth.js once per page
 * load; the answer only decides what a button says ("Save to planner" or
 * "Sign in to save"), never what data is shown, so nothing depends on it
 * being right before it arrives. Null while unknown.
 */
let asked: Promise<boolean> | null = null;

function ask(): Promise<boolean> {
  if (!asked) {
    asked = fetch("/api/auth/session", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((s: { user?: { email?: string } } | null) => Boolean(s?.user?.email))
      .catch(() => {
        // Unknown is not "signed out": forget the failure so the next page asks again.
        asked = null;
        return false;
      });
  }
  return asked;
}

export function useSignedIn(): boolean | null {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    ask().then((v) => { if (live) setSignedIn(v); });
    return () => { live = false; };
  }, []);
  return signedIn;
}

const noSubscribe = () => () => {};
const hereHref = () => {
  const here = window.location.pathname + window.location.search;
  return here === "/" ? "/login" : `/login?next=${encodeURIComponent(here)}`;
};

/**
 * The login page, returning here afterwards. The server render cannot know the
 * query string, so it says plain "/login" and the browser fills in the rest
 * without a hydration mismatch.
 */
export function useSignInHref(): string {
  return useSyncExternalStore(noSubscribe, hereHref, () => "/login");
}
