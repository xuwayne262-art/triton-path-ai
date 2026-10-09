/**
 * The week as a calendar file (.ics), so a schedule can live in Google
 * Calendar, Apple Calendar or Outlook instead of only in a picture.
 *
 * Each meeting pattern becomes one weekly event from its first class to the
 * last day of instruction, skipping campus holidays; each final is a single
 * event. Times are San Diego's, stated with their time zone, so a phone set
 * to another zone still shows 9:30 lecture at 9:30 in San Diego.
 *
 * No sign-in to anyone's calendar and nothing sent anywhere: the file is made
 * in the browser and imported by the student.
 */

import { DAYS, END, START, TYPE, sectionWhere, typeLabel, type CalEvent } from "./sections";
import { timeToMinutes, type SectionTuple } from "./plat";
import type { DayOfWeek } from "@/components/triton/types";

export interface IcsQuarter {
  /** "FA26" */
  key: string;
  /** "Fall 2026" */
  name: string;
  /** First day of instruction, YYYY-MM-DD. */
  classes: string;
  /** Last day of instruction, YYYY-MM-DD. */
  lastClass: string;
  holidays: string[];
}

export interface IcsExam {
  code: string;
  title: string;
  row: SectionTuple;
}

const TZ = "America/Los_Angeles";

/** The zone's rules, so every calendar reads the times as San Diego's. */
const VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  `TZID:${TZ}`,
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:-0800",
  "TZOFFSETTO:-0700",
  "TZNAME:PDT",
  "DTSTART:19700308T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:-0700",
  "TZOFFSETTO:-0800",
  "TZNAME:PST",
  "DTSTART:19701101T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

const WEEKDAY: Record<DayOfWeek, { rrule: string; js: number }> = {
  Mon: { rrule: "MO", js: 1 },
  Tue: { rrule: "TU", js: 2 },
  Wed: { rrule: "WE", js: 3 },
  Thu: { rrule: "TH", js: 4 },
  Fri: { rrule: "FR", js: 5 },
};

/** Text values escape backslash, semicolon, comma and newline (RFC 5545 §3.3.11). */
export const escapeText = (s: string) =>
  s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Lines longer than 75 octets continue on the next line after a space. */
export function foldLine(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let current = "";
  let size = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (size + n > (out.length ? 74 : 75)) {
      out.push(current);
      current = "";
      size = 0;
    }
    current += ch;
    size += n;
  }
  out.push(current);
  return out.join("\r\n ");
}

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (iso: string) => iso.replace(/-/g, "");
const hm = (min: number) => `${pad(Math.floor(min / 60))}${pad(min % 60)}00`;

/** "2026-09-24" + one day. Read as a date, so no zone can shift it. */
function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
const weekdayOf = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay();

/** The first date on or after `from` that falls on one of `days`. */
function firstMeeting(from: string, days: number[]): string {
  let d = from;
  for (let i = 0; i < 7 && !days.includes(weekdayOf(d)); i++) d = addDays(d, 1);
  return d;
}

/** The instant a San Diego wall-clock time happens, as UTC "YYYYMMDDTHHMMSSZ". */
function utcStamp(iso: string, min: number): string {
  // San Diego is UTC−7 in summer and UTC−8 in winter; try both and keep the
  // one that reads back as the wall-clock time asked for.
  for (const offset of [7, 8]) {
    const t = new Date(`${iso}T${pad(Math.floor(min / 60))}:${pad(min % 60)}:00Z`);
    t.setUTCHours(t.getUTCHours() + offset);
    const local = new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
    }).format(t).replace(",", "");
    if (local === `${iso} ${pad(Math.floor(min / 60))}:${pad(min % 60)}`) {
      return t.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    }
  }
  return `${ymd(iso)}T${hm(min)}Z`;
}

interface Pattern {
  code: string;
  title: string;
  label: string;
  where: string;
  instructor: string;
  startMin: number;
  endMin: number;
  days: Set<DayOfWeek>;
}

