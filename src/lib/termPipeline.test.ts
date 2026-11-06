import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import {
  captureTerm, readListings, readPage, pageFiles, verifyCapture, zeroedImport,
} from "../../scripts/lib/public-term.mjs";
import {
  buildTerm, changesSince, departmentGuidance, primaryMeeting, publishTerm, seatTotals, unitsNumber,
} from "../../scripts/build-term-data.mjs";
import { listingTuples } from "./termData";
import { decide } from "../../scripts/watch-public-terms.mjs";

/**
 * The Winter 2027 release snapshot (UCSD's public schedule, refreshed Nov 6,
 * 2026 01:38:11 UTC) and the counts it was released with. These are facts
 * about that one capture, kept here rather than in the UI: a later capture is
 * checked against its own filters and page totals instead.
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SNAPSHOT = path.join(ROOT, "data/sources/classplanner/WI27/2026-11-06T01-38-11Z");
const RAW = path.join(SNAPSHOT, "raw");
const RELEASE = {
  pages: 50, listings: 2383, courses: 2260, sections: 7542, meetings: 11677, subjects: 181,
  summary: { course_count: 2262, section_count: 7552, meeting_count: 11693 },
  gap: { course_count: 2, section_count: 10, meeting_count: 16 },
};

/** A writable copy of the release capture, for breaking on purpose. */
function copyCapture(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wi27-"));
  fs.cpSync(RAW, path.join(dir, "raw"), { recursive: true });
  return path.join(dir, "raw");
}
const rewritePage = (raw: string, name: string, edit: (page: { courses: unknown[]; [k: string]: unknown }) => void) => {
  const file = path.join(raw, "pages", name);
  const page = readPage(file);
  edit(page);
  fs.writeFileSync(file, zlib.gzipSync(JSON.stringify(page)));
};

describe("the Winter 2027 release snapshot", () => {
  const coverage = verifyCapture(RAW, "WI27");

  test("verifies with the counts it was released with", () => {
    assert.equal(coverage.pages, RELEASE.pages);
    assert.equal(coverage.public_search_listings, RELEASE.listings);
    assert.equal(coverage.subject_count, RELEASE.subjects);
    assert.deepEqual(coverage.observed, { course_count: RELEASE.courses, section_count: RELEASE.sections, meeting_count: RELEASE.meetings });
  });

  test("reports UCSD's term summary and the unexplained gap separately", () => {
    for (const [k, v] of Object.entries(RELEASE.summary)) assert.equal(coverage.term_summary[k], v);
    assert.deepEqual(coverage.summary_minus_observed, RELEASE.gap);
    assert.equal(coverage.term_summary.last_full_refresh_at, "2026-11-06 01:38:11+00");
  });

  test("matches the handoff's own verification", () => {
    const handoff = JSON.parse(fs.readFileSync(path.join(SNAPSHOT, "coverage.json"), "utf8"));
    assert.deepEqual(coverage.observed, handoff.observed);
    assert.deepEqual(coverage.summary_minus_observed, handoff.summary_minus_observed);
  });
});

