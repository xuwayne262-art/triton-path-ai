import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isPublicPath } from "@/lib/auth/routes";
import { FOOTER_LINKS, LEGAL_EFFECTIVE_DATE, LEGAL_LINKS, copyrightLine, sanDiegoYear } from "./legal";

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const PAGES = {
  privacy: "src/app/privacy/page.tsx",
  terms: "src/app/terms/page.tsx",
  disclaimer: "src/app/disclaimer/page.tsx",
};
/** Everything a visitor reads on or around the legal pages. */
const SOURCES = [...Object.values(PAGES), "src/lib/legal.ts", "src/components/plat/LegalFooter.tsx", "src/components/plat/LegalDocument.tsx"];

describe("the legal pages", () => {
  test("open without signing in, as does every page the footer links", () => {
    for (const { href } of [...LEGAL_LINKS, ...FOOTER_LINKS]) {
      assert.equal(isPublicPath(href.split("#")[0]), true, href);
    }
  });

  test("carry no draft placeholders", () => {
    for (const path of SOURCES) {
      const text = read(path);
      for (const marker of [/VERIFY/, /\[(current|actual|operator|insert)[^\]]*\]/i, /\bTODO\b/, /\bTBD\b/, /lorem ipsum/i]) {
        assert.doesNotMatch(text, marker, `${path} still has ${marker}`);
      }
    }
  });

  test("use no em dashes, like the rest of the site's copy", () => {
    for (const path of SOURCES) assert.doesNotMatch(read(path), /—/, path);
  });

  test("have every section that other pages link to", () => {
    const privacy = read(PAGES.privacy);
    for (const id of ["academic-history", "housing", "retention", "choices", "cookies", "ai"]) {
      assert.match(privacy, new RegExp(`id(: |=)"${id}"`), `/privacy#${id}`);
    }
    assert.match(read(PAGES.terms), /id: "housing"/, "/terms#housing");
    assert.match(read("src/app/about/page.tsx"), /id="contact"/, "/about#contact");
  });

  test("give the site's contact address, not an invented one", () => {
    const privacy = read(PAGES.privacy);
    assert.match(privacy, /CONTACT_EMAIL/);
    assert.doesNotMatch(privacy, /(privacy|legal)@/);
  });
});

describe("the effective date", () => {
  test("is a real day that has already come", () => {
    const [y, m, d] = LEGAL_EFFECTIVE_DATE.split("-").map(Number);
    const day = new Date(Date.UTC(y, m - 1, d));
    assert.equal(day.toISOString().slice(0, 10), LEGAL_EFFECTIVE_DATE);
    assert.ok(day.getTime() <= Date.now(), "never ahead of the day it goes live");
  });
});

describe("the copyright line", () => {
  test("names the year it is given and claims nothing of anyone else's", () => {
    assert.match(copyrightLine(2027), /^Copyright © 2027 UCSDPlans\. Third-party names, marks, and content belong to their respective owners\.$/);
  });

  test("turns over with San Diego's New Year, not the server's", () => {
    assert.equal(sanDiegoYear(new Date("2027-01-01T05:00:00Z")), 2026);
    assert.equal(sanDiegoYear(new Date("2027-01-01T09:00:00Z")), 2027);
  });
});
