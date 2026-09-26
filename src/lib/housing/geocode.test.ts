import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { areaForAddress, geocoderUrl, inSanDiego, parseAddressQuery, prettyAddress, shapePlaces } from "./geocode";

describe("parseAddressQuery", () => {
  test("a bare street address is taken to be in San Diego", () => {
    const q = parseAddressQuery("  3990   Nobel Dr ");
    assert.deepEqual(q, { ok: true, address: "3990 Nobel Dr, San Diego, CA" });
  });

  test("a named city gets the state; a ZIP or state is left alone", () => {
    assert.deepEqual(parseAddressQuery("1234 Prospect St, La Jolla"), { ok: true, address: "1234 Prospect St, La Jolla, CA" });
    assert.deepEqual(parseAddressQuery("3990 Nobel Dr 92122"), { ok: true, address: "3990 Nobel Dr 92122" });
    assert.deepEqual(parseAddressQuery("3990 Nobel Dr, San Diego, California"), { ok: true, address: "3990 Nobel Dr, San Diego, California" });
  });

  for (const [why, q] of [
    ["nothing", ""],
    ["a place name with no number", "Costa Verde Village"],
    ["markup", "<script>alert(1)</script> 12"],
    ["a URL", "http://evil.test/1"],
    ["an essay", `1 ${"Main St ".repeat(40)}`],
  ] as const) {
    test(`refuses ${why}`, () => assert.equal(parseAddressQuery(q).ok, false));
  }

  test("the geocoder URL carries the address and nothing else of ours", () => {
    const url = new URL(geocoderUrl("3990 Nobel Dr, San Diego, CA"));
    assert.equal(url.hostname, "geocoding.geo.census.gov");
    assert.equal(url.searchParams.get("address"), "3990 Nobel Dr, San Diego, CA");
    assert.equal(url.searchParams.get("format"), "json");
  });
});

describe("shapePlaces", () => {
  /** A real answer for 3990 Nobel Dr, trimmed to the fields that matter. */
  const NOBEL = {
    result: {
      addressMatches: [{
        coordinates: { x: -117.220129420215, y: 32.86801940182 },
        matchedAddress: "3990 NOBEL DR, SAN DIEGO, CA, 92122",
      }],
    },
  };

  test("a match becomes a readable address, a point and a neighbourhood", () => {
    assert.deepEqual(shapePlaces(NOBEL), [{
      address: "3990 Nobel Dr, San Diego, CA 92122",
      ll: [32.868019, -117.220129],
      zip: "92122",
      area: "University City",
    }]);
  });

  test("a match outside San Diego is dropped", () => {
    const ny = { result: { addressMatches: [{ coordinates: { x: -74.006, y: 40.7128 }, matchedAddress: "1 MAIN ST, NEW YORK, NY, 10001" }] } };
    assert.deepEqual(shapePlaces(ny), []);
  });

  test("malformed answers produce nothing rather than throwing", () => {
    for (const bad of [null, {}, { result: {} }, { result: { addressMatches: [{ coordinates: { x: "a" } }] } }]) {
      assert.deepEqual(shapePlaces(bad), []);
    }
  });
});

describe("addresses", () => {
  test("pretty addresses", () => {
    assert.equal(prettyAddress("3990 NOBEL DR, SAN DIEGO, CA, 92122"), "3990 Nobel Dr, San Diego, CA 92122");
    assert.equal(prettyAddress("9500 GILMAN DR, LA JOLLA, CA, 92093"), "9500 Gilman Dr, La Jolla, CA 92093");
  });

  test("neighbourhoods come from the ZIP, else the city", () => {
    assert.equal(areaForAddress("4545 La Jolla Village Dr, San Diego, CA 92122"), "University City");
    assert.equal(areaForAddress("1 Garnet Ave, San Diego, CA 92109"), "Pacific Beach");
    assert.equal(areaForAddress("1 Main St, Oceanside, CA 92054"), "Oceanside");
    assert.equal(areaForAddress("somewhere"), "San Diego");
  });

  test("the service area", () => {
    assert.ok(inSanDiego([32.868, -117.22]));
    assert.ok(!inSanDiego([34.05, -118.24]));
  });
});
