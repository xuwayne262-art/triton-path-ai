import { describe, test } from "node:test";
import assert from "node:assert/strict";
import type { CourseDetail, PlatIndex, ProfessorFile, SubjectFile } from "./plat";
import {
  courseForTerm, displayCode, foldMeetings, listingTuples, overlayIndex, overlayProfessors, overlaySubject, profsForTerm,
  type TermIndexFile, type TermListing, type TermMeeting, type TermSection, type TermSubjectFile,
} from "./termData";
import { defaultTerm, parseTerm, resolveTerm, termPhase, withTerm, type TermEntry, type TermManifest } from "./terms";

const WINTER: TermEntry = {
  code: "WI27", name: "Winter 2027", path: "terms/WI27", v: "WI27@1",
  features: { rooms: false, seatTimes: false, booking: false },
};
const FALL: TermEntry = {
  code: "FA26", name: "Fall 2026", path: null, v: "fall", frozen: true,
  features: { rooms: true, seatTimes: true, booking: true },
};
const MANIFEST: TermManifest = { terms: [FALL, WINTER] };

const meeting = (over: Partial<TermMeeting>): TermMeeting => ({
  meeting_kind: "class", day_code: "T", day_name: "Tuesday", specific_date: null, start_minutes: 750, end_minutes: 830,
  start_time_display: "12:30pm", end_time_display: "1:50pm", is_remote: false, is_tba: false, ...over,
});
const section = (over: Partial<TermSection>): TermSection => ({
  section_id: "E 1", section_ref: "WI27:E 1", section_code: "001-000-LE", instruction_type_name: "lecture",
  event_package_ids: ["1", "2"], capacity: 154, enrolled: 0, seats_available: 154, waitlist_capacity: null,
  waitlist_enrolled: null, waitlist_available: null, status: "AC", instructors: ["James Hamilton"],
  meetings: [meeting({}), meeting({ day_code: "R", day_name: "Thursday" })], section_text: [], course_fees: [], ...over,
});
const listing = (sections: TermSection[], over: Partial<TermListing> = {}): TermListing => ({
  course_code: "110B", module_code: "ECON-110B", module_name: "Short Run Macroeconomics", course_title: null,
  academic_level: "UD", section_count: sections.length, matching_section_count: sections.length, complete_package_count: 1,
  open_package_count: 1, waitlist_package_count: 0, open_section_count: 1, open_seat_count: 0, waitlist_available_count: 0,
  instruction_types: ["lecture"], instructors: ["James Hamilton"], is_topic_course: false, section_family: null,
  units_display: "4 units", course_fees: [], prerequisites: [], restrictions: [], sections, ...over,
});

const fallDetail: CourseDetail = {
  t: "Short-Run Macroeconomics", u: "4", desc: "Macro.", pre: "ECON 1", unl: [], hist: [], ge: [], gpa: 2.9, aRate: 30, terms: 28,
  offered: 1, seatUrl: "https://tss", tss: "https://tss", res: null, fa: ["Fabian Trottner"], seatsAt: "2026-09-21T08:13Z",
  profs: [
    { i: "Fabian Gunter We Trottner", g: 2.95, A: 30, B: 32, C: 27, D: 1, F: 1, W: 2, P: 3, NP: 0, n: 6, y: 25, cur: 1, rq: 4.4, rd: 3.2, rw: 79, rn: 19, rid: 1 },
    { i: "James D Hamilton", g: 2.89, A: 27, B: 30, C: 30, D: 2, F: 2, W: 3, P: 4, NP: 0, n: 22, y: 25, cur: 0, rq: 3.3, rd: 2.9, rw: 60, rn: 46, rid: 2 },
  ],
  sec: [["A00", "LE", "TuTh", "3:30p", "4:50p", "Mosaic", "MOS 0114", "Fabian Trottner", 22, 250, 0, 0, 228, "E 00000930", [], 930, 1010, "MOS", "AC", "", ""]],
};

