/**
 * What changed on UCSDPlans, newest first. The Announcements page lists every
 * entry; the home page shows the latest.
 *
 * Each entry is written for students, not developers: what they will notice
 * and where to see it, in the site's own words for things (Planner, Academic
 * History, "Easy GEs"). It is dated by the day it went live in San Diego, the
 * way every other date on the site is read.
 *
 * To announce an update, add an entry at the top. src/lib/announcements.test.ts
 * checks the order, the dates and ids, and that every link opens without a
 * sign-in.
 */

export interface AnnouncementItem {
  /** The change in a few words: "Finals follow the lecture you pick". */
  title: string;
  /** One or two sentences on what a student will notice. */
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
  /** The whole update in a sentence or two; the home page shows it under the title. */
  summary: string;
  groups: AnnouncementGroup[];
}

export const ANNOUNCEMENTS: readonly Announcement[] = [
  {
    id: "2026-10-13-course-pages",
    date: "2026-10-13",
    title: "Finals that match your lecture, and seat counts with dates",
    summary:
      "Course pages now follow the sections you pick, every seat count says when it was taken, and the GE lists, search and sign-in are easier to use.",
    groups: [
      {
        label: "Course pages",
        items: [
          {
            title: "Finals follow the lecture you pick",
            text: "When a course’s lectures have different finals, each lecture lists its own, and the summary shows the final for the lecture you choose. Until you choose, it says the final varies.",
            link: { href: "/course/BILD/4", label: "See BILD 4" },
          },
          {
            title: "Your choice carries through",
            text: "Pick a lecture and a lab, and one button adds that exact pair to your Planner while another opens it in TSS (Triton Student System). Adding a course to UCSDPlans never enrolls you.",
          },
          {
            title: "Seat counts say when they were counted",
            text: "UCSD’s Class Planner recounts each section on its own schedule, sometimes weeks apart, so every section now shows the day its seats were counted. A count more than a day old is marked “old”; check TSS for the live number before you enroll.",
            link: { href: "/about#seats", label: "How fresh the seat counts are" },
          },
          {
            title: "Grades and ratings say what they are",
            text: "The letter badge is now labelled “Historical average”, with its GPA. Each instructor shows their own history in the course and its latest term, and RateMyProfessors rating and difficulty are marked as scores across all their courses. The “light” and “heavy load” labels are gone.",
            link: { href: "/about#letter", label: "How the letter grade works" },
          },
          {
            title: "The decision comes first",
            text: "Prerequisites, instructors and sections now lead the page, ahead of the description, “Leads to” and the grade history. Instructor names open their profile pages.",
          },
        ],
      },
      {
        label: "Finding courses",
        items: [
          {
            title: "Easy GEs remembers your college",
            text: "Choose your college once. Your college, areas and filters stay in the page’s link, so reloading or sharing it keeps them. The page also says up front that the college GE lists are community-compiled, and links to your college’s own requirements.",
            link: { href: "/ge", label: "Open Easy GEs" },
          },
          {
            title: "Search comes first",
            text: "The home page opens with the search, and the quarter clock is now a compact strip under it.",
          },
          {
            title: "Course lists keep their filters",
            text: "A department’s course list keeps its filters and sort in the link, so going Back or sharing it returns to the same list.",
          },
          {
            title: "A clearer “highest averages” list",
            text: "The home page’s list of courses with the highest historical averages now says how its courses are chosen, and leaves out college core sequences and honors, thesis and research courses.",
          },
        ],
      },
      {
        label: "Planner and Housing",
        items: [
          {
            title: "Completed and planned, told apart",
            text: "Requirement progress in the 4-year plan now shows the courses you’ve completed on your Academic History separately from the ones you’ve only planned.",
          },
          {
            title: "Housing says what sign-in checks",
            text: "Listings say they were posted by someone signed in with @ucsd.edu, which is all that sign-in confirms, and trip times read as estimates.",
          },
        ],
      },
      {
        label: "Easier to use",
        items: [
          {
            title: "Search works without a mouse",
            text: "Search results can be browsed with the arrow keys and opened with Enter, and screen readers announce them.",
          },
          {
            title: "Small text is easier to read",
            text: "Dates, counts and notes have more contrast, in both light and dark mode.",
          },
          {
            title: "A clearer sign-in",
            text: "The sign-in page says what you’re signing in for, explains the @ucsd.edu rule before you reach Google, and always offers a way back to browsing.",
          },
        ],
      },
    ],
  },
];