describe("a capture that is not one complete copy of the term is refused", () => {
  test("filters for another term", () => {
    const raw = copyCapture();
    const filters = JSON.parse(fs.readFileSync(path.join(raw, "filters.json"), "utf8"));
    fs.writeFileSync(path.join(raw, "filters.json"), JSON.stringify({ ...filters, term_code: "FA26" }));
    assert.throws(() => verifyCapture(raw, "WI27"), /filters are for FA26/);
  });

  test("a listing of another term", () => {
    const raw = copyCapture();
    rewritePage(raw, "00048.json.gz", (p) => { (p.courses[3] as { term_code: string }).term_code = "FA26"; });
    assert.throws(() => verifyCapture(raw, "WI27"), /FA26 listing/);
  });

  test("a section repeated", () => {
    const raw = copyCapture();
    rewritePage(raw, "00000.json.gz", (p) => {
      const c = p.courses[0] as { sections: unknown[]; section_count: number };
      c.sections.push(c.sections[0]);
      c.section_count += 1;
    });
    assert.throws(() => verifyCapture(raw, "WI27"), /repeated section id/);
  });

  test("a missing last page", () => {
    const raw = copyCapture();
    const files = pageFiles(raw);
    fs.rmSync(files[files.length - 1]);
    assert.throws(() => verifyCapture(raw, "WI27"), /incomplete|disagree/);
  });

  test("a page skipped in the middle", () => {
    const raw = copyCapture();
    fs.rmSync(path.join(raw, "pages", "00096.json.gz"));
    assert.throws(() => verifyCapture(raw, "WI27"), /offset/);
  });

  test("a field that disappears or changes type", () => {
    const raw = copyCapture();
    rewritePage(raw, "00000.json.gz", (p) => {
      const c = p.courses[0] as { units_display?: unknown; sections: { capacity: unknown }[] };
      delete c.units_display;
      c.sections[0].capacity = "154";
    });
    assert.throws(() => verifyCapture(raw, "WI27"), /changed shape/);
  });

  test("a capture that has lost most of the term since the last good one", () => {
    const previous = { observed: { course_count: 2260, section_count: 7542, meeting_count: 11677 } };
    const empty = { public_search_listings: 10, observed: { course_count: 9, section_count: 0, meeting_count: 0 } };
    assert.match(String(zeroedImport(empty, previous)), /no sections/);
    const shrunk = { public_search_listings: 500, observed: { course_count: 400, section_count: 1200, meeting_count: 2000 } };
    assert.match(String(zeroedImport(shrunk, previous)), /fell from/);
    const grown = { public_search_listings: 2400, observed: { course_count: 2270, section_count: 7600, meeting_count: 11700 } };
    assert.equal(zeroedImport(grown, previous), null);
  });
});

/**
 * A stand-in for UCSD's API, serving the release capture: pages by offset,
 * and a terms response that can change partway through.
 */
function fakeApi({ failAtOffset = -1, changeTermsAfter = Infinity } = {}) {
  const pages = new Map(pageFiles(RAW).map((f) => [readPage(f).offset as number, fs.readFileSync(f)]));
  const terms = fs.readFileSync(path.join(RAW, "terms.json"), "utf8");
  const filters = fs.readFileSync(path.join(RAW, "filters.json"));
  let termCalls = 0;
  const ok = (body: Buffer | string) => new Response(typeof body === "string" ? body : new Uint8Array(body), { status: 200 });
  return async (url: string, init?: { body?: string }) => {
    if (url.endsWith("/terms")) {
      termCalls++;
      return ok(termCalls > changeTermsAfter ? terms.replace("01:38:11", "09:00:00") : terms);
    }
    if (url.includes("/filters?")) return ok(filters);
    const { offset } = JSON.parse(String(init?.body));
    if (offset === failAtOffset) throw new Error("connection reset");
    return ok(zlib.gunzipSync(pages.get(offset)!));
  };
}

