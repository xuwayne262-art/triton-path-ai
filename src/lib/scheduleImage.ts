/**
 * The week as a picture — one PNG a student can keep on their phone.
 *
 * The calendar on screen is built for choosing: on a phone it shrinks to five
 * columns of course codes, and on a laptop it scrolls and shares the width
 * with the rail and the map. Neither is something to glance at on the way to
 * class. This draws the whole committed week at a fixed, readable size —
 * every class with its time and room, the courses it came from, and the
 * finals — straight onto a canvas, so it looks the same on every device.
 *
 * Drawn from the schedule data rather than screenshotted from the page: a DOM
 * capture would inherit whatever the viewport happened to cut off, which is
 * the problem this exists to solve.
 */

import {
  CODE, END, INSTRUCTOR, START, DAYS as DATE, TYPE,
  compactRange, dayWindow, findFamily, groupSections, layoutDay, minutesToClock,
  minutesToLabel, missingParts, oneOffLabel, sectionWhere, typeLabel,
  type CalEvent, type SectionSelection,
} from "./sections";
import { dayLabel, timeToMinutes, type SectionTuple } from "./plat";
import { ROLE_STYLES, type CourseRole } from "./plannerBridge";
import type { DayOfWeek } from "@/components/triton/types";

// ── What goes in ─────────────────────────────────────────────────────────────

export interface ImageCourse {
  code: string;
  title: string;
  units: number;
  role: CourseRole;
  /** "Lecture A00 · Discussion A01", or "" when nothing is chosen. */
  sections: string;
  instructor: string;
  /** Why the course is not (all) on the grid — "Discussion not picked yet" — or "". */
  note: string;
}

export interface ImageExam {
  /** "Mon, Dec 7" */
  date: string;
  /** "8:00–10:59a" */
  time: string;
  /** "CSE 12 Final Exam" */
  label: string;
  where: string;
  role: CourseRole;
  /** Another course's exam overlaps it. */
  clash: boolean;
}

export interface ScheduleImageInput {
  /** "Fall 2026" */
  termName: string;
  /** The committed weekly meetings — never options or previews. */
  events: CalEvent[];
  courses: ImageCourse[];
  exams: ImageExam[];
}

/** One course on the schedule, as the planner holds it. */
export interface CourseSource {
  code: string;
  title: string;
  units: number;
  role: CourseRole;
  /** This term's instructor from the catalog index, when the sections do not name one. */
  instructor: string | null;
  sec: SectionTuple[] | undefined;
  selection: SectionSelection | undefined;
}

const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/**
 * Everything the picture says, worked out from the planner's own state. Each
 * course the grid cannot show in full says why, so the picture never reads as
 * a complete week when it is not one.
 */
export function scheduleImageInput(args: {
  termName: string;
  courses: CourseSource[];
  events: CalEvent[];
  exams: { code: string; role: CourseRole; row: SectionTuple }[];
  /** "2026-09-29": one-off dates before it are over, and left out of a picture kept for later. */
  today?: string;
}): ScheduleImageInput {
  const onGrid = new Set(args.events.filter((e) => !e.ghost).map((e) => e.code));

  const courses = args.courses.map((c): ImageCourse => {
    const families = c.sec?.length ? groupSections(c.sec) : [];
    const family = findFamily(families, c.selection?.family);
    const bits: string[] = [];
    if (family?.lecture) bits.push(`${typeLabel(family.lecture[TYPE])} ${family.lecture[CODE]}`);
    for (const p of family?.parts ?? []) {
      const picked = c.selection?.parts[p.type];
      if (picked) bits.push(`${p.label} ${picked}`);
    }

    let note = "";
    if (!families.length) {
      note = onGrid.has(c.code) ? "Catalog time — sections not published" : "No sections published this term";
    } else if (!family) {
      note = "Section not picked yet";
    } else {
      const missing = missingParts(families, c.selection);
      if (missing.length) note = `${capitalize(missing.join(" and "))} not picked yet`;
      else if (!onGrid.has(c.code)) note = "Time TBA";
    }

    return {
      code: c.code,
      title: c.title,
      units: c.units,
      role: c.role,
      sections: bits.join(" · "),
      instructor: (family?.lecture?.[INSTRUCTOR] || c.instructor || "").trim(),
      note,
    };
  });

  const minutes = (r: SectionTuple) => [timeToMinutes(r[START]), timeToMinutes(r[END])] as const;
  const exams = args.exams
    .filter((x) => !args.today || x.row[DATE] >= args.today)
    .sort((a, b) => (a.row[DATE] + String(minutes(a.row)[0] ?? 0).padStart(4, "0"))
      .localeCompare(b.row[DATE] + String(minutes(b.row)[0] ?? 0).padStart(4, "0")))
    .map((x, _, all): ImageExam => {
      const [s, e] = minutes(x.row);
      const clash = s != null && e != null && all.some((y) => {
        if (y === x || y.code === x.code || y.row[DATE] !== x.row[DATE]) return false;
        const [ys, ye] = minutes(y.row);
        return ys != null && ye != null && s < ye && ys < e;
      });
      return {
        date: dayLabel(x.row[DATE]),
        time: compactRange(x.row[START], x.row[END]),
        label: `${x.code} ${oneOffLabel(x.row)}`,
        where: sectionWhere(x.row) || "Room TBA",
        role: x.role,
        clash,
      };
    });

  return {
    termName: args.termName || "This term",
    events: args.events.filter((e) => !e.ghost),
    courses,
    exams,
  };
}

