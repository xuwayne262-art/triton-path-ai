import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { isPublicPath } from "@/lib/auth/routes";
import { SUPPORT_QUIET_DAYS, ZELLE_QR, isQuietPath, shouldAutoOpen } from "./support";

const DAY = 86_400_000;
const NOW = Date.parse("2026-11-16T20:00:00Z");
const base = { now: NOW, dismissedAt: null, shownThisSession: false, pathname: "/courses" };

describe("the donation note", () => {
  test("opens by itself for a visitor who has not seen it", () => {
    assert.equal(shouldAutoOpen(base), true);
  });

  test("opens by itself at most once a session", () => {
    assert.equal(shouldAutoOpen({ ...base, shownThisSession: true }), false);
  });

  test("stays shut for a week after it is closed", () => {
    assert.equal(shouldAutoOpen({ ...base, dismissedAt: NOW - DAY }), false);
    assert.equal(shouldAutoOpen({ ...base, dismissedAt: NOW - SUPPORT_QUIET_DAYS * DAY }), true);
  });

  test("never interrupts a form or the legal pages", () => {
    for (const path of ["/import", "/housing/new", "/privacy", "/terms", "/disclaimer"]) {
      assert.equal(isQuietPath(path), true, path);
      assert.equal(shouldAutoOpen({ ...base, pathname: path }), false, path);
    }
    assert.equal(isQuietPath("/housing"), false);
    assert.equal(isQuietPath("/importer"), false);
  });

  test("shows a QR code anyone can load, signed in or not", () => {
    assert.equal(isPublicPath(ZELLE_QR), true);
    assert.ok(existsSync(new URL(`../../public${ZELLE_QR}`, import.meta.url)), "the image is in public/");
  });
});