describe("capturing a term", () => {
  const fetchImpl = (opts = {}) => fakeApi(opts) as unknown as typeof fetch;

  test("pages through the search with an explicit term, offset and limit, then moves into place", async () => {
    const dest = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cap-")), "WI27");
    const coverage = await captureTerm("WI27", dest, { fetchImpl: fetchImpl(), pause: 0 });
    assert.equal(coverage.observed.section_count, RELEASE.sections);
    assert.equal(pageFiles(path.join(dest, "raw")).length, RELEASE.pages);
    assert.ok(fs.existsSync(path.join(dest, "coverage.json")));
  });

  test("a failure partway through leaves nothing behind, and an earlier capture untouched", async () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), "cap-"));
    const dest = path.join(parent, "WI27-next");
    await assert.rejects(captureTerm("WI27", dest, { fetchImpl: fetchImpl({ failAtOffset: 960 }), pause: 0 }), /connection reset/);
    assert.equal(fs.existsSync(dest), false);
    assert.deepEqual(fs.readdirSync(parent), []);
  });

  test("UCSD refreshing the term mid-capture fails the run instead of mixing two versions", async () => {
    const dest = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cap-")), "WI27");
    await assert.rejects(captureTerm("WI27", dest, { fetchImpl: fetchImpl({ changeTermsAfter: 1 }), pause: 0 }), /changed during the capture/);
    assert.equal(fs.existsSync(dest), false);
  });

  test("a rerun never overwrites a capture", async () => {
    const dest = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cap-")), "WI27");
    await captureTerm("WI27", dest, { fetchImpl: fetchImpl(), pause: 0 });
    await assert.rejects(captureTerm("WI27", dest, { fetchImpl: fetchImpl(), pause: 0 }), /exists/);
  });
});

