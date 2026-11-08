import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { jsonLdHtml, websiteJsonLd } from "./seo";

describe("home page structured data", () => {
  test("names the site and its home page", () => {
    assert.deepEqual(websiteJsonLd("https://ucsdplans.com"), {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "UCSDPlans",
      url: "https://ucsdplans.com/",
    });
  });

  test("escapes < so a value cannot close the script tag", () => {
    const html = jsonLdHtml({ name: "</script><script>alert(1)</script>" });
    assert.ok(!html.includes("<"), html);
    assert.deepEqual(JSON.parse(html), { name: "</script><script>alert(1)</script>" });
  });
});
