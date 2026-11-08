import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { HOME_DESCRIPTION, HOME_TITLE, TITLE_TEMPLATE, pageTitle } from "./siteTitle";

describe("site titles", () => {
  test("names the home page in full", () => {
    assert.equal(HOME_TITLE, "UCSDPlans — UCSD Course Planner, Grades & Professor Ratings");
  });

  test("describes the home page in a snippet search results show whole", () => {
    assert.equal(
      HOME_DESCRIPTION,
      "Explore UCSD courses, compare historical grades and professor ratings, find GEs by college, and build your quarterly schedule with UCSDPlans.",
    );
    // Google cuts snippets at about 155-160 characters.
    assert.ok(HOME_DESCRIPTION.length <= 155, `${HOME_DESCRIPTION.length} characters`);
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
