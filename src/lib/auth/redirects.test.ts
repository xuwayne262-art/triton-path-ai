import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { safeInternalPath, safeRedirectUrl } from "./redirects";

describe("safeInternalPath", () => {
  test("keeps a same-site path, query string and all", () => {
    for (const path of [
      "/",
      "/planner",
      "/planner/four-year",
      "/courses/CSE",
      "/course/CSE/11",
      "/ge?college=Muir",
      "/professor/Smith%20J",
      "/planner?year=2&quarter=Fall#top",
    ]) {
      assert.equal(safeInternalPath(path), path, path);
    }
  });

  test("rejects absolute URLs", () => {
    for (const url of [
      "https://evil.test/steal",
      "http://evil.test",
      "HTTPS://evil.test",
      "javascript:alert(1)",
      "data:text/html,<script>",
      "mailto:someone@ucsd.edu",
    ]) {
      assert.equal(safeInternalPath(url), "/", url);
    }
  });

  test("rejects protocol-relative and backslash variants", () => {
    for (const url of [
      "//evil.test",
      "//evil.test/path",
      "/\\evil.test",
      "/\\/evil.test",
      "\\\\evil.test",
      "/path\\..\\evil",
    ]) {
      assert.equal(safeInternalPath(url), "/", url);
    }
  });

  test("rejects control characters used to smuggle a scheme past a check", () => {
    for (const url of ["/ //evil.test", "/\n//evil.test", "/\r\nLocation: x"]) {
      assert.equal(safeInternalPath(url), "/");
    }
  });

  test("refuses to bounce back into the auth flow", () => {
    for (const path of ["/login", "/login?next=/x", "/login/anything", "/api/auth/signin"]) {
      assert.equal(safeInternalPath(path), "/", path);
    }
  });

  test("rejects non-strings and honours a custom fallback", () => {
    for (const value of [null, undefined, 42, {}, ["/planner"], true]) {
      assert.equal(safeInternalPath(value), "/");
    }
    assert.equal(safeInternalPath("https://evil.test", "/planner"), "/planner");
  });
});

describe("safeRedirectUrl", () => {
  const base = "https://ucsdplans.test";

  test("allows a same-origin destination", () => {
    assert.equal(safeRedirectUrl("/planner", base), "https://ucsdplans.test/planner");
    assert.equal(
      safeRedirectUrl("https://ucsdplans.test/ge?college=Muir", base),
      "https://ucsdplans.test/ge?college=Muir",
    );
  });

  test("sends a different origin to the site root", () => {
    for (const url of [
      "https://evil.test/steal",
      "http://ucsdplans.test/planner", // a different scheme is a different origin
      "https://ucsdplans.test.evil.test/x",
      "//evil.test",
    ]) {
      assert.equal(safeRedirectUrl(url, base), `${base}/`, url);
    }
  });

  test("falls back to the base when the base itself cannot be parsed", () => {
    assert.equal(safeRedirectUrl("/planner", "not a url"), "not a url");
  });

  test("a junk-but-same-origin value stays on this site rather than escaping", () => {
    // "::::" parses as a relative path, not a scheme — the result must simply
    // stay on our origin.
    assert.equal(safeRedirectUrl("::::", base), "https://ucsdplans.test/::::");
  });

  test("does not land back on the login page", () => {
    assert.equal(safeRedirectUrl("/login?next=/planner", base), `${base}/`);
  });
});