describe("building the term from the capture", () => {
  const built = buildTerm("WI27", RAW);
  const listings = readListings(RAW);
  const row = (k: string) => built.index.courses.find((r: { k: string }) => r.k === k);
  const course = (k: string) => built.subjects.get(k.split(" ")[0])!.courses[k];

  test("every listing survives exactly, nulls, zeros and empty lists included", () => {
    type Loose = Record<string, unknown>;
    const files = [...built.subjects.values()] as unknown as { term: string; code: string; courses: Record<string, { listings: Loose[] }> }[];
    const published: Loose[] = files.flatMap((f) =>
      Object.values(f.courses).flatMap((c) =>
        c.listings.map((l) => ({ term_code: f.term, subject_code: f.code, subject_name: undefined, ...l }))));
    assert.equal(published.length, RELEASE.listings);
    const key = (l: Loose) => `${l.module_code}|${JSON.stringify((l.sections as { section_id: string }[]).map((s) => s.section_id))}`;
    const byKey = new Map((listings as Loose[]).map((l) => [key(l), l]));
    for (const p of published) {
      const raw = byKey.get(key(p)) as Loose;
      assert.ok(raw, `${p.module_code} published but not in the capture`);
      assert.deepEqual({ ...p, subject_name: raw.subject_name }, raw);
    }
  });

  test("one row per course, and every subject", () => {
    assert.equal(built.index.courses.length, RELEASE.courses);
    assert.equal(built.index.meta.subjects.length, RELEASE.subjects);
    assert.deepEqual(built.index.meta.counts, { listings: 2383, courses: 2260, sections: 7542, meetings: 11677, subjects: 181, pages: 50 });
  });

  test("ECON 110B: James Hamilton, six sections, a March 20 final for both lectures", () => {
    const c = course("ECON 110B");
    assert.equal(c.listings.length, 1);
    assert.equal(c.listings[0].sections.length, 6);
    assert.deepEqual(c.fa, ["James Hamilton"]);
    const finals = listingTuples(c.listings, false).filter((t) => t[1] === "FI");
    assert.deepEqual(finals.map((t) => [t[0], t[3], t[4]]), [["2027-03-20", "11:30a", "2:29p"], ["2027-03-20", "11:30a", "2:29p"]]);
    assert.deepEqual(finals.map((t) => t[13]), ["E 00007935", "E 00007956"]);
    assert.equal(row("ECON 110B")!.p, "James Hamilton");
  });

  test("BILD 4 has 36 Winter sections; BIEB 102 is Sara Jackrel's", () => {
    assert.equal(course("BILD 4").listings.flatMap((l: { sections: unknown[] }) => l.sections).length, 36);
    assert.deepEqual(course("BIEB 102").fa, ["Sara Jackrel"]);
  });

  test("PH 193 keeps UCSD's restrictions and the department's separate guidance", () => {
    const c = course("PH 193");
    assert.match(c.res, /Limited to class level: Junior, Senior/);
    assert.match(c.res, /Limited to major: Public Health/);
    assert.equal(c.dept, undefined, "guidance is only added when the build is given it");
    const guidance = departmentGuidance(JSON.parse(fs.readFileSync(path.join(ROOT, "data/sources/departments/WI27/public-health.json"), "utf8")), "Public Health");
    const ph = guidance.get("PH 193")!;
    assert.equal(ph.rows![0]["Anticipated Combined Class Size"], "220");
    assert.ok(ph.notes!.some((n: string) => /Department Approval/.test(n)));
    assert.ok(!JSON.stringify(ph).includes("file:///"));
  });

  test("COGS 160 keeps its two listing families apart, each with its own instructor", () => {
    const c = course("COGS 160");
    assert.deepEqual(c.listings.map((l: { section_family: string; instructors: string[] }) => [l.section_family, l.instructors]), [["001", ["David Kirsh"]], ["002", ["Ayse Saygin"]]]);
  });

  test("AAPI 198: seats come from the section, not UCSD's course-level zero", () => {
    const c = course("AAPI 198");
    assert.equal(c.listings[0].open_seat_count, 0, "UCSD's course-level figure is kept as published");
    assert.equal(c.listings[0].sections[0].seats_available, 20);
    assert.equal(row("AAPI 198")!.sa, 20);
  });

  test("a secondary-only code such as MGT 180 is simply not listed, never called cancelled", () => {
    assert.equal(row("MGT 180"), undefined);
  });

  test("a Winter course the shared dataset has never seen is kept", () => {
    const fresh = built.index.courses.filter((r) => r.nb);
    assert.ok(fresh.length > 0);
    assert.ok(fresh.every((r: { k: string }) => course(r.k).listings.length > 0));
  });

  test("waitlist-only, TBA, remote and multi-day meetings", () => {
    assert.equal(row("BENG 152")!.wo, 1);
    const bildListings = course("BILD 4").listings as { sections: { section_id: string; section_code: string }[] }[];
    const placeholder = bildListings.flatMap((l) => l.sections).find((s) => s.section_code === "004-000-LE")!;
    const lecture = listingTuples(course("BILD 4").listings, false).find((t) => t[13] === placeholder.section_id && t[1] === "LE")!;
    assert.equal(lecture[3], "", "UCSD's 12:00am-12:00am placeholder is no time");
    const mus = listingTuples(course("MUS 20R").listings, false);
    assert.equal(mus.find((t) => t[1] === "LE")![5], "Remote");
    const final = mus.find((t) => t[1] === "FI")!;
    assert.deepEqual([final[2], final[3], final[5]], ["2027-03-15", "8:00a", "Remote"]);
    assert.equal(primaryMeeting(course("PH 193").listings[0].sections)!.days, "MWF");
  });

  test("units are copied as printed; zero stays zero", () => {
    assert.equal(unitsNumber("0 units"), "0");
    assert.equal(unitsNumber("2.5 units"), "2.5");
    assert.equal(unitsNumber("1 unit"), "1");
    assert.equal(row("PHYS 250")!.u, "0");
  });

  test("seat totals count lectures once and never the course-level figure", () => {
    assert.deepEqual(seatTotals([]), { avail: null, limit: null, waitlistOnly: false });
    const lecture = { section_id: "1", instruction_type_name: "lecture", status: "AC", capacity: 100, seats_available: 40 };
    const discussion = { section_id: "2", instruction_type_name: "discussion", status: "AC", capacity: 50, seats_available: 10 };
    assert.deepEqual(seatTotals([lecture, discussion, lecture]), { avail: 40, limit: 100, waitlistOnly: false });
  });
});

