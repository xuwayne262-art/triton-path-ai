import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EMPTY_GE, areaSlug, geQueryString, geResults, parseGeQuery } from "./geQuery";
import { DEFAULT_FILTERS } from "./courseFilters";
import type { CourseRow, GEFile, PlatIndex } from "./plat";

const read = <T,>(rel: string) => JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf8")) as T;
const ge = read<GEFile>("../../public/data/plat/ge.json");
const index = read<PlatIndex>("../../public/data/plat/index.json");
const HUM = "sixth:Modes of Inquiry · Humanities";
const base = { ...DEFAULT_FILTERS, sort: "grade" as const };
const parse = (qs: string) => parseGeQuery(new URLSearchParams(qs), ge, ["arts", "humanities"], base);

describe("the GE page's address", () => {
  test("Sixth + Humanities + also DEI survives a reload and a shared link", () => {
    const state = { ...EMPTY_GE, college: "sixth", areas: [HUM], also: ["campus:DEI"] };
    const qs = geQueryString(state, base, base);
    assert.equal(qs, "?college=sixth&area=modes-of-inquiry-humanities&also=dei");
    const back = parse(qs.slice(1));
    assert.deepEqual(back.state, state);
    assert.deepEqual(back.filters, base);
    assert.deepEqual(back.problems, []);
  });

  test("carries the list filters too, and leaves defaults out", () => {
    const filters = { ...base, q: "film", offeredOnly: true, openOnly: true, units: "4", load: "3.2", sort: "rating" as const };
    const qs = geQueryString({ ...EMPTY_GE, college: "muir" }, filters, base);
    assert.deepEqual(parse(qs.slice(1)).filters, filters);
    assert.equal(geQueryString(EMPTY_GE, base, base), "");
  });

  test("an unknown college lands on no college, says so, and never borrows another's list", () => {
    const p = parse("college=hogwarts&area=modes-of-inquiry-humanities");
    assert.equal(p.state.college, null);
    assert.deepEqual(p.state.areas, []);
    assert.equal(p.problems.length, 1);
    assert.match(p.problems[0], /choose yours/);
  });

  test("an area the college does not have is dropped and named", () => {
    const p = parse("college=revelle&area=modes-of-inquiry-humanities,natural-science");
    assert.deepEqual(p.state.areas, ["revelle:Natural Science"]);
    assert.equal(p.problems.length, 1);
  });

  test("junk values recover to defaults rather than crashing", () => {
    const p = parse("college=sixth&sort=drop%20table&units=99&rmp=x&also=nope,dei,dei&req=zzz");
    assert.equal(p.filters.sort, "grade");
    assert.equal(p.filters.units, "any");
    assert.equal(p.filters.load, "any");
    assert.deepEqual(p.state.also, ["campus:DEI"]);
    assert.equal(p.state.req, null);
  });

  test("area slugs are stable and unique within each college", () => {
    for (const college of new Set(ge.areas.map((a) => a.college))) {
      const slugs = ge.areas.filter((a) => a.college === college).map((a) => areaSlug(a.key));
      assert.equal(new Set(slugs).size, slugs.length, college);
    }
  });
});

describe("which courses a GE choice lists", () => {
  const rows = index.courses;
  const none = () => false;

  test("several areas are a union: a course on ANY of them", () => {
    const a = "sixth:Art Making";
    const both = geResults(rows, ge, { ...EMPTY_GE, college: "sixth", areas: [HUM, a] }, none).rows.map((r) => r.k);
    const hum = new Set(geResults(rows, ge, { ...EMPTY_GE, college: "sixth", areas: [HUM] }, none).rows.map((r) => r.k));
    const art = new Set(geResults(rows, ge, { ...EMPTY_GE, college: "sixth", areas: [a] }, none).rows.map((r) => r.k));
    assert.equal(new Set(both).size, new Set([...hum, ...art]).size);
  });

  test("'also' is an intersection: every listed course is on that list too", () => {
    const dei = new Set(ge.lists["campus:DEI"]);
    const out = geResults(rows, ge, { ...EMPTY_GE, college: "sixth", areas: [HUM], also: ["campus:DEI"] }, none);
    assert.ok(out.rows.length > 0);
    for (const r of out.rows) {
      assert.ok(dei.has(r.k), r.k);
      assert.ok(ge.lists[HUM].includes(r.k), r.k);
      assert.match(out.noteFor(r) ?? "", /may count for Modes of Inquiry · Humanities · also DEI/);
    }
  });

  test("no college chosen lists nothing rather than an example college's", () => {
    assert.deepEqual(geResults(rows, ge, EMPTY_GE, none).rows, []);
  });

  test("a university requirement can be browsed with no college at all", () => {
    const out = geResults(rows, ge, { ...EMPTY_GE, req: "campus:AHI" }, none);
    assert.ok(out.rows.length > 0);
    assert.match(out.noteFor(out.rows[0] as CourseRow) ?? "", /AHI/);
  });
});
