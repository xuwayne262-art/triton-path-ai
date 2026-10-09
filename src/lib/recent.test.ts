import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { agoLabel, cleanRecent, MAX_SEARCHES, MAX_VISITS, withVisit, type RecentItem } from "./recent";

const item = (kind: RecentItem["kind"], key: string, at = 0): RecentItem => ({ kind, key, label: key, href: "/", at });

describe("the recently viewed list", () => {
  test("puts a new visit first and moves a repeat up instead of listing it twice", () => {
    let list: RecentItem[] = [];
    list = withVisit(list, item("course", "CSE 12", 1));
    list = withVisit(list, item("course", "MATH 20A", 2));
    list = withVisit(list, item("course", "cse 12", 3));
    assert.deepEqual(list.map((r) => r.key), ["cse 12", "MATH 20A"]);
  });

  test("keeps its own cap for searches, so they cannot push courses off", () => {
    let list: RecentItem[] = [];
    for (let i = 0; i < MAX_VISITS + 3; i++) list = withVisit(list, item("course", `C ${i}`, i));
    for (let i = 0; i < MAX_SEARCHES + 3; i++) list = withVisit(list, item("search", `q${i}`, 100 + i));
    assert.equal(list.filter((r) => r.kind === "search").length, MAX_SEARCHES);
    assert.equal(list.filter((r) => r.kind !== "search").length, MAX_VISITS);
  });

  test("drops anything malformed that storage hands back", () => {
    const cleaned = cleanRecent([
      item("course", "CSE 12"),
      { kind: "course", key: "x", href: "https://evil.test/" },
      { kind: "course", key: "x", href: "//evil.test" },
      { kind: "nope", key: "x", href: "/" },
      "CSE 12",
      null,
    ]);
    assert.deepEqual(cleaned.map((r) => r.key), ["CSE 12"]);
    assert.deepEqual(cleanRecent("not a list"), []);
  });

  test("says how long ago in words", () => {
    const now = Date.parse("2026-10-01T12:00:00Z");
    assert.equal(agoLabel(now - 20_000, now), "just now");
    assert.equal(agoLabel(now - 3 * 60_000, now), "3 minutes ago");
    assert.equal(agoLabel(now - 60 * 60_000, now), "1 hour ago");
    assert.equal(agoLabel(now - 26 * 3_600_000, now), "yesterday");
    assert.equal(agoLabel(now - 5 * 86_400_000, now), "5 days ago");
  });
});