/** "ucsdplans-fall-2026-schedule.png" */
export function imageFileName(termName: string): string {
  const slug = termName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `ucsdplans-${slug || "term"}-schedule.png`;
}

// ── Layout ───────────────────────────────────────────────────────────────────

/** CSS pixels; the canvas is drawn at twice this for a sharp picture on a phone. */
export const IMAGE_WIDTH = 1200;
export const IMAGE_HOUR_PX = 64;
const PAD = 40;
const TOP_BAR = 6;
const HEADER_H = 72;
const GUTTER = 58;
const DAY_HEAD = 34;
const LEGEND_H = 22;
const SECTION_HEAD = 30;
const COURSE_ROW = 44;
const EXAM_ROW = 22;
const FOOTER_H = 22;
const COLUMN_GAP = 28;

const WEEK: DayOfWeek[] = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const DAY_NAMES: Record<DayOfWeek, string> = {
  Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday",
};

export interface ImageLayout {
  width: number;
  height: number;
  grid: {
    x: number;
    y: number;
    w: number;
    /** Body height, below the day header. */
    h: number;
    colW: number;
    startMin: number;
    endMin: number;
  };
  legendY: number;
  coursesY: number;
  examsY: number | null;
  footerY: number;
}

/** Where everything goes, and so how tall the picture is. */
export function layoutImage(input: ScheduleImageInput): ImageLayout {
  const { startMin, endMin } = dayWindow(input.events);
  const hours = (endMin - startMin) / 60;
  const gridY = TOP_BAR + HEADER_H + 18;
  const gridH = hours * IMAGE_HOUR_PX;
  const gridW = IMAGE_WIDTH - 2 * PAD;

  const legendY = gridY + DAY_HEAD + gridH + 14;
  const coursesY = legendY + LEGEND_H + 22;
  const courseRows = Math.ceil(input.courses.length / 2);
  let y = coursesY + SECTION_HEAD + courseRows * COURSE_ROW;

  let examsY: number | null = null;
  if (input.exams.length) {
    examsY = y + 14;
    y = examsY + SECTION_HEAD + Math.ceil(input.exams.length / 2) * EXAM_ROW;
  }

  const footerY = y + 20;
  return {
    width: IMAGE_WIDTH,
    height: footerY + FOOTER_H + 22,
    grid: {
      x: PAD,
      y: gridY,
      w: gridW,
      h: gridH,
      colW: (gridW - GUTTER) / WEEK.length,
      startMin,
      endMin,
    },
    legendY,
    coursesY,
    examsY,
    footerY,
  };
}

export interface BlockLine {
  text: string;
  bold: boolean;
}

/** The code's line box, then each further line's, in CSS pixels. */
const CODE_LINE = 16;
const TEXT_LINE = 14;
/** Top padding plus the code line, and room under the last line for its descenders. */
const FIRST_LINE_ROOM = 21;

/**
 * The lines a block of this height has room for. A class needs its code
 * first, then the room to walk to, then its exact times — the grid only
 * places it to the hour — then which section it is. They are chosen in that
 * order of need and shown in reading order. A 50-minute class has room for
 * three lines, an 80-minute one for all four.
 */
