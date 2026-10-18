import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { discoveryRows, EMPTY_DISCOVERY, validDiscoveryScope } from "./discovery";
import { applyFilters } from "./courseFilters";
import type { GEFile, PlatIndex } from "./plat";

const index = JSON.parse(readFileSync(new URL("../../public/data/plat/index.json", import.meta.url), "utf8")) as PlatIndex;
const ge = JSON.parse(readFileSync(new URL("../../public/data/plat/ge.json", import.meta.url), "utf8")) as GEFile;

test("no scope preserves the whole real catalog", () => {
  assert.deepEqual(discoveryRows(EMPTY_DISCOVERY, index, ge), index.courses);
});

test("each college area intersects the university requirement, never inventing a course", () => {
  for (const area of ge.areas.filter((a) => a.college !== "campus")) {
    const intent = { ...EMPTY_DISCOVERY, college: area.college, area: area.key, requirement: "campus:DEI" as const };
    const expected = index.courses.filter((c) => ge.lists[area.key].includes(c.k) && ge.lists["campus:DEI"].includes(c.k));
    assert.deepEqual(discoveryRows(intent, index, ge), expected, area.key);
  }
});

test("contradictory college and area cannot fall back to a broader list", () => {
  const intent = { ...EMPTY_DISCOVERY, college: "muir", area: "sixth:Art Making" };
  assert.equal(validDiscoveryScope(intent, index, ge), false);
  assert.deepEqual(discoveryRows(intent, index, ge), []);
  assert.equal(validDiscoveryScope({ ...EMPTY_DISCOVERY, subject: "INVENTED" }, index, ge), false);
  assert.equal(validDiscoveryScope({ ...EMPTY_DISCOVERY, area: "sixth:Art Making" }, index, ge), false);
});

test("subject, term, grades, and prerequisites use the existing deterministic filter engine", () => {
  const intent = { ...EMPTY_DISCOVERY, subject: "COGS", filters: { ...EMPTY_DISCOVERY.filters, offeredOnly: true, noPre: true, hasGrades: true } };
  const results = applyFilters(discoveryRows(intent, index, ge), intent.filters);
  assert.ok(results.length > 0);
  assert.ok(results.every((c) => c.s === "COGS" && c.o === 1 && c.pr === 0 && c.r > 0 && (c.g ?? 0) > 0));
  assert.deepEqual(discoveryRows({ ...intent, subject: null }, index, ge), index.courses);
});
