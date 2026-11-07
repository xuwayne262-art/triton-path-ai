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
    id: "2026-11-07-each-quarter",
    date: "2026-11-07",
    title: "Each quarter, its own page",
    summary: "The home page now leads with the quarter you pick, and Winter dates show what is next for you.",
    groups: [
      {
        label: "Home",
        items: [
          {
            title: "Plan Winter 2027",
            text: "Pick Winter and the home page shows its dates and a button into your Winter planner.",
            link: { href: "/?term=WI27", label: "Open Winter on the home page" },
          },
          {
            title: "Fall stays one click away",
            text: "Pick Fall to see this week of the quarter and your Fall schedule.",
          },
        ],
      },
      {
        label: "Winter dates",
        items: [
          {
            title: "Dates for you",
            text: "Show dates for all students, undergraduates or graduate students, grouped by day.",
          },
          {
            title: "Fees due Dec 18",
            text: "UCSD’s fee pages list Dec 18 for Winter registration fees, so it is on the calendar now.",
          },
        ],
      },
      {
        label: "Fixes",
        items: [
          {
            title: "Links keep your quarter",
            text: "A Fall link stays on Fall through the menu, the Planner and search.",
          },
          {
            title: "Clear errors",
            text: "If a quarter fails to load, the page says so and offers a retry instead of showing the other quarter.",
          },
        ],
      },
    ],
  },
  {
    id: "2026-11-06-winter-2027",
    date: "2026-11-06",
    title: "Winter 2027 is here",
    summary: "Switch between Fall 2026 and Winter 2027 anywhere on the site, and plan each quarter on its own.",
    groups: [
      {
        label: "Winter 2027",
        items: [
          {
            title: "Pick a quarter",
            text: "Choose Fall 2026 or Winter 2027 on search, course pages, Easy GEs and the Planner.",
            link: { href: "/courses?term=WI27", label: "Browse Winter courses" },
          },
          {
            title: "Winter sections and seats",
            text: "Every Winter course shows its sections, instructors, seats and waitlists from UCSD’s public schedule.",
            link: { href: "/course/ECON/110B?term=WI27", label: "See ECON 110B in Winter" },
          },
          {
            title: "Winter dates",
            text: "The home page shows when Winter enrollment opens, with the next date first.",
          },
          {
            title: "No Winter rooms yet",
            text: "UCSD hasn’t posted Winter rooms, so Winter has no map or walking times for now.",
          },
        ],
      },
      {
        label: "Planner",
        items: [
          {
            title: "One schedule per quarter",
            text: "Your Fall and Winter courses are kept apart, and switching quarters never moves them.",
          },
          {
            title: "Plan with AI does Winter",
            text: "Choose Winter 2027 in Plan with AI to build a Winter schedule from real sections.",
          },
        ],
      },
    ],
  },
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