export function blockLines(e: CalEvent, heightPx: number): BlockLine[] {
  const where = e.where || "Room TBA";
  const time = compactRange(minutesToClock(e.startMin), minutesToClock(e.endMin));
  const kind = e.sectionCode ? `${e.kindLabel} ${e.sectionCode}` : e.kindLabel;

  let budget = heightPx - FIRST_LINE_ROOM;
  const take = new Set<string>();
  for (const line of ["where", "time", "kind"]) {
    if (budget < TEXT_LINE) break;
    take.add(line);
    budget -= TEXT_LINE;
  }

  const out: BlockLine[] = [{ text: e.code, bold: true }];
  if (take.has("kind")) out.push({ text: kind, bold: false });
  if (take.has("time")) out.push({ text: time, bold: false });
  if (take.has("where")) out.push({ text: where, bold: false });
  return out;
}

// ── Painting ─────────────────────────────────────────────────────────────────

const NAVY = "#182B49";
const GOLD = "#FFCD00";
const INK = "#0f172a";
const TEXT = "#334155";
const MUTED = "#64748b";
const FAINT = "#94a3b8";
const LINE = "#e2e8f0";
const HOUR_LINE = "#eef2f6";
const RED = "#dc2626";
const AMBER = "#b45309";

/** Text on a lecture block, dark enough to read on its role's tint. */
const ROLE_INK: Record<CourseRole, string> = {
  major: "#1e3a8a",
  minor: "#134e4a",
  ge: "#78350f",
  elective: "#334155",
};

const isLecture = (kind: string) => kind === "LE" || kind === "SE";

/**
 * Where item `i` of `n` sits in a two-column list: down the left column
 * first, so a list in date order still reads in date order.
 */
export function cell(i: number, n: number): { col: number; row: number } {
  const rows = Math.ceil(n / 2);
  return { col: Math.floor(i / rows), row: i % rows };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** The text, cut with an ellipsis to fit `max` pixels in the current font. */
function fit(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (max <= 0) return "";
  if (ctx.measureText(text).width <= max) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(`${text.slice(0, mid).trimEnd()}…`).width <= max) lo = mid;
    else hi = mid - 1;
  }
  return lo ? `${text.slice(0, lo).trimEnd()}…` : "";
}

/**
 * Draws the picture onto a context already scaled to CSS pixels. `font` is a
 * CSS font-family list — the page's own Geist, which is loaded by the time
 * anyone can press the button.
 */
