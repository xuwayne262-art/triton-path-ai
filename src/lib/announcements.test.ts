import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { ANNOUNCEMENTS, type Announcement } from "../data/announcements";
import {
  NEW_FOR_DAYS, announcementHref, announcementProblems, isNewAnnouncement, latestAnnouncement,
} from "./announcements";

const entry = (over: Partial<Announcement> = {}): Announcement => ({
  id: "2026-10-13-course-pages",
  date: "2026-10-13",
  title: "Finals that match your lecture",
  summary: "Course pages follow the sections you pick.",
  groups: [{ label: "Course pages", items: [{ title: "Finals", text: "Each lecture lists its own.", link: { href: "/course/BILD/4", label: "See BILD 4" } }] }],
  ...over,
});

describe("the announcements", () => {
  test("are written correctly: newest first, real dates, one id each, public links", () => {
    assert.deepEqual(announcementProblems(ANNOUNCEMENTS), []);
  });

  test("start with the October 2026 update", () => {
    assert.ok(ANNOUNCEMENTS.length > 0);
    assert.equal(ANNOUNCEMENTS.at(-1)?.id, "2026-10-13-course-pages");
  });

  test("put the newest one on the home page, linked to its place on the page", () => {
    const latest = latestAnnouncement();
    assert.equal(latest, ANNOUNCEMENTS[0]);
    assert.equal(announcementHref(latest!), `/announcements#${latest!.id}`);
    assert.equal(latestAnnouncement([]), null);
  });
});

describe("announcementProblems", () => {
  test("accepts a well-formed entry", () => {
    assert.deepEqual(announcementProblems([entry()]), []);
  });

  test("names an older entry put above a newer one", () => {
    const older = entry({ id: "2026-09-01-older", date: "2026-09-01" });
    const problems = announcementProblems([older, entry()]);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /newest goes first/);
  });

  test("rejects dates that are not calendar days, and ids that disagree with them", () => {
    assert.match(announcementProblems([entry({ id: "2026-02-30-x", date: "2026-02-30" })]).join(" "), /not a YYYY-MM-DD day/);
    assert.match(announcementProblems([entry({ id: "2026-10-12-course-pages" })]).join(" "), /starts with 2026-10-12/);
    assert.match(announcementProblems([entry({ id: "Course Pages" })]).join(" "), /lowercase slug/);
  });

  test("rejects a repeated id", () => {
    assert.match(announcementProblems([entry(), entry()]).join(" "), /used twice/);
  });

  test("rejects links that leave the site or need a sign-in", () => {
    const linkTo = (href: string) => entry({
      groups: [{ label: "Course pages", items: [{ title: "Finals", text: "Each lecture lists its own.", link: { href, label: "Look" } }] }],
    });
    assert.match(announcementProblems([linkTo("https://example.com")]).join(" "), /inside the site/);
    assert.match(announcementProblems([linkTo("//example.com/x")]).join(" "), /inside the site/);
    assert.match(announcementProblems([linkTo("/planner")]).join(" "), /asks visitors to sign in/);
    assert.deepEqual(announcementProblems([linkTo("/about#letter")]), []);
  });

  test("rejects blank parts", () => {
    assert.match(announcementProblems([entry({ title: " " })]).join(" "), /no title/);
    assert.match(announcementProblems([entry({ summary: "" })]).join(" "), /no summary/);
    assert.match(announcementProblems([entry({ groups: [] })]).join(" "), /no changes listed/);
    assert.match(announcementProblems([entry({ groups: [{ label: "Course pages", items: [] }] })]).join(" "), /lists nothing/);
  });
});

describe("isNewAnnouncement", () => {
  const a = entry();
  const noon = Date.parse("2026-10-13T12:00:00Z");
  const day = 86_400_000;

  test("is new from its San Diego day for two weeks", () => {
    assert.equal(isNewAnnouncement(a, Date.parse("2026-10-14T03:04:00Z")), true); // 8:04 PM PT, Oct 13
    assert.equal(isNewAnnouncement(a, noon + (NEW_FOR_DAYS - 1) * day), true);
    assert.equal(isNewAnnouncement(a, noon + NEW_FOR_DAYS * day), false);
  });

  test("is not new long before its date", () => {
    assert.equal(isNewAnnouncement(a, noon - 3 * day), false);
  });
});