describe("Winter laid over the shared (Fall) dataset", () => {
  const winterCourse = {
    t: "Short Run Macroeconomics", u: "4", lvl: "UD", fa: ["James Hamilton"], res: null, tpre: "ECON 1 (minimum grade D)",
    listings: [listing([section({})])],
  };

  test("an offered course gets Winter's sections, instructors and no Fall booking link or room", () => {
    const c = courseForTerm(fallDetail, winterCourse, "WI27");
    assert.equal(c.offered, 1);
    assert.equal(c.term, "WI27");
    assert.deepEqual(c.fa, ["James Hamilton"]);
    assert.equal(c.tss, null);
    assert.equal(c.seatUrl, null);
    assert.equal(c.seatsAt, undefined);
    assert.ok(c.sec.every((t) => t[5] === "" && t[6] === ""), "no Fall room survives");
    assert.deepEqual(c.sec.map((t) => [t[0], t[2], t[3], t[4]]), [["A00", "TuTh", "12:30p", "1:50p"]]);
  });

  test("'teaching this term' follows Winter's instructor, matched across name spellings", () => {
    const c = courseForTerm(fallDetail, winterCourse, "WI27");
    assert.deepEqual(c.profs.map((p) => [p.i, p.cur]), [["James D Hamilton", 1], ["Fabian Gunter We Trottner", 0]]);
  });

  test("someone new to the course is named with no history, not replaced by a past instructor", () => {
    const profs = profsForTerm(fallDetail.profs, ["Ada Lovelace"]);
    assert.deepEqual(profs[0], { i: "Ada Lovelace", g: 0, A: 0, B: 0, C: 0, D: 0, F: 0, W: 0, P: 0, NP: 0, n: 0, y: null, cur: 1, rq: null, rd: null, rw: null, rn: null, rid: null });
    assert.ok(profs.slice(1).every((p) => p.cur === 0));
  });

  test("a course Winter does not offer shows no Fall section at all", () => {
    const c = courseForTerm(fallDetail, null, "WI27");
    assert.equal(c.offered, 0);
    assert.deepEqual(c.sec, []);
    assert.deepEqual(c.fa, []);
    assert.equal(c.tss, null);
    assert.ok(c.profs.every((p) => p.cur === 0));
    assert.equal(c.hist, fallDetail.hist, "history is shared, not copied");
  });

  test("a subject file: shared courses, Winter-only courses, and a stale file flagged", () => {
    const base: SubjectFile = { code: "ECON", name: "Economics", term: "FA26", termName: "Fall 2026", courses: { "ECON 110B": fallDetail, "ECON 1": { ...fallDetail, t: "Principles" } } };
    const file: TermSubjectFile = {
      code: "ECON", name: "Economics", term: "WI27", termName: "Winter 2027", v: "WI27@0",
      courses: { "ECON 110B": winterCourse, "ECON 999": { ...winterCourse, t: "New" } },
    };
    const merged = overlaySubject(base, file, "ECON", WINTER);
    assert.equal(merged.term, "WI27");
    assert.deepEqual(Object.keys(merged.courses).sort(), ["ECON 1", "ECON 110B", "ECON 999"]);
    assert.equal(merged.courses["ECON 1"].offered, 0);
    assert.equal(merged.courses["ECON 999"].offered, 1);
    assert.equal(merged.stale, true, "built from another snapshot than the page expects");
    assert.deepEqual(merged.features, WINTER.features);
    assert.equal(overlaySubject(base, { ...file, v: "WI27@1" }, "ECON", WINTER).stale, undefined);
  });

  test("the index: Winter's seats and meetings, everyone else not offered, new courses added", () => {
    const base = {
      meta: { term: "FA26", termName: "Fall 2026", generated: "", years: "", gradeRecords: 0, catalogCourses: 2, offered: 2, sources: ["UC San Diego Class Planner (x)", "grades"], seatsAsOf: "2026-09-21T00:15Z" },
      subjects: [{ code: "ECON", name: "Economics", n: 2, offered: 2 }],
      courses: [
        { k: "ECON 110B", s: "ECON", c: "110B", t: "Short-Run Macroeconomics", u: "4", g: 2.9, a: 30, r: 28, o: 1, pr: 1, sa: 103, sl: 500, sat: "2026-10-23T22:24Z", d: "TuTh", st: "3:30p", en: "4:50p", b: "Mosaic", p: "Fabian Trottner", pq: 4.4, pn: 19, pa: 30, pd: 3.2, pg: 2.9 },
        { k: "ECON 1", s: "ECON", c: "1", t: "Principles", u: "4", g: 3, a: 40, r: 30, o: 1, pr: 0, sa: 10, sl: 400, d: "MWF", st: "9:00a", en: "9:50a", b: "Center", p: "X", pq: null, pn: null, pa: null, pd: null, pg: null },
      ],
    } as PlatIndex;
    const file: TermIndexFile = {
      meta: { term: "WI27", termName: "Winter 2027", v: "WI27@1", source: "public", refreshed: "2026-11-06 01:38:11+00", counts: { courses: 2 }, summary: { courses: 3, sections: 1, meetings: 1 }, features: WINTER.features, subjects: [{ code: "ECON", name: "Economics", offered: 2 }, { code: "NEWS", name: "New Subject", offered: 1 }] },
      courses: [
        { k: "ECON 110B", s: "ECON", c: "110B", t: "Short Run Macroeconomics", u: "4", sa: 350, sl: 350, d: "TuTh", st: "12:30p", en: "1:50p", p: "James Hamilton", in: ["James Hamilton"], pq: 3.3, pn: 46, pa: 27, pd: 2.9, pg: 2.9, lvl: "UD", tp: 1 },
        { k: "NEWS 1", s: "NEWS", c: "1", t: "Brand New", u: "2", sa: 20, sl: 20, wo: 1, d: null, st: null, en: null, p: null, pq: null, pn: null, pa: null, pd: null, pg: null, lvl: "LD", tba: 1, nb: 1, ct: 0 },
      ],
    };
    const idx = overlayIndex(base, file, WINTER);
    const row = (k: string) => idx.courses.find((r) => r.k === k)!;
    assert.equal(idx.meta.term, "WI27");
    assert.equal(idx.meta.seatsAsOf, undefined, "no Fall seat time");
    assert.ok(!idx.meta.sources.some((s) => /\(x\)/.test(s)));
    assert.deepEqual([row("ECON 110B").o, row("ECON 110B").sa, row("ECON 110B").b, row("ECON 110B").p, row("ECON 110B").sat], [1, 350, null, "James Hamilton", undefined]);
    assert.deepEqual([row("ECON 1").o, row("ECON 1").sa, row("ECON 1").d, row("ECON 1").p], [0, null, null, null]);
    assert.deepEqual([row("NEWS 1").o, row("NEWS 1").g, row("NEWS 1").ct, row("NEWS 1").wo], [1, null, 0, 1]);
    assert.deepEqual(idx.subjects.map((s) => [s.code, s.n, s.offered]), [["ECON", 2, 1], ["NEWS", 1, 1]]);
  });

  test("the professor index marks who teaches in Winter", () => {
    const base: ProfessorFile = { meta: { term: "FA26" }, professors: [
      { n: "Fabian Gunter We Trottner", a: ["Fabian Trottner"], q: null, nr: null, d: null, w: null, id: null, cur: 1, terms: 6, gpa: 3, c: [["ECON 110B", 3, 6, 1, 30]] },
      { n: "James D Hamilton", q: null, nr: null, d: null, w: null, id: null, cur: 0, terms: 22, gpa: 2.9, c: [["ECON 110B", 2.9, 22, 0, 27]] },
    ] };
    const file = { meta: { term: "WI27" }, courses: [{ k: "ECON 110B", p: "James Hamilton", in: ["James Hamilton"] }] } as unknown as TermIndexFile;
    const out = overlayProfessors(base, file);
    assert.deepEqual(out.professors.map((p) => [p.n, p.cur, p.c[0][3]]), [["Fabian Gunter We Trottner", 0, 0], ["James D Hamilton", 1, 1]]);
  });
});

