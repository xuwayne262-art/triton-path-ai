import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { HOME_TITLE, TITLE_TEMPLATE, pageTitle } from "./siteTitle";

describe("site titles", () => {
  test("names the home page in full", () => {
    assert.equal(HOME_TITLE, "UCSDPlans — UCSD Course Planner");
  });

  test("puts a page's own name before the site's", () => {
    assert.equal(pageTitle("ECON 110B"), "ECON 110B | UCSDPlans");
    assert.equal(pageTitle("Winter 2027 Courses"), "Winter 2027 Courses | UCSDPlans");
  });

  test("gives Next.js a template that matches pageTitle", () => {
    assert.equal(TITLE_TEMPLATE, "%s | UCSDPlans");
    // Next.js fills the template with String.replace, as here.
    assert.equal(TITLE_TEMPLATE.replace(/%s/g, "Easy GEs"), pageTitle("Easy GEs"));
  });
});
