import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { TSS_PORTAL_URL, UCSD_LINKS } from "./links";
import { TSS_URL } from "./termTimeline";

/** Every source file under src/, for the checks that read the code itself. */
function sources(dir = "src"): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.ts$/.test(name) ? [path] : [];
  });
}

describe("UCSD links", () => {
  test("TSS is entered through the address UCSD publishes, not its bare root", () => {
    assert.equal(TSS_PORTAL_URL, "https://sis.ucsd.edu/");
    assert.equal(TSS_URL, TSS_PORTAL_URL, "every 'Open TSS' button uses it");
  });

  test("no link carries a sign-in session, a SAML step or a token", () => {
    for (const url of UCSD_LINKS) {
      const u = new URL(url);
      assert.equal(u.protocol, "https:", url);
      assert.equal(u.search, "", `${url} has a query`);
      assert.doesNotMatch(url, /saml|execution=|csrf|token|sso|session/i, url);
    }
  });

  test("no page links to TSS's root or the retired TritonLink Academic History", () => {
    // links.ts names the broken root in its own explanation.
    for (const file of sources().filter((f) => !/[\\/]links\.ts$/.test(f))) {
      const text = readFileSync(file, "utf8");
      assert.doesNotMatch(text, /["'`]https:\/\/tss\.ucsd\.edu\/?["'`]/, `${file} links to TSS's bare root, which answers 503`);
      assert.doesNotMatch(text, /act\.ucsd\.edu\/studentAcademicHistory/, `${file} links to the retired TritonLink page`);
      assert.doesNotMatch(text, /a5\.ucsd\.edu\/tritON\/profile\/SAML2/, `${file} hardcodes a sign-in redirect`);
    }
  });
});
