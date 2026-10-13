import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { browseBackHref, destinationFor, destinationFromCookie } from "./destination";

describe("the login page's words for each destination", () => {
  test("the Planner, Housing and the Academic History each say what they are for", () => {
    assert.match(destinationFor("/planner").title, /Planner/);
    assert.match(destinationFor("/housing").title, /Housing/);
    assert.match(destinationFor("/housing/abc").detail ?? "", /only to students signed in/);
    assert.match(destinationFor("/import").title, /Academic History/);
    assert.match(destinationFor("/").title, /UCSDPlans/);
  });

  test("a choice handed to the Planner is promised back, by course", () => {
    const d = destinationFor("/planner?add=BILD%204&pick=B%2CLA%3AB03&n=0123456789");
    assert.match(d.detail ?? "", /BILD 4 and the sections you chose/);
    assert.doesNotMatch(destinationFor("/planner?add=%3Cscript%3E").detail ?? "", /script/);
  });
});

describe("the way back to browsing", () => {
  test("returns to a public page the student came from", () => {
    assert.equal(browseBackHref("/course/BILD/4?pick=B%2CLA%3AB03"), "/course/BILD/4?pick=B%2CLA%3AB03");
    assert.equal(browseBackHref("/ge?college=sixth"), "/ge?college=sixth");
  });

  test("never leads into a signed-in page or off the site", () => {
    assert.equal(browseBackHref("/planner"), "/");
    assert.equal(browseBackHref("/housing/x"), "/");
    assert.equal(browseBackHref("https://evil.test/"), "/");
    assert.equal(browseBackHref("//evil.test"), "/");
    assert.equal(browseBackHref(undefined), "/");
  });
});

describe("recovering the destination after a failed sign-in", () => {
  const origin = "https://ucsdplans.com";
  test("reads Auth.js's callback cookie, same site only", () => {
    assert.equal(destinationFromCookie("https://ucsdplans.com/planner?add=CSE%2011", origin), "/planner?add=CSE%2011");
    assert.equal(destinationFromCookie("/housing", origin), "/housing");
    assert.equal(destinationFromCookie("https://evil.test/planner", origin), null);
    assert.equal(destinationFromCookie("https://ucsdplans.com/login", origin), null);
    assert.equal(destinationFromCookie(undefined, origin), null);
    assert.equal(destinationFromCookie("::not a url", origin), null);
  });
});
