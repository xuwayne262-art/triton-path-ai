/**
 * What changed on UCSDPlans, newest first. The Announcements page lists every
 * entry; the home page shows the latest.
 *
 * Write for a student skimming on a phone: a title of a few words, one short
 * sentence per item, plain punctuation (no em dashes), and only the changes
 * they will notice. Use the site's own names for things (Planner, Academic
 * History, Easy GEs). Date an entry by the day it went live in San Diego, the
 * way every other date on the site is read.
 *
 * To announce an update, add an entry at the top. src/lib/announcements.test.ts
 * checks the order, the dates and ids, the punctuation, and that every link
 * opens without a sign-in.
 */

export interface AnnouncementItem {
  /** The change in a few words: "Finals match your lecture". */
  title: string;
  /** One short sentence on what a student will notice. */
  text: string;
  /** Where to see it: a public page on this site. */
  link?: { href: string; label: string };
}

export interface AnnouncementGroup {
  /** "Course pages", "Finding courses"… */
  label: string;
  items: AnnouncementItem[];
}

export interface Announcement {
  /** The entry's anchor on the Announcements page: its date, then a slug. */
  id: string;
  /** The day it went live, in San Diego: YYYY-MM-DD. */
  date: string;
  title: string;
  /** The update in one sentence; the home page shows it under the title. */
  summary: string;
  groups: AnnouncementGroup[];
}

export const ANNOUNCEMENTS: readonly Announcement[] = [
  {
    id: "2026-10-21-plan-with-ai",
    date: "2026-10-21",
    title: "Plan with AI, in the Planner",
    summary: "Describe the quarter you want, and Plan with AI builds it from real sections next to your plan.",
    groups: [
      {
        label: "Plan with AI",
        items: [
          {
            title: "Build a quarter",
            text: "Get up to three drafts that fit your units, times and days, with finals checked.",
          },
          {
            title: "Change your plan in words",
            text: "Type “add CSE 11” or “undo” and your plan updates.",
          },
          {
            title: "See what a move changes",
            text: "Ask what happens if you move a course, and see which planned courses list it as a prerequisite.",
          },
          {
            title: "Your 4-year plan too",
            text: "Pick any quarter of your 4-year plan and fill it with courses.",
          },
        ],
      },
      {
        label: "Finding courses",
        items: [
          {
            title: "Requirements, not keywords",
            text: "Warren PofC and Area Study, college GEs and DEI are read as requirements.",
            link: { href: "/discover", label: "Open Find courses" },
          },
          {
            title: "Every check is labeled",
            text: "Each draft says what was checked against UCSD’s data and what wasn’t.",
          },
        ],
      },
      {
        label: "Your data",
        items: [
          {
            title: "What goes to Google",
            text: "Only requests the Planner can’t read go to Google’s Gemini, never your plan or Academic History.",
          },
        ],
      },
    ],
  },
  {
    id: "2026-10-13-course-pages",
    date: "2026-10-13",
    title: "Finals that match your lecture, and dated seat counts",
    summary: "Course pages now follow the sections you pick, and every seat count shows when it was taken.",
    groups: [
      {
        label: "Course pages",
        items: [
          {
            title: "Finals match your lecture",
            text: "Pick a lecture to see its own final exam.",
            link: { href: "/course/BILD/4", label: "See BILD 4" },
          },
          {
            title: "Seat counts show a date",
            text: "Each section shows when its seats were counted. Check TSS (Triton Student System) for live numbers.",
          },
          {
            title: "Send your picks to the Planner",
            text: "Add your lecture and lab to the Planner, or open them in TSS.",
          },
          {
            title: "Clearer grade labels",
            text: "Grades show the historical average, not a prediction.",
          },
        ],
      },
      {
        label: "Finding courses",
        items: [
          {
            title: "Easy GEs remembers your college",
            text: "Your choices stay when you reload or share the link.",
            link: { href: "/ge", label: "Open Easy GEs" },
          },
          {
            title: "Search comes first",
            text: "Search is now at the top of the home page.",
          },
        ],
      },
      {
        label: "Easier to use",
        items: [
          {
            title: "Keyboard-friendly search",
            text: "Use the arrow keys and Enter to pick a result.",
          },
          {
            title: "Easier-to-read text",
            text: "Small text has more contrast in light and dark mode.",
          },
          {
            title: "Clearer sign-in",
            text: "The sign-in page says what it’s for and lets you go back.",
          },
        ],
      },
    ],
  },
];