/**
 * The file's text. `events` are the committed weekly meetings (options and
 * previews are left out); `exams` are one-off meetings such as finals.
 */
export function buildIcs({
  quarter, events, exams, now = new Date(),
}: {
  quarter: IcsQuarter;
  events: CalEvent[];
  exams: IcsExam[];
  now?: Date;
}): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//UCSDPlans//Planner//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(`${quarter.name} classes`)}`,
    `X-WR-TIMEZONE:${TZ}`,
    ...VTIMEZONE,
  ];

  // One event per meeting pattern: a MWF lecture is one event, not three.
  const patterns = new Map<string, Pattern>();
  for (const e of events) {
    if (e.ghost) continue;
    const label = `${e.code} ${e.kindLabel}${e.sectionCode ? ` ${e.sectionCode}` : ""}`;
    const key = [label, e.startMin, e.endMin, e.where].join("|");
    const p = patterns.get(key) ?? {
      code: e.code, title: e.title, label, where: e.where, instructor: e.instructor,
      startMin: e.startMin, endMin: e.endMin, days: new Set<DayOfWeek>(),
    };
    p.days.add(e.day);
    patterns.set(key, p);
  }

  const until = utcStamp(quarter.lastClass, 23 * 60 + 59);
  for (const [key, p] of patterns) {
    const days = [...p.days].filter((d) => WEEKDAY[d]);
    if (!days.length) continue;
    const first = firstMeeting(quarter.classes, days.map((d) => WEEKDAY[d].js));
    if (first > quarter.lastClass) continue;
    const skipped = quarter.holidays.filter(
      (h) => h >= first && h <= quarter.lastClass && days.some((d) => WEEKDAY[d].js === weekdayOf(h)),
    );
    lines.push(
      "BEGIN:VEVENT",
      `UID:${escapeText(`${quarter.key}-${key}`.replace(/[^A-Za-z0-9|.-]/g, "_"))}@ucsdplans.com`,
      `DTSTAMP:${stamp}`,
      `DTSTART;TZID=${TZ}:${ymd(first)}T${hm(p.startMin)}`,
      `DTEND;TZID=${TZ}:${ymd(first)}T${hm(p.endMin)}`,
      `RRULE:FREQ=WEEKLY;BYDAY=${days.map((d) => WEEKDAY[d].rrule).join(",")};UNTIL=${until}`,
      ...(skipped.length ? [`EXDATE;TZID=${TZ}:${skipped.map((h) => `${ymd(h)}T${hm(p.startMin)}`).join(",")}`] : []),
      `SUMMARY:${escapeText(p.label)}`,
      ...(p.where ? [`LOCATION:${escapeText(p.where)}`] : []),
      `DESCRIPTION:${escapeText([p.title, p.instructor].filter(Boolean).join(" — "))}`,
      "END:VEVENT",
    );
  }

  for (const { code, title, row } of exams) {
    const date = row[DAYS];
    const start = timeToMinutes(row[START]);
    const end = timeToMinutes(row[END]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "") || start == null || end == null) continue;
    const label = `${code} ${typeLabel(row[TYPE])}`;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${escapeText(`${quarter.key}-${code}-${row[TYPE]}-${date}-${start}`.replace(/[^A-Za-z0-9.-]/g, "_"))}@ucsdplans.com`,
      `DTSTAMP:${stamp}`,
      `DTSTART;TZID=${TZ}:${ymd(date)}T${hm(start)}`,
      `DTEND;TZID=${TZ}:${ymd(date)}T${hm(end)}`,
      `SUMMARY:${escapeText(label)}`,
      ...(sectionWhere(row) ? [`LOCATION:${escapeText(sectionWhere(row))}`] : []),
      `DESCRIPTION:${escapeText(title)}`,
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

/** "ucsdplans-fall-2026.ics" */
export const icsFileName = (termName: string) =>
  `ucsdplans-${termName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.ics`;
