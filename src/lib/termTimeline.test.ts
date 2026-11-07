import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { quarterByKey, todayInSanDiego } from "./housing/terms";
import {
  audienceLine, audienceOf, byMonth, chartMarks, chronological, countdownWords, datesFor, daysUntil, enrolling,
  forStudents, groupByDate, matchesAudience, monthLabel, quarterStage, timelineFor, timelineView,
  type TimelineEvent,
} from "./termTimeline";

const winter = timelineFor("WI27")!;
const q = quarterByKey("WI27")!;
const byId = (id: string) => winter.events.find((e) => e.id === id)!;
/** San Diego's date at an instant, as the page would read it from a student's clock. */
const sd = (iso: string) => todayInSanDiego(new Date(iso));
const ids = (events: TimelineEvent[]) => events.map((e) => e.id);
/** What the card leads with: the first date group still ahead. */
const next = (today: string, filter: "all" | "undergraduate" | "graduate" = "all") => timelineView(winter, today, filter).upcoming[0];

describe("Winter 2027's dates", () => {
  test("the published milestones are the brief's", () => {
    const at = (label: RegExp) => winter.events.find((e) => label.test(e.label))!;
    assert.equal(at(/schedule and booking appointments/).date, "2026-11-05");
    assert.equal(at(/Booking holds take effect/).date, "2026-11-07");
    assert.equal(at(/Continuing-student booking/).date, "2026-11-09");
    assert.equal(at(/Waitlists open/).date, "2026-11-16");
    assert.equal(at(/Billing statement/).date, "2026-12-04");
    assert.equal(at(/Regular health insurance waiver/).date, "2026-12-14");
    assert.equal(at(/Quarter and instruction begin/).date, "2027-01-04");
    assert.equal(at(/Automatic waitlists close/).date, "2027-01-15");
    assert.equal(at(/without a W/).date, "2027-01-29");
    assert.equal(byId("WI27-24").date, "2027-02-12");
    assert.equal(byId("WI27-26").date, "2027-03-05");
    assert.equal(at(/Instruction ends/).date, "2027-03-12");
    assert.deepEqual([byId("WI27-29").date, byId("WI27-29").end_date], ["2027-03-13", "2027-03-20"]);
    assert.equal(at(/Quarter ends/).date, "2027-03-20");
    assert.equal(at(/incomplete grade request/).date, "2027-03-22");
  });

  test("the Jan 15 add deadline covers ordinary adds, not only rebooking after nonpayment", () => {
    assert.match(byId("WI27-14").label, /^Last day to add a class/);
    assert.match(byId("WI27-14").label, /nonpayment/);
  });

  test("the fee deadline is Dec 18, from the fee pages, with the calendar's TBD kept beside it", () => {
    const fee = byId("WI27-35");
    assert.equal(fee.date, "2026-12-18");
    assert.equal(fee.status, "published");
    assert.deepEqual(fee.groups, ["undergraduate", "graduate"]);
    // Cited to the pages that give the date, not only the calendar that does not.
    assert.match(fee.source_url, /finances\/fees\/registration\/2026-27/);
    const said = Object.fromEntries((fee.sources ?? []).map((s) => [s.url.split("/").pop(), s.says]));
    assert.deepEqual(said, { "index.html": "12/18/2026", "graduate.html": "12/18/2026", "calendar26-27.html": "TBD" });
    assert.ok(fee.sources!.every((s) => /^\d{4}-\d{2}-\d{2}$/.test(s.checked)));
    assert.match(fee.note ?? "", /TBD/);
    assert.match(fee.note ?? "", /Self-supporting/, "programs with their own fee pages are told to check them");
  });

  test("late payment, fee holds and grades stay unpublished; nothing is inferred from the payment date", () => {
    const tbd = winter.events.filter((e) => e.date === null);
    assert.deepEqual(ids(tbd), ["WI27-34", "WI27-36", "WI27-37"]);
    assert.ok(tbd.every((e) => e.status === "unpublished"));
    assert.deepEqual(chronological(winter).slice(-3).map((e) => e.date), [null, null, null]);
  });

  test("every date is a calendar date with no time attached", () => {
    for (const e of winter.events) {
      for (const d of [e.date, e.end_date]) if (d) assert.match(d, /^\d{4}-\d{2}-\d{2}$/);
    }
  });

  test("every source says when UCSD updated it and when it was checked, apart", () => {
    assert.ok(winter.sources?.length);
    for (const s of winter.sources!) {
      assert.match(s.checked, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(s.updated === null || /^\d{4}-\d{2}-\d{2}$/.test(s.updated));
      assert.match(s.url, /^https:\/\/(students|blink)\.ucsd\.edu\//);
    }
  });
});

describe("the next date, from one list for the audience chosen", () => {
  test("Nov 6 in San Diego and in Shanghai: holds on Nov 7 lead, booking follows", () => {
    for (const instant of ["2026-11-06T20:00:00Z" /* noon in San Diego */, "2026-11-06T15:30:00Z" /* 11:30 pm in Shanghai, Nov 7 there */]) {
      const today = sd(instant);
      assert.equal(today, "2026-11-06");
      const v = timelineView(winter, today);
      assert.deepEqual(v.upcoming.slice(0, 3).map((g) => g.date), ["2026-11-07", "2026-11-09", "2026-11-16"]);
      assert.deepEqual(ids(v.upcoming[0].events), ["WI27-05"]);
      assert.equal(countdownWords(daysUntil(v.upcoming[0].date, today)), "tomorrow");
    }
  });

  test("Nov 17 and Dec 4: the next date leads, December before January", () => {
    assert.equal(next("2026-11-17").date, "2026-12-04", "not the Jan 15 waitlist date");
    assert.deepEqual(timelineView(winter, "2026-11-17").upcoming.slice(0, 3).map((g) => g.date), ["2026-12-04", "2026-12-11", "2026-12-14"]);
    assert.equal(countdownWords(daysUntil(next("2026-12-04").date, "2026-12-04")), "today");
    assert.equal(next("2026-12-15").date, "2026-12-18");
  });

  test("Dec 18: the fee deadline is due for both groups", () => {
    for (const f of ["all", "undergraduate", "graduate"] as const) {
      assert.ok(ids(next("2026-12-18", f).events).includes("WI27-35"), f);
    }
  });

  test("Jan 3 and Jan 4: the start of instruction leads, not Jan 15", () => {
    assert.deepEqual(ids(next("2027-01-03").events), ["WI27-12"]);
    assert.equal(countdownWords(daysUntil(next("2027-01-03").date, "2027-01-03")), "tomorrow");
    assert.deepEqual(ids(next("2027-01-04").events), ["WI27-12"]);
    assert.deepEqual(quarterStage(q, "2027-01-03"), { kind: "before", classes: "2027-01-04" });
    assert.deepEqual(quarterStage(q, "2027-01-04"), { kind: "teaching", week: 1, of: 10 });
  });

  test("Jan 15: all five student dates under one date, and each audience its own", () => {
    const all = next("2027-01-15");
    assert.equal(all.date, "2027-01-15");
    assert.deepEqual(ids(all.events), ["WI27-13", "WI27-14", "WI27-15", "WI27-16", "WI27-17"]);
    assert.deepEqual(ids(next("2027-01-15", "undergraduate").events), ["WI27-13", "WI27-14", "WI27-15", "WI27-16"]);
    assert.deepEqual(ids(next("2027-01-15", "graduate").events), ["WI27-13", "WI27-14", "WI27-15", "WI27-17"]);
    // Grouped after the audience is applied: the same day, counted the same way in every view.
    const counts = (f: "all" | "undergraduate" | "graduate") => datesFor(winter, f).filter((e) => e.date === "2027-01-15").length;
    assert.deepEqual([counts("all"), counts("undergraduate"), counts("graduate")], [5, 4, 4]);
  });

  test("Feb 12 for graduate students leaves out the undergraduate unit and W deadlines", () => {
    assert.deepEqual(ids(next("2027-02-12", "graduate").events), ["WI27-23"]);
    assert.deepEqual(ids(next("2027-02-12", "undergraduate").events), ["WI27-22", "WI27-23", "WI27-24"]);
    assert.deepEqual(ids(next("2027-02-12").events), ["WI27-22", "WI27-23", "WI27-24"]);
  });

  test("Mar 20: finals in progress, and that day's deadlines still listed", () => {
    const v = timelineView(winter, "2027-03-20");
    assert.deepEqual(ids(v.ongoing), ["WI27-29"]);
    assert.deepEqual(ids(v.upcoming[0].events), ["WI27-31", "WI27-32"]);
    assert.equal(v.upcoming[0].date, "2027-03-20");
    assert.deepEqual(quarterStage(q, "2027-03-20"), { kind: "finals", from: "2027-03-13", to: "2027-03-20" });
    // The first day of finals is in progress too, not a deadline.
    assert.deepEqual(ids(timelineView(winter, "2027-03-13").ongoing), ["WI27-29"]);
  });

  test("Mar 21 to 23: the quarter has ended, the incomplete request stays until it passes, the unknowns stay findable", () => {
    for (const day of ["2027-03-21", "2027-03-22", "2027-03-23"]) assert.deepEqual(quarterStage(q, day), { kind: "ended", end: "2027-03-20" });
    assert.deepEqual(ids(next("2027-03-21").events), ["WI27-33"]);
    assert.deepEqual(ids(next("2027-03-22").events), ["WI27-33"]);
    const after = timelineView(winter, "2027-03-23");
    assert.deepEqual(after.upcoming, []);
    assert.deepEqual(after.ongoing, []);
    assert.equal(after.pending.length, 3, "dates awaiting confirmation are still counted");
    assert.ok(after.past.length > 0);
  });

  test("office deadlines are not a student's next step", () => {
    assert.equal(forStudents(byId("WI27-03")), false);
    assert.equal(forStudents(byId("WI27-30")), false);
    assert.equal(next("2026-11-04").date, "2026-11-05");
  });

  test("each event is in exactly one part of the view", () => {
    for (const day of ["2026-11-06", "2027-01-15", "2027-03-14", "2027-03-20", "2027-04-01"]) {
      for (const f of ["all", "undergraduate", "graduate"] as const) {
        const v = timelineView(winter, day, f);
        const seen = [...v.ongoing, ...v.upcoming.flatMap((g) => g.events), ...v.past.flatMap((g) => g.events), ...v.pending].map((e) => e.id);
        assert.equal(new Set(seen).size, seen.length, `${day} ${f}: no duplicates`);
        assert.deepEqual([...seen].sort(), ids(datesFor(winter, f)).sort(), `${day} ${f}: nothing lost`);
      }
    }
  });

  test("TSS stays the next step until the last day to add", () => {
    assert.equal(enrolling(winter, "2026-11-07"), true);
    assert.equal(enrolling(winter, "2027-01-15"), true);
    assert.equal(enrolling(winter, "2027-01-16"), false);
  });
});

describe("grouping and wording", () => {
  test("each date once, under its month", () => {
    const groups = groupByDate(datesFor(winter));
    assert.equal(new Set(groups.map((g) => g.date)).size, groups.length);
    assert.deepEqual(byMonth(groups).map((m) => monthLabel(m.month)), [
      "November 2026", "December 2026", "January 2027", "February 2027", "March 2027",
    ]);
  });

  test("the audience line is said only when the choice does not already say it", () => {
    assert.equal(audienceLine(byId("WI27-12"), "all"), null);
    assert.equal(audienceLine(byId("WI27-21"), "all"), null, "both groups is everyone");
    assert.equal(audienceLine(byId("WI27-16"), "all"), "Undergraduates");
    assert.equal(audienceLine(byId("WI27-16"), "undergraduate"), null);
    assert.equal(audienceLine(byId("WI27-17"), "graduate"), null);
    assert.equal(audienceLine(byId("WI27-05"), "undergraduate"), "Students with a hold");
  });
});

describe("undergraduate and graduate dates", () => {
  const ev = (audience: string, groups?: TimelineEvent["groups"]) => ({ audience, groups } as TimelineEvent);
  test("each group sees its own deadlines and everyone's", () => {
    assert.deepEqual(audienceOf(ev("Undergraduates")), { undergraduate: true, graduate: false });
    assert.deepEqual(audienceOf(ev("Returning undergraduates")), { undergraduate: true, graduate: false });
    assert.deepEqual(audienceOf(ev("Graduate students")), { undergraduate: false, graduate: true });
    assert.deepEqual(audienceOf(ev("Master’s students")), { undergraduate: false, graduate: true });
    assert.deepEqual(audienceOf(ev("Undergraduate and graduate students")), { undergraduate: true, graduate: true });
    assert.deepEqual(audienceOf(ev("Continuing students; new graduate students check with their program")), { undergraduate: true, graduate: true });
  });

  test("explicit groups win over the wording", () => {
    assert.deepEqual(audienceOf(ev("Students on the standard fee tables", ["graduate"])), { undergraduate: false, graduate: true });
    for (const e of winter.events.filter(forStudents)) assert.ok(e.groups?.length, `${e.id} says who it is for`);
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
