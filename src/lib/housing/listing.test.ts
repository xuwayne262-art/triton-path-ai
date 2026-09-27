import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  EXPIRE_DAYS, REPORT_LIMIT, STALE_DAYS, buildListing, checkListing, headline, isListed, listedUntil,
  listingState, posterName, toPublic, type StoredListing,
} from "./listing";

const TODAY = "2026-09-27";

const valid = () => ({
  kind: "sublet",
  rent: 1150,
  utilities: 80,
  address: "3990 Nobel Dr, San Diego, CA 92122",
  ll: [32.86802, -117.22013],
  from: "2027-01-01",
  to: "2027-03-31",
  room: "private",
  bath: "shared",
  bedrooms: 3,
  housemates: 2,
  furnished: true,
  laundry: "unit",
  parking: false,
  pets: false,
  title: "Sunny room by the trolley",
  about: "Quiet housemates.\n\n\n\nTen minutes to Geisel.",
  showEmail: true,
  phone: "",
  other: "",
  photos: [],
});

describe("checkListing", () => {
  test("a complete listing is accepted as sent", () => {
    const r = checkListing(valid(), TODAY);
    assert.ok(r.ok);
    assert.equal(r.fields.rent, 1150);
    assert.equal(r.fields.about, "Quiet housemates.\n\nTen minutes to Geisel.");
    assert.equal(r.fields.phone, null);
  });

  test("fields the form does not have are dropped", () => {
    const r = checkListing({ ...valid(), owner: "own:someone-else", contact: { email: "x@evil.test" } }, TODAY);
    assert.ok(r.ok);
    assert.ok(!("owner" in r.fields));
    assert.ok(!("contact" in r.fields));
  });

  const refusals: Array<[string, Record<string, unknown>, string]> = [
    ["an unknown kind", { kind: "castle" }, "kind"],
    ["rent that is not a whole number", { rent: 999.5 }, "rent"],
    ["rent of a dollar", { rent: 1 }, "rent"],
    ["negative utilities", { utilities: -5 }, "utilities"],
    ["a pin in New York", { ll: [40.7128, -74.006] }, "address"],
    ["a pin that is not two numbers", { ll: ["32.8", "-117.2"] }, "address"],
    ["no address", { address: "" }, "address"],
    ["an impossible date", { from: "2027-02-30" }, "from"],
    ["dates in the wrong order", { from: "2027-03-31", to: "2027-01-01" }, "to"],
    ["dates already over", { from: "2026-01-01", to: "2026-06-01" }, "to"],
    ["a start years away", { from: "2029-01-01", to: "2029-06-01" }, "from"],
    ["a room that is neither private nor shared", { room: "suite" }, "room"],
    ["eleven bedrooms", { bedrooms: 11 }, "bedrooms"],
    ["a phone number of letters", { phone: "call me maybe" }, "phone"],
    ["no way to be reached", { showEmail: false, phone: "", other: "" }, "contact"],
    ["too many photos", { photos: Array.from({ length: 7 }, (_, i) => `x${i}`.padEnd(32, "a")) }, "photos"],
    ["a photo ref that is a path", { photos: ["../../etc/passwd"] }, "photos"],
  ];
  for (const [why, patch, field] of refusals) {
    test(`refuses ${why}`, () => {
      const r = checkListing({ ...valid(), ...patch }, TODAY);
      assert.ok(!r.ok, "should be refused");
      assert.equal(r.field, field);
    });
  }

  test("refuses things that are not a listing at all", () => {
    for (const body of [null, "listing", [valid()], 42]) assert.ok(!checkListing(body, TODAY).ok);
  });

  test("a phone number alone is a way to be reached", () => {
    const r = checkListing({ ...valid(), showEmail: false, phone: "(858) 555-0123" }, TODAY);
    assert.ok(r.ok);
    assert.equal(r.fields.phone, "(858) 555-0123");
  });

  test("text is cut to length and cleaned of control characters", () => {
    const r = checkListing({ ...valid(), title: `Room\u0000 ${"x".repeat(200)}` }, TODAY);
    assert.ok(r.ok);
    assert.ok(r.fields.title.length <= 80);
    assert.ok(!r.fields.title.includes("\u0000"));
  });
});

