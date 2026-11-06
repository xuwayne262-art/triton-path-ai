import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { todayInSanDiego } from "./housing/terms";
import {
  audienceOf, chartMarks, chronological, countdownWords, forStudents, headlineEvent, matchesAudience, nextEvent, timelineFor,
  type TimelineEvent,
} from "./termTimeline";

const winter = timelineFor("WI27")!;
const byId = (id: string) => winter.events.find((e) => e.id === id)!;
/** San Diego's date at an instant, as the page would read it from a student's clock. */
const sd = (iso: string) => todayInSanDiego(new Date(iso));

describe("Winter 2027's dates", () => {
  test("the published milestones are the brief's", () => {
    const at = (label: RegExp) => winter.events.find((e) => label.test(e.label))!;
    assert.equal(at(/schedule and booking appointments/).date, "2026-11-05");
    assert.equal(at(/Continuing-student booking/).date, "2026-11-09");
    assert.equal(at(/Waitlists open/).date, "2026-11-16");
    assert.equal(at(/Quarter and instruction begin/).date, "2027-01-04");
    assert.equal(at(/Automatic waitlists close/).date, "2027-01-15");
    assert.equal(at(/without a W/).date, "2027-01-29");
    assert.equal(byId("WI27-24").date, "2027-02-12");
    assert.deepEqual([byId("WI27-29").date, byId("WI27-29").end_date], ["2027-03-13", "2027-03-20"]);
  });

  test("dates UCSD has not published stay TBD, after everything dated", () => {
    const tbd = winter.events.filter((e) => e.date === null);
    assert.equal(tbd.length, 4);
    assert.ok(tbd.every((e) => e.status === "unpublished"));
    assert.deepEqual(chronological(winter).slice(-4).map((e) => e.date), [null, null, null, null]);
  });

  test("every date is a calendar date with no time attached", () => {
    for (const e of winter.events) {
      for (const d of [e.date, e.end_date]) if (d) assert.match(d, /^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe("the next date a student can act on", () => {
  test("Nov 6 in San Diego and in Shanghai: booking on Monday, Nov 9", () => {
    for (const instant of ["2026-11-06T20:00:00Z" /* noon in San Diego */, "2026-11-06T15:30:00Z" /* 11:30 pm in Shanghai */]) {
      const n = nextEvent(winter, sd(instant))!;
      assert.equal(n.event.id, "WI27-05", "holds take effect Nov 7 first");
    }
    const n = nextEvent(winter, "2026-11-08")!;
    assert.deepEqual([n.event.label, n.days, countdownWords(n)], ["Continuing-student booking begins", 1, "tomorrow"]);
  });

  test("the headline leads with booking: on Nov 6, Monday's booking in 3 days", () => {
    for (const instant of ["2026-11-06T20:00:00Z", "2026-11-06T15:30:00Z"]) {
      const n = headlineEvent(winter, sd(instant))!;
      assert.deepEqual([n.event.label, n.event.date, countdownWords(n)], ["Continuing-student booking begins", "2026-11-09", "in 3 days"]);
    }
    assert.equal(headlineEvent(winter, "2026-11-17")!.event.label, "Automatic waitlists close");
    assert.equal(headlineEvent(winter, "2027-01-16")!.event.label, "Martin Luther King Jr. Day holiday", "after booking dates, the next of anything");
  });

  test("Shanghai's Nov 7 morning is still Nov 6 in San Diego", () => {
    assert.equal(sd("2026-11-06T23:00:00Z"), "2026-11-06", "7 a.m. Nov 7 in Shanghai");
  });

  test("Nov 9 is today; Nov 16 waitlists; Jan 4 instruction", () => {
    assert.deepEqual([nextEvent(winter, "2026-11-09")!.event.id, countdownWords(nextEvent(winter, "2026-11-09")!)], ["WI27-06", "today"]);
    assert.equal(nextEvent(winter, "2026-11-10")!.event.label, "Waitlists open");
    assert.equal(nextEvent(winter, "2027-01-04")!.event.label, "Quarter and instruction begin");
  });

  test("Jan 15 is one deadline day with several things on it", () => {
    const n = nextEvent(winter, "2027-01-15")!;
    assert.equal(n.event.date, "2027-01-15");
    assert.ok(n.alongside.length >= 3);
    assert.ok([n.event, ...n.alongside].some((e) => e.label === "Automatic waitlists close"));
  });

  test("across the March clock change and through finals, then nothing left", () => {
    assert.equal(nextEvent(winter, "2027-03-14")!.event.label, "Final exams", "the day of the change, finals under way");
    assert.equal(nextEvent(winter, "2027-03-14")!.ongoing, true);
    assert.equal(sd("2027-03-14T09:30:00Z"), "2027-03-14", "2:30 a.m. PDT, just after the change");
    const last = nextEvent(winter, "2027-03-20")!;
    assert.ok(["Final exams", "Quarter ends and Winter diploma date", "Resolve a previous-quarter incomplete"].includes(last.event.label));
    assert.equal(nextEvent(winter, "2027-03-23"), null);
  });

  test("office deadlines are not a student's next step", () => {
    assert.equal(forStudents(byId("WI27-03")), false);
    assert.equal(forStudents(byId("WI27-30")), false);
    assert.equal(nextEvent(winter, "2026-11-04")!.event.id, "WI27-04");
  });
});

describe("undergraduate and graduate dates", () => {
  const ev = (audience: string) => ({ audience } as TimelineEvent);
  test("each group sees its own deadlines and everyone's", () => {
    assert.deepEqual(audienceOf(ev("Undergraduates")), { undergraduate: true, graduate: false });
    assert.deepEqual(audienceOf(ev("Returning undergraduates")), { undergraduate: true, graduate: false });
    assert.deepEqual(audienceOf(ev("Graduate students")), { undergraduate: false, graduate: true });
    assert.deepEqual(audienceOf(ev("Master’s students")), { undergraduate: false, graduate: true });
    assert.deepEqual(audienceOf(ev("Undergraduate and graduate students")), { undergraduate: true, graduate: true });
    assert.deepEqual(audienceOf(ev("Continuing students; new graduate students check with their program")), { undergraduate: true, graduate: true });
  });

  test("the drop-with-W deadline differs: Feb 12 undergraduates, Mar 5 graduates", () => {
    assert.equal(matchesAudience(byId("WI27-24"), "undergraduate"), true);
    assert.equal(matchesAudience(byId("WI27-24"), "graduate"), false);
    assert.equal(matchesAudience(byId("WI27-26"), "graduate"), true);
    assert.equal(matchesAudience(byId("WI27-26"), "undergraduate"), false);
  });
});

describe("marks on a quarter's seat chart", () => {
  test("Winter: booking and waitlists, at the start of the San Diego day", () => {
    assert.deepEqual(chartMarks("WI27").map((m) => [m.label, m.date.toISOString()]), [
      ["Booking", "2026-11-09T08:00:00.000Z"],
      ["Waitlists", "2026-11-16T08:00:00.000Z"],
    ]);
  });

  test("Fall keeps its own three passes; nothing is borrowed across quarters", () => {
    assert.deepEqual(chartMarks("FA26").map((m) => m.label), ["Pass 1", "Pass 2", "Pass 3"]);
    assert.deepEqual(chartMarks("SP27"), []);
  });
});