describe("watching UCSD for changes", () => {
  const manifest = {
    terms: [
      { code: "FA26", path: null, refreshed: "2026-10-24 15:49:38+00", summary: { courses: 2347, sections: 9013, meetings: 13011 } },
      { code: "WI27", path: "terms/WI27", refreshed: "2026-11-06 01:38:11+00", summary: { courses: 2262, sections: 7552, meetings: 11693 } },
    ],
  };
  const wi27 = { term_code: "WI27", configured: true, course_count: 2262, section_count: 7552, meeting_count: 11693, last_full_refresh_at: "2026-11-06 01:38:11+00" };
  const fa26 = { term_code: "FA26", configured: true, course_count: 2347, section_count: 9016, meeting_count: 13016, last_full_refresh_at: "2026-10-27 16:12:31+00" };

  test("nothing new: no rebuild; Fall's own changes are reported, never rebuilt", () => {
    const d = decide([wi27, fa26], manifest);
    assert.equal(d.update, false);
    assert.deepEqual(d.terms, []);
    assert.match(d.reason, /FA26 changed at UCSD .* kept as built/);
  });

  test("a refresh or a count change rebuilds that quarter, once", () => {
    const refreshed = { ...wi27, last_full_refresh_at: "2026-11-07 01:40:00+00" };
    assert.deepEqual(decide([refreshed, fa26], manifest).terms, ["WI27"]);
    assert.deepEqual(decide([refreshed, fa26], manifest, { WI27: "2026-11-07 01:40:00+00" }).terms, [], "already seen");
    assert.deepEqual(decide([{ ...wi27, section_count: 7555 }], manifest).terms, ["WI27"]);
  });

  test("a next quarter is added once it is listed in earnest; summer sessions are not quarters", () => {
    const spring = { term_code: "SP27", configured: true, course_count: 2100, section_count: 7000, meeting_count: 11000, last_full_refresh_at: "2027-02-12 01:00:00+00" };
    assert.deepEqual(decide([spring, wi27], manifest).terms, ["SP27"]);
    const partial = decide([{ ...spring, course_count: 300 }, wi27], manifest);
    assert.deepEqual(partial.terms, []);
    assert.match(partial.reason, /waiting for at least 1131/);
    assert.deepEqual(decide([{ ...spring, term_code: "S127" }, wi27], manifest).terms, []);
  });
});

describe("publishing a term", () => {
  const built = buildTerm("WI27", RAW);

  test("a second build of the same capture changes nothing", () => {
    const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "pub-")), "WI27");
    publishTerm(built, out);
    const changes = changesSince(out, built)!;
    assert.deepEqual([changes.coursesAdded, changes.coursesWithdrawn, changes.sectionsAdded, changes.sectionsWithdrawn, changes.sectionsChanged], [[], [], 0, 0, 0]);
  });

  test("additions, withdrawals and changes are counted by term", () => {
    const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "pub-")), "WI27");
    publishTerm(built, out);
    const next = structuredClone(built);
    const econ = next.subjects.get("ECON")!.courses["ECON 110B"];
    econ.listings[0].sections[0].seats_available = 100;
    econ.listings[0].sections.pop();
    next.index.courses = next.index.courses.filter((r: { k: string }) => r.k !== "AAPI 198");
    const changes = changesSince(out, next)!;
    assert.equal(changes.sectionsChanged, 1);
    assert.equal(changes.sectionsWithdrawn, 1);
    assert.deepEqual(changes.coursesWithdrawn, ["AAPI 198"]);
  });

  test("a build that fails while writing leaves the published term as it was", () => {
    const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "pub-")), "WI27");
    publishTerm(built, out);
    const before = fs.readFileSync(path.join(out, "index.json"), "utf8");
    const broken = { ...built, subjects: new Map([["ECON", { bad: BigInt(1) }]]) };
    assert.throws(() => publishTerm(broken, out));
    assert.equal(fs.readFileSync(path.join(out, "index.json"), "utf8"), before);
    assert.deepEqual(fs.readdirSync(path.dirname(out)), ["WI27"]);
  });
});
