import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  COMPACT_DATES, compactDates, dateAnchorId, dateSection, panelQuarters, plannerLink, progressFor, progressPhase,
} from "./academicTimeline";
import { timelineFor, timelineView } from "./termTimeline";
import { readClock } from "./quarterClock";

const at = (iso: string) => Date.parse(iso);
const winter = timelineFor("WI27")!;

describe("the home page's calendar panel", () => {
  test("shows Fall's progress and Winter's dates together, from the served quarters alone", () => {
    assert.deepEqual(panelQuarters(["FA26", "WI27"]), { progress: "FA26", dates: "WI27" });
    // The quarter being browsed is not an input: both parts stay, whichever it is.
    assert.equal(panelQuarters.length, 0, "no selected-quarter parameter to depend on");
  });

  test("never shows one quarter twice, and copes with a quarter missing", () => {
    assert.deepEqual(panelQuarters(["FA26"], () => false), { progress: "FA26", dates: null });
    assert.deepEqual(panelQuarters(["WI27"]), { progress: null, dates: "WI27" });
    // When Spring arrives with its own dates, Winter becomes the bar.
    assert.deepEqual(panelQuarters(["FA26", "WI27", "SP27"], (t) => t !== "FA26"), { progress: "WI27", dates: "SP27" });
  });
});

describe("Fall's bar, by Fall's own boundaries", () => {
  test("in progress in November: its week, not Winter's", () => {
    const r = progressFor("FA26", at("2026-11-07T20:00:00Z"))!;
    assert.equal(r.quarter.key, "FA26");
    assert.equal(r.ended, false);
    assert.equal(progressPhase(r), "Week 6 of 10");
  });

  test("finals week, then ended, never blank and never relabelled as Winter", () => {
    assert.equal(progressPhase(progressFor("FA26", at("2026-12-08T20:00:00Z"))!), "Finals week");
    const after = progressFor("FA26", at("2026-12-20T20:00:00Z"))!;
    assert.equal(after.quarter.key, "FA26");
    assert.equal(after.ended, true);
    assert.equal(after.fraction, 1);
    assert.equal(after.next, null);
    assert.equal(progressPhase(after), "Ended Sat, Dec 12, 2026");
    // The calendar has moved on to Winter by then; Fall's bar still reads Fall.
    assert.equal(readClock(at("2026-12-20T20:00:00Z"))!.quarter.key, "WI27");
  });

  test("ends at midnight San Diego time on Dec 12, whatever the reader's time zone", () => {
    assert.equal(progressFor("FA26", at("2026-12-13T07:59:00Z"))!.ended, false, "11:59 pm Dec 12 in San Diego");
    assert.equal(progressFor("FA26", at("2026-12-13T08:00:00Z"))!.ended, true, "midnight, 4 pm Dec 13 in Beijing");
  });

  test("Winter's own phase comes from Winter's dates", () => {
    assert.equal(progressPhase(progressFor("WI27", at("2026-11-07T20:00:00Z"))!), "Begins Mon, Jan 4");
    assert.equal(progressPhase(progressFor("WI27", at("2027-01-04T20:00:00Z"))!), "Week 1 of 10");
    assert.equal(progressFor("XX99", at("2026-11-07T20:00:00Z")), null);
  });
});

describe("links in the panel name their own quarter", () => {
  test("Fall's opens Fall and Winter's opens Winter, whichever is browsed", () => {
    assert.deepEqual(plannerLink("FA26", false), { term: "FA26", label: "Fall schedule", href: "/planner?term=FA26" });
    assert.deepEqual(plannerLink("WI27", true), { term: "WI27", label: "Winter planner", href: "/planner?term=WI27" });
    assert.equal(plannerLink("WI27", false).label, "Winter schedule");
  });
});

describe("the compact dates and their details", () => {
  test("two upcoming dates, the rest counted for View all", () => {
    const view = timelineView(winter, "2026-11-06");
    const c = compactDates(view);
    assert.equal(COMPACT_DATES, 2);
    assert.deepEqual(c.groups.map((g) => g.date), ["2026-11-07", "2026-11-09"]);
    assert.equal(c.moreDates, view.upcoming.length - 2);
  });

  test("Show all for Jan 15 opens the details at Jan 15, with all five dates there", () => {
    const view = timelineView(winter, "2027-01-15");
    assert.equal(dateSection(view, "2027-01-15"), "upcoming");
    assert.equal(view.upcoming[0].events.length, 5);
    assert.equal(dateAnchorId("dates-x", "2027-01-15"), "dates-x-date-2027-01-15");
    // Two copies of the list (panel and details) never share an id.
    assert.notEqual(dateAnchorId("a", "2027-01-15"), dateAnchorId("b", "2027-01-15"));
  });

  test("finals in progress and past dates are found where the details keep them", () => {
    const view = timelineView(winter, "2027-03-20");
    assert.equal(dateSection(view, "2027-03-13"), "ongoing");
    assert.equal(dateSection(view, "2027-03-20"), "upcoming");
    assert.equal(dateSection(view, "2026-11-09"), "past");
    assert.equal(dateSection(view, "2030-01-01"), null);
  });

  test("after every dated event, nothing compact is left but the count of what is unconfirmed", () => {
    const view = timelineView(winter, "2027-03-23");
    assert.deepEqual(compactDates(view), { groups: [], moreDates: 0 });
    assert.equal(view.pending.length, 3);
  });
});