describe("listings as section tuples", () => {
  test("a lecture's weekday rows fold into one meeting; a final keeps its own date", () => {
    const s = section({ meetings: [
      meeting({ day_code: "M" }), meeting({ day_code: "W" }), meeting({ day_code: "F" }),
      meeting({ meeting_kind: "final", day_code: "S", specific_date: "2027-03-20", start_minutes: 690, end_minutes: 869, start_time_display: "11:30am", end_time_display: "2:29pm" }),
    ] });
    const tuples = listingTuples([listing([s])], false);
    assert.deepEqual(tuples.map((t) => [t[0], t[1], t[2], t[3], t[4]]), [["A00", "LE", "MWF", "12:30p", "1:50p"], ["2027-03-20", "FI", "2027-03-20", "11:30a", "2:29p"]]);
  });

  test("TBA and UCSD's midnight placeholder have no time; remote says so", () => {
    const tba = meeting({ day_code: null, day_name: null, start_minutes: null, end_minutes: null, start_time_display: "tba", end_time_display: "tba", is_tba: true });
    const placeholder = meeting({ day_code: null, start_minutes: 0, end_minutes: 0, start_time_display: "12:00am", end_time_display: "12:00am", is_tba: true, is_remote: true });
    for (const m of [tba, placeholder]) {
      const [t] = listingTuples([listing([section({ meetings: [m] })])], false);
      assert.equal(t[3], "");
      assert.equal(t[15], null);
    }
    const [remote] = listingTuples([listing([section({ meetings: [placeholder] })])], false);
    assert.equal(remote[5], "Remote");
    assert.equal(foldMeetings([tba])[0].tba, true);
  });

  test("a section with no meetings still appears once; status and ids are kept", () => {
    const [t] = listingTuples([listing([section({ meetings: [], status: "waitlist_only", event_package_ids: ["9"] })])], false);
    assert.deepEqual([t[0], t[13], t[14], t[18], t[8], t[9]], ["A00", "E 1", ["9"], "waitlist_only", 154, 154]);
  });

  test("topics are named per section only when the listings differ", () => {
    const a = listing([section({})], { module_name: "Topic A" });
    const b = listing([section({ section_id: "E 2", section_code: "002-000-LE" })], { module_name: "Topic B" });
    assert.deepEqual(listingTuples([a, b], true).map((t) => [t[0], t[19]]), [["A00", "Topic A"], ["B00", "Topic B"]]);
  });

  test("display codes: letters for families, the raw code past Z", () => {
    assert.equal(displayCode("004-000-LE"), "D00");
    assert.equal(displayCode("002-003-DI"), "B03");
    assert.equal(displayCode("027-001-LA"), "027-001-LA");
  });
});

