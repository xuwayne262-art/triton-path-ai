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
export interface Account {
  email: string;
  name: string | null;
}

let asked: Promise<Account | null> | null = null;

function ask(): Promise<Account | null> {
  if (!asked) {
    asked = fetch("/api/auth/session", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((s: { user?: { email?: string; name?: string | null } } | null) =>
        s?.user?.email ? { email: s.user.email, name: s.user.name ?? null } : null)
      .catch(() => {
        // Unknown is not "signed out": forget the failure so the next page asks again.
        asked = null;
        return null;
      });
  }
  return asked;
}

/** The signed-in account, null when signed out, undefined while unknown. */
export function useAccount(): Account | null | undefined {
  const [account, setAccount] = useState<Account | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    ask().then((v) => { if (live) setAccount(v); });
    return () => { live = false; };
  }, []);
  return account;
}

export function useSignedIn(): boolean | null {
  const account = useAccount();
  return account === undefined ? null : account !== null;
}

const noSubscribe = () => () => {};
const hereHref = () => {
  const here = window.location.pathname + window.location.search;
  // `from` is where "Back to browsing" on the login page returns.
  return here === "/" ? "/login" : `/login?next=${encodeURIComponent(here)}&from=${encodeURIComponent(here)}`;
};

/**
 * The login page, returning here afterwards. The server render cannot know the
 * query string, so it says plain "/login" and the browser fills in the rest
 * without a hydration mismatch.
 */
export function useSignInHref(): string {
  return useSyncExternalStore(noSubscribe, hereHref, () => "/login");
}
