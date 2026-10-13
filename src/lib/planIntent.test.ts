import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { safeInternalPath } from "./auth/redirects";
import { ADD_INTENT_TTL_MS, addIntentHref, madeHere, parseAddIntent, storedIntent } from "./planIntent";

const intent = { code: "BILD 4", pick: "B,LA:B03", nonce: "3f2a9c1e-77aa-4b1d-9f00-1234567890ab" };

describe("a course page's choice on its way to the Planner", () => {
  test("survives as the Planner URL, through the login page's next", () => {
    const href = addIntentHref(intent);
    // The login page only follows same-site paths; this one passes untouched.
    assert.equal(safeInternalPath(href), href);
    const back = parseAddIntent(new URL(href, "https://ucsdplans.com").searchParams);
    assert.deepEqual(back, intent);
  });

  test("keeps a course with no sections chosen", () => {
    const href = addIntentHref({ code: "CSE 11", pick: null, nonce: null });
    assert.deepEqual(parseAddIntent(new URL(href, "https://x.test").searchParams), { code: "CSE 11", pick: null, nonce: null });
  });

  test("refuses what is not a course, and drops a malformed pick or nonce", () => {
    const q = (s: string) => parseAddIntent(new URLSearchParams(s));
    assert.equal(q(""), null);
    assert.equal(q("add=../../etc"), null);
    assert.equal(q("add=CSE%2011%3Cscript%3E"), null);
    assert.deepEqual(q("add=cse%2011&pick=B%3Cx%3E&n=short"), { code: "CSE 11", pick: null, nonce: null });
  });
});

describe("telling a click from a link", () => {
  const now = 1_790_000_000_000;

  test("applies at once only for the nonce this tab stored, for the same course", () => {
    const stored = storedIntent(intent, now);
    assert.equal(madeHere(stored, intent, now + 60_000), true);
    assert.equal(madeHere(stored, { ...intent, code: "CSE 11" }, now), false);
    assert.equal(madeHere(stored, { ...intent, nonce: "someone-elses-nonce" }, now), false);
    assert.equal(madeHere(stored, { ...intent, nonce: null }, now), false);
  });

  test("lapses after an hour, and an unreadable store is no match", () => {
    const stored = storedIntent(intent, now);
    assert.equal(madeHere(stored, intent, now + ADD_INTENT_TTL_MS + 1), false);
    assert.equal(madeHere("{not json", intent, now), false);
    assert.equal(madeHere(null, intent, now), false);
  });
});