describe("which quarter a page shows", () => {
  test("an explicit address wins; then the stored choice; then the newest quarter", () => {
    assert.deepEqual(resolveTerm("wi27", "FA26", MANIFEST), { term: "WI27", source: "url", unknown: null });
    assert.deepEqual(resolveTerm(null, "FA26", MANIFEST), { term: "FA26", source: "stored", unknown: null });
    assert.deepEqual(resolveTerm(null, null, MANIFEST), { term: "WI27", source: "default", unknown: null });
    assert.equal(defaultTerm(MANIFEST), "WI27");
  });

  test("an address naming a quarter the site has no schedule for is reported, not replaced silently", () => {
    assert.deepEqual(resolveTerm("SP27", null, MANIFEST), { term: "WI27", source: "default", unknown: "SP27" });
    assert.deepEqual(resolveTerm("spring", "FA26", MANIFEST), { term: "FA26", source: "stored", unknown: "spring" });
    assert.equal(parseTerm(" wi27 "), "WI27");
    assert.equal(parseTerm("2027"), null);
  });

  test("links carry the quarter, keeping their own query and hash", () => {
    assert.equal(withTerm("/course/ECON/110B", "WI27"), "/course/ECON/110B?term=WI27");
    assert.equal(withTerm("/courses/ECON?q=macro#list", "WI27"), "/courses/ECON?q=macro&term=WI27#list");
    assert.equal(withTerm("/x?term=FA26", "WI27"), "/x?term=WI27");
    assert.equal(withTerm("/x", null), "/x");
  });

  test("where each quarter is on San Diego's calendar", () => {
    assert.equal(termPhase("FA26", "2026-11-06"), "in-progress");
    assert.equal(termPhase("WI27", "2026-11-06"), "upcoming");
    assert.equal(termPhase("WI27", "2027-03-20"), "in-progress");
    assert.equal(termPhase("WI27", "2027-03-21"), "ended");
  });
});
