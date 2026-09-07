import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { decideAccess, expectsJson, isPublicPath } from "./routes";

describe("isPublicPath", () => {
  test("lets the login page and the auth endpoints through", () => {
    for (const path of [
      "/login",
      "/login?next=/planner",
      "/api/auth/signin",
      "/api/auth/callback/google",
      "/api/auth/session",
      "/api/auth/csrf",
    ]) {
      assert.equal(isPublicPath(path.split("?")[0]), true, path);
    }
  });

  test("lets the login page's own assets through", () => {
    for (const path of ["/brand/ucsdplans-logo.png", "/favicon.ico", "/_next/static/x.js"]) {
      assert.equal(isPublicPath(path), true, path);
    }
  });

  test("protects every application page", () => {
    for (const path of [
      "/",
      "/planner",
      "/planner/four-year",
      "/courses",
      "/courses/CSE",
      "/course/CSE/11",
      "/ge",
      "/professor/Smith",
    ]) {
      assert.equal(isPublicPath(path), false, path);
    }
  });

  test("protects the API routes and the course dataset", () => {
    for (const path of [
      "/api/chat",
      "/api/advisor",
      "/api/generate-plan",
      "/data/plat/index.json",
      "/data/plat/subject/CSE.json",
      "/data/plat/professors.json",
    ]) {
      assert.equal(isPublicPath(path), false, path);
    }
  });

  test("is not fooled by a path that merely contains an allowlisted prefix", () => {
    for (const path of ["/planner/login", "/x/api/auth/session", "/notlogin"]) {
      assert.equal(isPublicPath(path), false, path);
    }
  });
});

describe("expectsJson", () => {
  test("is true for API and dataset requests", () => {
    assert.equal(expectsJson("/api/chat"), true);
    assert.equal(expectsJson("/data/plat/index.json"), true);
  });

  test("is false for pages, which should redirect instead", () => {
    for (const path of ["/", "/planner", "/courses/CSE"]) {
      assert.equal(expectsJson(path), false, path);
    }
  });
});

describe("decideAccess", () => {
  const eligible = (email: unknown) =>
    typeof email === "string" && email.toLowerCase().endsWith("@ucsd.edu");

  test("allows the login page and auth endpoints to anyone", () => {
    for (const path of ["/login", "/api/auth/callback/google", "/brand/logo.png"]) {
      assert.deepEqual(decideAccess(path, "", null, eligible), { kind: "allow" });
    }
  });

  test("allows an eligible session everywhere", () => {
    for (const path of ["/", "/planner", "/api/chat", "/data/plat/index.json"]) {
      assert.deepEqual(
        decideAccess(path, "", "alice@ucsd.edu", eligible),
        { kind: "allow" },
        path,
      );
    }
  });

  test("redirects an anonymous page request and remembers where it was going", () => {
    assert.deepEqual(decideAccess("/planner", "?year=2", null, eligible), {
      kind: "redirect",
      next: "/planner?year=2",
      ineligible: false,
    });
  });

  test("carries no next for the homepage — the default is already the homepage", () => {
    assert.deepEqual(decideAccess("/", "", null, eligible), {
      kind: "redirect",
      next: null,
      ineligible: false,
    });
  });

  test("401s anonymous API and dataset requests instead of redirecting", () => {
    for (const path of ["/api/chat", "/data/plat/index.json"]) {
      assert.deepEqual(decideAccess(path, "", null, eligible), { kind: "json401" }, path);
    }
  });

  test("refuses a session on the wrong domain and flags it as ineligible", () => {
    // Auth.js will not mint this token today; the rule is re-applied anyway so
    // a session cannot outlive the rule that allowed it.
    assert.deepEqual(decideAccess("/planner", "", "mallory@gmail.com", eligible), {
      kind: "redirect",
      next: "/planner",
      ineligible: true,
    });
    assert.deepEqual(
      decideAccess("/data/plat/index.json", "", "mallory@gmail.com", eligible),
      { kind: "json401" },
    );
  });
});
