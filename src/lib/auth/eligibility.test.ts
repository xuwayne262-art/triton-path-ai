import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  INELIGIBLE_MESSAGE,
  isEligibleEmail,
  isEligibleIdentity,
  normalizeEmail,
} from "./eligibility";

describe("normalizeEmail", () => {
  test("lower-cases and trims", () => {
    assert.equal(normalizeEmail("  Alice@UCSD.EDU  "), "alice@ucsd.edu");
  });

  test("rejects non-strings and blanks", () => {
    for (const value of [null, undefined, 42, {}, [], true, "", "   "]) {
      assert.equal(normalizeEmail(value), null);
    }
  });
});

describe("isEligibleEmail", () => {
  test("accepts an @ucsd.edu address in any casing", () => {
    for (const email of [
      "alice@ucsd.edu",
      "ALICE@UCSD.EDU",
      "Alice.Smith@Ucsd.Edu",
      "  bob@ucsd.edu  ",
      "a1-b_c+tag@ucsd.edu",
    ]) {
      assert.equal(isEligibleEmail(email), true, email);
    }
  });

  test("rejects subdomains — '.ucsd.edu' is not '@ucsd.edu'", () => {
    for (const email of [
      "alice@eng.ucsd.edu",
      "alice@health.ucsd.edu",
      "alice@mail.ucsd.edu",
    ]) {
      assert.equal(isEligibleEmail(email), false, email);
    }
  });

  test("rejects look-alike domains", () => {
    for (const email of [
      "alice@ucsd.edu.evil.com",
      "alice@notucsd.edu",
      "alice@ucsd.education",
      "alice@ucsdedu",
      "alice@gmail.com",
      "alice@ucsd.edu.",
      "ucsd.edu",
      "@ucsd.edu",
    ]) {
      assert.equal(isEligibleEmail(email), false, email);
    }
  });

  test("rejects an embedded second address", () => {
    assert.equal(isEligibleEmail("attacker@evil.com@ucsd.edu"), false);
  });

  test("rejects non-strings", () => {
    for (const value of [null, undefined, 42, {}, ["alice@ucsd.edu"], true]) {
      assert.equal(isEligibleEmail(value), false);
    }
  });
});

describe("isEligibleIdentity", () => {
  test("accepts a verified @ucsd.edu identity", () => {
    assert.equal(
      isEligibleIdentity({ email: "Alice@UCSD.edu", email_verified: true }),
      true,
    );
    // Some Google responses stringify the flag.
    assert.equal(
      isEligibleIdentity({ email: "alice@ucsd.edu", email_verified: "true" }),
      true,
    );
  });

  test("rejects an unverified address even on the right domain", () => {
    for (const verified of [false, "false", undefined, null, 0, 1, "yes", {}]) {
      assert.equal(
        isEligibleIdentity({ email: "alice@ucsd.edu", email_verified: verified }),
        false,
        String(verified),
      );
    }
  });

  test("rejects a verified address on the wrong domain", () => {
    assert.equal(
      isEligibleIdentity({ email: "alice@gmail.com", email_verified: true }),
      false,
    );
  });

  test("rejects a missing identity", () => {
    assert.equal(isEligibleIdentity(null), false);
    assert.equal(isEligibleIdentity(undefined), false);
    assert.equal(isEligibleIdentity({}), false);
  });
});

describe("the rejection message", () => {
  test("is exactly the wording students are shown", () => {
    assert.equal(INELIGIBLE_MESSAGE, "Please sign in with your @ucsd.edu Google account.");
  });
});
