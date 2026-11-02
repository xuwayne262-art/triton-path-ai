import { test } from "node:test";
import assert from "node:assert/strict";
import { fromAnotherSite } from "./origin";

const req = (origin?: string) =>
  new Request("https://ucsdplans.com/api/plan", { method: "PUT", headers: origin ? { origin } : {} });

test("a request from this site, or from no browser page, passes", () => {
  assert.equal(fromAnotherSite(req("https://ucsdplans.com")), false);
  assert.equal(fromAnotherSite(req()), false);
});

test("a request from another site is refused, lookalikes included", () => {
  for (const o of ["https://evil.example", "https://ucsdplans.com.evil.example", "http://ucsdplans.com", "null"]) {
    assert.equal(fromAnotherSite(req(o)), true, o);
  }
});
