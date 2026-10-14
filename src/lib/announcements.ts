import { ANNOUNCEMENTS, type Announcement } from "@/data/announcements";
import { isPublicPath } from "@/lib/auth/routes";

/** How long the home page marks the latest announcement "New". */
export const NEW_FOR_DAYS = 14;

/** The newest announcement, or null before there are any. */
export function latestAnnouncement(list: readonly Announcement[] = ANNOUNCEMENTS): Announcement | null {
  return list[0] ?? null;
}

/** Where an announcement lives on the Announcements page. */
export const announcementHref = (a: Announcement) => `/announcements#${a.id}`;

/**
 * Whether an announcement is still new at `now` (ms). The date is the San
 * Diego day it went live, read as noon UTC, so no time zone moves it a day.
 */
export function isNewAnnouncement(a: Announcement, now: number, days = NEW_FOR_DAYS): boolean {
  const at = Date.parse(`${a.date}T12:00:00Z`);
  return Number.isFinite(at) && now >= at - 86_400_000 && now - at < days * 86_400_000;
}

const ID = /^(\d{4}-\d{2}-\d{2})-[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** A real calendar day written YYYY-MM-DD: "2026-02-30" is not one. */
function isCalendarDay(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

/**
 * Everything wrong with a list of announcements, in plain words; empty when
 * it is fine. Newest first, real dates, one id each starting with its date,
 * nothing left blank, and every link a page on this site that opens without
 * a sign-in — the Announcements page is public, so a link into the Planner
 * would greet a visitor with a login screen.
 */
export function announcementProblems(list: readonly Announcement[]): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  list.forEach((a, i) => {
    const where = a.id || `entry ${i + 1}`;
    if (!isCalendarDay(a.date)) problems.push(`${where}: date "${a.date}" is not a YYYY-MM-DD day`);
    const id = ID.exec(a.id);
    if (!id) problems.push(`${where}: id should be its date and a lowercase slug, like "2026-10-13-course-pages"`);
    else if (id[1] !== a.date) problems.push(`${where}: id starts with ${id[1]} but the date is ${a.date}`);
    if (ids.has(a.id)) problems.push(`${where}: id is used twice`);
    ids.add(a.id);
    if (i > 0 && a.date > list[i - 1].date) problems.push(`${where}: newer than the entry above it; newest goes first`);
    if (!a.title.trim()) problems.push(`${where}: no title`);
    if (!a.summary.trim()) problems.push(`${where}: no summary`);
    if (!a.groups.length) problems.push(`${where}: no changes listed`);
    for (const g of a.groups) {
      if (!g.label.trim()) problems.push(`${where}: a group has no label`);
      if (!g.items.length) problems.push(`${where}: "${g.label}" lists nothing`);
      for (const it of g.items) {
        if (!it.title.trim() || !it.text.trim()) problems.push(`${where}: an item in "${g.label}" is blank`);
        if (it.link) {
          const { href, label } = it.link;
          const path = href.split(/[?#]/)[0];
          if (!href.startsWith("/") || href.startsWith("//")) problems.push(`${where}: "${label}" should link inside the site, not to ${href}`);
          else if (!isPublicPath(path)) problems.push(`${where}: "${label}" links to ${path}, which asks visitors to sign in`);
          if (!label.trim()) problems.push(`${where}: a link to ${href} has no label`);
        }
      }
    }
  });
  return problems;
}
