import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { termStatusOf } from "./termGate";

describe("termStatusOf", () => {
  it("is ready only when the loaded quarter is the one asked for", () => {
    assert.equal(termStatusOf("WI27", "WI27", null), "ready");
    assert.equal(termStatusOf("FA26", "FA26", "WI27"), "ready");
  });

  it("keeps a quarter switched to but not yet loaded from passing as the old one", () => {
    // Fall in memory, Winter asked for: the page must not show Fall as Winter.
    assert.equal(termStatusOf("WI27", "FA26", null), "loading");
    assert.equal(termStatusOf("WI27", "", null), "loading");
  });

  it("says which quarter failed, and only that one", () => {
    assert.equal(termStatusOf("WI27", "FA26", "WI27"), "failed");
    // A failure left from a quarter switched away from is not this one's.
    assert.equal(termStatusOf("FA26", "", "WI27"), "loading");
  });

  it("waits for the browser before the quarter is known", () => {
    assert.equal(termStatusOf(null, "FA26", null), "loading");
  });
});