export function paintSchedule(
  ctx: CanvasRenderingContext2D,
  input: ScheduleImageInput,
  layout: ImageLayout,
  font: string,
): void {
  const f = (weight: number, size: number) => `${weight} ${size}px ${font}`;
  const { width, height, grid } = layout;
  const units = input.courses.reduce((n, c) => n + c.units, 0);
  const clashing = new Set(input.events.filter((e) => e.conflict).map((e) => e.code));

  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  // The site's navy–gold rule, across the top.
  const bar = ctx.createLinearGradient(0, 0, width, 0);
  bar.addColorStop(0, NAVY);
  bar.addColorStop(0.5, GOLD);
  bar.addColorStop(1, NAVY);
  ctx.fillStyle = bar;
  ctx.fillRect(0, 0, width, TOP_BAR);

  // ── Header ──
  ctx.textAlign = "left";
  ctx.fillStyle = NAVY;
  ctx.font = f(800, 28);
  ctx.fillText(`${input.termName} schedule`, PAD, TOP_BAR + 42);
  ctx.font = f(500, 15);
  const summary = `${input.courses.length} ${input.courses.length === 1 ? "course" : "courses"} · ${units} units`;
  ctx.fillStyle = MUTED;
  ctx.fillText(summary, PAD, TOP_BAR + 66);
  if (clashing.size) {
    const x = PAD + ctx.measureText(summary).width;
    ctx.fillStyle = RED;
    ctx.font = f(700, 15);
    ctx.fillText(` · ${clashing.size} clashing`, x, TOP_BAR + 66);
  }

  ctx.textAlign = "right";
  ctx.fillStyle = NAVY;
  ctx.font = f(800, 20);
  ctx.fillText("UCSDPlans", width - PAD, TOP_BAR + 40);
  ctx.fillStyle = FAINT;
  ctx.font = f(500, 13);
  ctx.fillText("ucsdplans.com", width - PAD, TOP_BAR + 60);

  // ── Grid frame ──
  const bodyY = grid.y + DAY_HEAD;
  const colX = (i: number) => grid.x + GUTTER + i * grid.colW;

  ctx.save();
  roundRect(ctx, grid.x, grid.y, grid.w, DAY_HEAD + grid.h, 14);
  ctx.clip();
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(grid.x, grid.y, grid.w, DAY_HEAD);

  // Hour lines and labels.
  ctx.textAlign = "right";
  ctx.font = f(500, 12);
  for (let m = grid.startMin; m < grid.endMin; m += 60) {
    const y = bodyY + ((m - grid.startMin) / 60) * IMAGE_HOUR_PX;
    ctx.fillStyle = HOUR_LINE;
    ctx.fillRect(grid.x + GUTTER, y, grid.w - GUTTER, 1);
    // Half-hour ticks help read a 9:30 start at a glance.
    ctx.fillStyle = "#f5f7fa";
    ctx.fillRect(grid.x + GUTTER, y + IMAGE_HOUR_PX / 2, grid.w - GUTTER, 1);
    ctx.fillStyle = MUTED;
    ctx.fillText(minutesToLabel(m), grid.x + GUTTER - 9, y + 15);
  }

  // Day columns.
  ctx.textAlign = "center";
  ctx.font = f(700, 14);
  WEEK.forEach((day, i) => {
    ctx.fillStyle = TEXT;
    ctx.fillText(DAY_NAMES[day], colX(i) + grid.colW / 2, grid.y + 22);
    ctx.fillStyle = LINE;
    ctx.fillRect(colX(i), grid.y, 1, DAY_HEAD + grid.h);
  });
  ctx.fillStyle = LINE;
  ctx.fillRect(grid.x, bodyY, grid.w, 1);

  // ── Classes ──
  const pxPerMin = IMAGE_HOUR_PX / 60;
  WEEK.forEach((day, i) => {
    for (const e of layoutDay(input.events.filter((ev) => ev.day === day))) {
      const laneW = grid.colW / e.lanes;
      const x = colX(i) + e.lane * laneW + 4;
      const w = laneW - 7;
      const y = bodyY + (e.startMin - grid.startMin) * pxPerMin + 2;
      const h = Math.max((e.endMin - e.startMin) * pxPerMin - 3, 20);
      const hex = ROLE_STYLES[e.role].hex;
      const lecture = isLecture(e.kind);

      ctx.save();
      roundRect(ctx, x, y, w, h, 7);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      // Lectures are the solid commitment; discussions and labs hang off them,
      // lighter and with a dashed edge, exactly as on the calendar.
      ctx.fillStyle = `${hex}${lecture ? "33" : "14"}`;
      ctx.fill();
      ctx.clip();
      if (lecture) {
        ctx.fillStyle = hex;
        ctx.fillRect(x, y, 4, h);
      } else {
        ctx.strokeStyle = hex;
        ctx.lineWidth = 4;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(x + 2, y);
        ctx.lineTo(x + 2, y + h);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore();

      if (e.conflict) {
        ctx.strokeStyle = RED;
        ctx.lineWidth = 2.5;
        roundRect(ctx, x, y, w, h, 7);
        ctx.stroke();
      }

      ctx.textAlign = "left";
      let ty = y + 5;
      for (const line of blockLines(e, h)) {
        const size = line.bold ? 13 : 11.5;
        ty += line.bold ? CODE_LINE : TEXT_LINE;
        ctx.font = f(line.bold ? 800 : 500, size);
        ctx.fillStyle = line.bold ? (lecture ? ROLE_INK[e.role] : INK) : TEXT;
        ctx.fillText(fit(ctx, line.text, w - 16), x + 10, ty - 4);
      }
    }
  });
  ctx.restore();

  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1;
  roundRect(ctx, grid.x + 0.5, grid.y + 0.5, grid.w - 1, DAY_HEAD + grid.h - 1, 14);
  ctx.stroke();

  // ── Legend ──
  const roles = (["major", "ge", "minor", "elective"] as CourseRole[])
    .filter((r) => input.courses.some((c) => c.role === r) || input.events.some((e) => e.role === r));
  let lx = grid.x;
  const ly = layout.legendY + 14;
  ctx.textAlign = "left";
  ctx.font = f(500, 12.5);
  for (const r of roles) {
    ctx.fillStyle = ROLE_STYLES[r].hex;
    roundRect(ctx, lx, ly - 10, 11, 11, 3);
    ctx.fill();
    ctx.fillStyle = MUTED;
    ctx.fillText(ROLE_STYLES[r].label, lx + 17, ly);
    lx += 17 + ctx.measureText(ROLE_STYLES[r].label).width + 22;
  }
  ctx.fillStyle = FAINT;
  ctx.fillText(
    `Solid edge = lecture · dashed = discussion or lab${clashing.size ? " · red outline = time conflict" : ""}`,
    lx + 4,
    ly,
  );

  // ── Courses ──
  const colW = (grid.w - COLUMN_GAP) / 2;
  ctx.fillStyle = NAVY;
  ctx.font = f(800, 16);
  ctx.fillText("Courses", grid.x, layout.coursesY + 18);
  input.courses.forEach((c, i) => {
    const at = cell(i, input.courses.length);
    const x = grid.x + at.col * (colW + COLUMN_GAP);
    const y = layout.coursesY + SECTION_HEAD + at.row * COURSE_ROW;

    ctx.fillStyle = ROLE_STYLES[c.role].hex;
    ctx.beginPath();
    ctx.arc(x + 5, y + 10, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.textAlign = "right";
    ctx.font = f(500, 12.5);
    ctx.fillStyle = MUTED;
    const unitText = `${c.units} ${c.units === 1 ? "unit" : "units"}`;
    ctx.fillText(unitText, x + colW, y + 15);
    const unitW = ctx.measureText(unitText).width + 12;

    ctx.textAlign = "left";
    ctx.font = f(800, 14);
    ctx.fillStyle = INK;
    ctx.fillText(c.code, x + 16, y + 15);
    const codeW = ctx.measureText(c.code).width;
    ctx.font = f(500, 13.5);
    ctx.fillStyle = TEXT;
    ctx.fillText(fit(ctx, c.title, colW - 16 - codeW - 10 - unitW), x + 16 + codeW + 10, y + 15);

    ctx.font = f(500, 12.5);
    const detail = [c.sections, c.instructor].filter(Boolean).join(" · ");
    if (c.note) {
      ctx.fillStyle = AMBER;
      ctx.fillText(fit(ctx, detail ? `${c.note} · ${detail}` : c.note, colW - 16), x + 16, y + 33);
    } else {
      ctx.fillStyle = MUTED;
      ctx.fillText(fit(ctx, detail, colW - 16), x + 16, y + 33);
    }
  });

  // ── Finals & midterms ──
  if (layout.examsY != null) {
    const clash = input.exams.some((x) => x.clash);
    ctx.fillStyle = NAVY;
    ctx.font = f(800, 16);
    ctx.fillText("Finals & midterms", grid.x, layout.examsY + 18);
    if (clash) {
      const w = ctx.measureText("Finals & midterms").width;
      ctx.fillStyle = RED;
      ctx.font = f(700, 13);
      ctx.fillText("  Two exams at once", grid.x + w, layout.examsY + 18);
    }
    input.exams.forEach((x, i) => {
      const at = cell(i, input.exams.length);
      const cx = grid.x + at.col * (colW + COLUMN_GAP);
      const y = layout.examsY! + SECTION_HEAD + at.row * EXAM_ROW + 14;
      ctx.fillStyle = ROLE_STYLES[x.role].hex;
      ctx.beginPath();
      ctx.arc(cx + 4, y - 4, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = f(700, 12.5);
      ctx.fillStyle = x.clash ? RED : INK;
      ctx.fillText(x.date, cx + 14, y);
      ctx.font = f(500, 12.5);
      ctx.fillStyle = x.clash ? RED : MUTED;
      ctx.fillText(x.time, cx + 104, y);
      ctx.fillStyle = x.clash ? RED : TEXT;
      ctx.fillText(fit(ctx, `${x.label} · ${x.where}`, colW - 200), cx + 200, y);
    });
  }

  // ── Footer ──
  ctx.fillStyle = FAINT;
  ctx.font = f(500, 12);
  ctx.textAlign = "left";
  ctx.fillText(
    "Times and rooms from UCSD’s Class Planner. Check TSS before you enroll — sections can change.",
    grid.x,
    layout.footerY + 14,
  );
}