describe("building the stored listing", () => {
  const fields = (() => {
    const r = checkListing(valid(), TODAY);
    assert.ok(r.ok);
    return r.fields;
  })();

  test("identity comes from the session, and the email only when the poster chose to show it", () => {
    const l = buildListing(fields, { owner: "own:a", email: "alex@ucsd.edu", name: "Alex Yaitanes" }, { id: "abc123", now: "2026-09-27T10:00:00Z" });
    assert.equal(l.poster, "Alex Y.");
    assert.equal(l.contact.email, "alex@ucsd.edu");
    assert.equal(l.area, "University City");
    assert.equal(l.status, "open");

    const hidden = buildListing({ ...fields, showEmail: false, phone: "858-555-0123" }, { owner: "own:a", email: "alex@ucsd.edu", name: "Alex" }, { id: "abc123", now: "2026-09-27T10:00:00Z" });
    assert.equal(hidden.contact.email, null);
  });

  test("an edit keeps the creation date, status and reports, and counts as a confirmation", () => {
    const first = buildListing(fields, { owner: "own:a", email: "a@ucsd.edu", name: "A" }, { id: "abc123", now: "2026-09-01T10:00:00Z" });
    const prev = { ...first, status: "taken" as const, reports: ["own:b"] };
    const next = buildListing(fields, { owner: "own:a", email: "a@ucsd.edu", name: "A" }, { id: "abc123", now: "2026-09-27T10:00:00Z", previous: prev });
    assert.equal(next.created, "2026-09-01T10:00:00Z");
    assert.equal(next.confirmed, "2026-09-27T10:00:00Z");
    assert.equal(next.status, "taken");
    assert.deepEqual(next.reports, ["own:b"]);
  });

  test("the page never sees who owns or reported a listing", () => {
    const l = buildListing(fields, { owner: "own:a", email: "a@ucsd.edu", name: "A" }, { id: "abc123", now: "2026-09-27T10:00:00Z" });
    const pub = toPublic({ ...l, reports: ["own:b"] }, "own:a", TODAY, Date.parse("2026-09-27T12:00:00Z"));
    assert.ok(!("owner" in pub));
    assert.ok(!("reports" in pub));
    assert.equal(pub.mine, true);
    assert.equal(toPublic(l, "own:z", TODAY).mine, false);
    assert.equal(toPublic(l, null, TODAY).mine, false);
  });
});

describe("listingState", () => {
  const base = {
    status: "open", to: "2027-03-31", confirmed: "2026-09-27T10:00:00Z", reports: [],
  } as Pick<StoredListing, "status" | "to" | "confirmed" | "reports">;
  const at = (days: number) => Date.parse("2026-09-27T10:00:00Z") + days * 86_400_000;

  test("fresh, then stale, then off the list", () => {
    assert.equal(listingState(base, TODAY, at(1)), "live");
    assert.equal(listingState(base, TODAY, at(STALE_DAYS)), "stale");
    assert.equal(listingState(base, TODAY, at(EXPIRE_DAYS)), "expired");
    assert.ok(isListed("stale"));
    assert.ok(!isListed("expired"));
  });

  test("taken, ended and reported listings leave the list", () => {
    assert.equal(listingState({ ...base, status: "taken" }, TODAY, at(0)), "taken");
    assert.equal(listingState({ ...base, to: "2026-09-26" }, TODAY, at(0)), "ended");
    const reports = Array.from({ length: REPORT_LIMIT }, (_, i) => `own:${i}`);
    assert.equal(listingState({ ...base, reports }, TODAY, at(0)), "hidden");
  });

  test("an unreadable confirmation date is treated as expired, not as fresh", () => {
    assert.equal(listingState({ ...base, confirmed: "yesterday-ish" }, TODAY, at(0)), "expired");
  });
});

describe("presentation", () => {
  test("poster names are first name and initial", () => {
    assert.equal(posterName("Alex Yaitanes"), "Alex Y.");
    assert.equal(posterName("Mary Jane van Dyke"), "Mary D.");
    assert.equal(posterName("Cher"), "Cher");
    assert.equal(posterName(undefined), "A UCSD student");
  });

  test("a headline is written when the poster gave none", () => {
    assert.equal(headline({ title: "", kind: "sublet", room: "private", bedrooms: 3 }), "Private room in a 3-bed place");
    assert.equal(headline({ title: "", kind: "whole", room: "private", bedrooms: 0 }), "Studio");
    assert.equal(headline({ title: "My place", kind: "whole", room: "private", bedrooms: 2 }), "My place");
  });

  test("a confirmation keeps a listing up for thirty more days, dated in San Diego", () => {
    assert.equal(listedUntil(Date.parse("2026-09-27T19:00:00Z")), "Oct 27");
    // 5pm on Sep 30 in San Diego is already Oct 1 in UTC.
    assert.equal(listedUntil(Date.parse("2026-10-01T00:30:00Z")), "Oct 30");
  });
});
