import type { DayOfWeek } from "@/components/triton/types";
import type { Interpretation, IntentKind, Preference, QuarterRef, RequirementRef } from "./types";
import {
  AHI, AREA_STUDY, COLLEGE_ALIASES, DEI, DISCIPLINE_ALIASES, GE_WORD, NUMBER_WORDS, ORDINALS, POFC, REQUIREMENT_WORDS,
  dayFromWord, daysFromPattern, findCourseCodes, flatten, parseClock, WEEKDAYS,
} from "./vocabulary";
import { programFromText, type WarrenDiscipline } from "./warren";

/**
 * The local parser: reads what it can of a request with no model at all.
 *
 * Buttons, the commands below and every constraint it recognises cost
 * nothing to understand, and anything it reads here is read the same way
 * every time. It works by consuming: each pattern that matches blanks out
 * the words it used, and whatever is left over at the end — less filler
 * words — is what it did not understand. A request with nothing left over
 * is complete and needs no model; one with leftovers goes to the model
 * once, or, without one, is answered with exactly which words were not
 * understood, so nothing a student asked for is dropped in silence.
 */

export interface ParseVocab {
  subjects: ReadonlySet<string>;
  codes: ReadonlySet<string>;
  /** GE areas from ge.json, for "sixth humanities GE". */
  areas: { key: string; college: string; area: string }[];
  /** Department names to their subjects, for "a psychology course". */
  departments: { name: string; subjects: string[] }[];
}

/** Filler that carries no request of its own once the patterns have run. */
const FILLER = new Set(`
a an the my me i i'm im i've ive i'd i'll for to with and or of in on at please can could you would like want wanna need
needs some any that this these those it its it's is are be get give find show course courses class classes quarter term
schedule plan one ones something anything also just only still really more much good nice around already chose chosen
picked current currently have has had do does did so but if then than which what will should help let's lets make build
create put together from into as by there their them they we our us your am being been was were how about over under
within okay ok hi hello hey thanks thank whole entire draft drafts suggest suggestion suggestions recommend options option
look looking take taking fits fit fitting work works working between new other another instead same now try trying might
may satisfy satisfies satisfied count counts combination combo doesn't don't isn't aren't won't wouldn't can't cannot
here where when both all each every bit very too maybe perhaps probably sure fine great cool thing things stuff way able
happens happen happened give me same also something's quarter's term's week weekly
`.trim().split(/\s+/));

/** Subjects by the short names students use for them, when no PofC is being asked about. */
const SUBJECT_WORDS: [RegExp, string[]][] = [
  [/\bcomputer\s+science\b/, ["CSE"]],
  [/\bdata\s+science\b/, ["DSC"]],
  [/\bcog(?:nitive)?\s*sci(?:ence)?\b|\bcogsci\b/, ["COGS"]],
  [/\becon\b/, ["ECON"]],
  [/\bpoli\s*sci\b|\bpolisci\b/, ["POLI"]],
  [/\bpsych\b/, ["PSYC"]],
  [/\banthro\b/, ["ANTH"]],
  [/\bchem\b/, ["CHEM"]],
  [/\bbio(?:logy)?\b/, ["BILD", "BICD", "BIEB", "BIMM", "BIPN", "BIBC"]],
  [/\bstats?\b|\bstatistics\b/, ["MATH"]],
];

/** Words a student writes for weekday mornings and evenings. */
const MORNING_END = 12 * 60;
const EVENING_START = 18 * 60;

type Span = [number, number];

class Text {
  readonly raw: string;
  rest: string;

  constructor(raw: string) {
    this.raw = raw;
    this.rest = raw;
  }

  /** Blanks a span out, keeping every other index where it was. */
  take([start, end]: Span) {
    this.rest = this.rest.slice(0, start) + " ".repeat(end - start) + this.rest.slice(end);
  }

  /** First match in what is left, consumed. */
  eat(re: RegExp): RegExpExecArray | null {
    const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
    const g = new RegExp(re.source, flags);
    const m = g.exec(this.rest);
    if (m) this.take([m.index, m.index + m[0].length]);
    return m;
  }

  /** Every match in what is left, consumed. */
  eatAll(re: RegExp): RegExpExecArray[] {
    const out: RegExpExecArray[] = [];
    for (let m = this.eat(re); m; m = this.eat(re)) out.push(m);
    return out;
  }

  test(re: RegExp): boolean {
    return new RegExp(re.source, re.flags.replace("g", "")).test(this.rest);
  }
}

const num = (w: string | undefined): number | null => {
  if (!w) return null;
  if (/^\d+$/.test(w)) return Number(w);
  return NUMBER_WORDS[w.toLowerCase()] ?? ORDINALS[w.toLowerCase()] ?? null;
};

const SEASON: Record<string, "Fall" | "Winter" | "Spring"> = { fall: "Fall", autumn: "Fall", winter: "Winter", spring: "Spring" };
const CLASS_YEAR: Record<string, 1 | 2 | 3 | 4> = { freshman: 1, "first-year": 1, sophomore: 2, junior: 3, senior: 4 };

function planYear(w: string | undefined): 1 | 2 | 3 | 4 | null {
  const n = num(w);
  return n === 1 || n === 2 || n === 3 || n === 4 ? n : null;
}

function calendarYear(w: string | undefined): number | null {
  if (!w) return null;
  const digits = w.replace(/^'/, "");
  if (/^20\d\d$/.test(digits)) return Number(digits);
  if (/^\d\d$/.test(digits)) return 2000 + Number(digits);
  return null;
}

// The meridiem is a whole token: "10 and" is 10, not 10 a.m. followed by "nd".
const TIME = String.raw`(\d{1,2}(?::\d{2})?(?:\s*(?:a\.?m\.?|p\.?m\.?|a|p)(?![a-z]))?|noon)`;
const NO_CLASS = String.raw`(?:no|not|nothing|zero)\s+(?:(?:classes|class|lectures?|sections?|courses?|meetings?)\s+)?`;

/** Reads `text`. The vocabulary decides what is a course, a subject, a GE area. */
export function parseLocal(input: string, vocab: ParseVocab): Interpretation {
  const flat = flatten(input);
  const t = new Text(` ${flat.toLowerCase()} `);
  const out: Interpretation = {
    kind: null, courses: [], unknownCodes: [], replacement: null, optionRef: null, quarter: null,
    constraints: {}, preferences: [], requirement: null, subjects: [], topic: null, keep: [], keepAll: false,
    ask: null, explicit: false, reply: null, leftover: [], unsupported: [], source: "local",
  };
  const prefer = (p: Preference) => { if (!out.preferences.includes(p)) out.preferences.push(p); };
  const avoid = (d: DayOfWeek) => {
    const days = out.constraints.avoidDays ?? [];
    if (!days.includes(d)) out.constraints.avoidDays = [...days, d];
  };

  // ── A one-word answer to whatever is waiting ──────────────────────────────
  if (/^\s*(?:yes|yep|yeah|sure|ok(?:ay)?|confirm(?:ed)?|do it|go ahead|sounds good|please do|apply (?:it|them|that))\s*[.!]*\s*$/.test(t.rest)) {
    return { ...out, reply: "yes", explicit: true };
  }
  if (/^\s*(?:no|nope|cancel|never ?mind|don'?t|stop|not now)\s*[.!]*\s*$/.test(t.rest)) {
    return { ...out, reply: "no", explicit: true };
  }

  // ── Course codes, before anything reads their digits as times or units ────
  const codes = findCourseCodes(t.rest, vocab.subjects, vocab.codes);
  for (const c of codes) {
    t.take([c.start, c.end]);
    const list = c.known ? out.courses : out.unknownCodes;
    if (!list.includes(c.code)) list.push(c.code);
  }

  const isQuestion = /\?\s*$/.test(flat) || /^\s*(?:what|why|how|would|will|does|do|did|can i|could i|should|is|are|which)\b/.test(t.raw);
  const imperative = (verbs: string) =>
    new RegExp(String.raw`^\s*(?:(?:please|can you|could you|would you|pls|now|then|ok(?:ay)?|and)[\s,]+)*(?:${verbs})\b`).test(t.raw);

  // ── Commands ──────────────────────────────────────────────────────────────
  if (t.eat(/\b(?:undo|revert|reverse|roll back|take back)\b(?:\s+(?:that|it|this|the last(?: one| change| thing)?|my last change|the change|last change))?(?:\s+change)?/)) {
    out.kind = "undo";
    out.explicit = !isQuestion;
  }

  const replace = t.eat(/\b(?:replace|swap(?:\s+out)?|switch(?:\s+out)?|substitute|exchange|trade)\b/);
  if (replace) {
    t.eat(/\b(?:with|for|to|by)\b/);
    if (out.courses.length >= 2) {
      out.kind = "replace_course";
      out.replacement = out.courses[1];
      out.courses = [out.courses[0]];
    } else {
      out.kind = "replace_course";
    }
    out.explicit = imperative("replace|swap|switch|substitute|exchange|trade") && out.courses.length === 1 && Boolean(out.replacement);
  }

  // "What changes if I move…" asks about a move; it does not make one.
  const whatIf = Boolean(t.eat(/\bwhat\s+(?:changes|happens|would\s+(?:change|happen)|will\s+(?:change|happen)|breaks)\s+if\b|\bwhat\s+if\b/));
  const move = !out.kind && t.eat(/\b(?:move|shift|push|bump|reschedule)\b/);
  if (move) {
    out.kind = "move_course";
    t.eat(/\b(?:this|that|the)\s+(?:prerequisite|prereq|course|class|one)\b/);
    out.explicit = imperative("move|shift|push|bump|reschedule") && !isQuestion && !whatIf;
  }

  const remove = !out.kind && t.eat(/\b(?:remove|drop|delete|take out|get rid of|cut)\b/);
  if (remove) {
    out.kind = "remove_course";
    out.explicit = imperative("remove|drop|delete|take out|get rid of|cut") && !isQuestion;
  }

  // "add" anywhere; the other verbs only open a sentence, since "a schedule
  // I can use" or "put together a quarter" add nothing.
  const PICK = "use|choose|pick|go with|apply|select|put|include|take";
  const add = !out.kind && (t.eat(/\b(?:add|enroll me in|sign me up for)\b/)
    || (imperative(PICK) && t.eat(new RegExp(String.raw`\b(?:${PICK})\b`))));
  if (add) {
    out.kind = "add_course";
    out.explicit = imperative(`add|enroll me in|sign me up for|${PICK}`) && !isQuestion;
  }

  // ── Which option on screen ────────────────────────────────────────────────
  const ordinal = t.eat(/\b(?:the\s+)?(first|second|third|1st|2nd|3rd|last)\s+(?:one|option|draft|choice|plan|alternative|schedule|suggestion)\b/);
  const numbered = !ordinal && t.eat(/\b(?:option|draft|choice|alternative|number|#)\s*#?\s*(\d|one|two|three)\b/);
  const deictic = !ordinal && !numbered && t.eat(/\b(?:that|this|the)\s+(?:one|option|draft|suggestion)\b/);
  if (ordinal) out.optionRef = ordinal[1] === "last" ? -1 : num(ordinal[1]);
  else if (numbered) out.optionRef = num(numbered[1]);
  else if (deictic) out.optionRef = 0;
  if (out.kind === "add_course" && out.optionRef == null && t.eat(/\b(?:it|them|that|this)\b/)) out.optionRef = 0;

  // ── Keep what is there ────────────────────────────────────────────────────
  if (t.eat(/\b(?:keep|lock|hold|leave|preserve|around|with)\s+(?:all\s+)?(?:of\s+)?(?:my|the)\s+(?:current|existing|other)?\s*(?:courses|classes|schedule|picks)(?:\s+(?:i(?:'ve| have)?\s+)?(?:already\s+)?(?:chose|chosen|picked|have|added))?\b/)
    || t.eat(/\baround\s+(?:what|the\s+courses|the\s+classes)\s+i\s+(?:already\s+)?(?:chose|picked|have)\b/)) {
    out.keepAll = true;
  }
  const keepThese = t.eat(/\b(?:keep|lock|hold)\s+(?:these|those|both|the)\s+(two|three|2|3)?\s*(?:courses|classes|ones)?\b/);
  if (keepThese) {
    if (out.courses.length) out.keep = [...out.courses];
    else out.ask = "these-courses";
  }
  const keepNamed = t.eat(/\b(?:keep|lock|hold onto|don'?t (?:touch|change|move))\b/);
  if (keepNamed && out.courses.length) out.keep = [...new Set([...out.keep, ...out.courses])];
  else if (keepNamed && t.eat(/\b(?:this|that|it)(?:\s+(?:course|class|one))?\b/)) out.ask = "these-courses";
  // A student's own record is read here, in the browser; naming it asks for nothing new.
  t.eat(/\b(?:based\s+on\s+|from\s+|using\s+)?(?:my\s+)?(?:academic\s+history|transcript|degree\s+audit|records?)\b/);

  // ── Which quarter ─────────────────────────────────────────────────────────
  const quarter: QuarterRef = { relative: null, season: null, year: null, planYear: null };
  let quarterSeen = false;
  if (t.eat(/\b(?:this|current|the current)\s+(?:quarter|term)\b|\bthis\s+(?:fall|winter|spring)\b/)) {
    quarter.relative = "this"; quarterSeen = true;
  }
  if (t.eat(/\bnext\s+(?:quarter|term)\b/)) { quarter.relative = "next"; quarterSeen = true; }
  const yearSeason = t.eat(/\b(?:(?:year|yr)\s*(1|2|3|4|one|two|three|four)|(freshman|first-year|sophomore|junior|senior)\s+year)\s*,?\s*(?:in\s+)?(fall|autumn|winter|spring)\b/);
  const seasonYear = !yearSeason && t.eat(/\b(fall|autumn|winter|spring)\s*(?:quarter\s*)?(?:of\s+)?(?:(?:year|yr)\s*(1|2|3|4|one|two|three|four)|(?:my\s+)?(freshman|first-year|sophomore|junior|senior)\s+year)\b/);
  if (yearSeason) {
    quarter.planYear = planYear(yearSeason[1]) ?? CLASS_YEAR[yearSeason[2]] ?? null;
    quarter.season = SEASON[yearSeason[3]];
    quarterSeen = true;
  } else if (seasonYear) {
    quarter.season = SEASON[seasonYear[1]];
    quarter.planYear = planYear(seasonYear[2]) ?? CLASS_YEAR[seasonYear[3]] ?? null;
    quarterSeen = true;
  }
  const season = t.eat(/\b(?:(?:my|the|in|for|to|during)\s+)?(fall|autumn|winter|spring)(?:\s+(?:quarter|term|plan|schedule))?(?:\s+(?:of\s+)?(20\d\d|'\d\d))?\b/);
  if (season) {
    quarter.season = SEASON[season[1]];
    quarter.year = calendarYear(season[2]);
    quarterSeen = true;
  }
  if (quarterSeen) out.quarter = quarter;

  // ── Units ─────────────────────────────────────────────────────────────────
  const U = String.raw`(?:-|\s)?units?|(?:-|\s)?u\b|\s*credits?`;
  const range = t.eat(new RegExp(String.raw`\b(?:between\s+)?(\d{1,2})\s*(?:-|to|and)\s*(\d{1,2})\s*(?:${U})\b`));
  if (range) {
    const [a, b] = [Number(range[1]), Number(range[2])].sort((x, y) => x - y);
    out.constraints.units = { min: a, max: b };
  } else {
    // "no more than" first, or "more than 16 units" would be read inside it.
    const atMost = t.eat(new RegExp(String.raw`\b(?:at\s+most|max(?:imum)?(?:\s+of)?|no\s+more\s+than|up\s+to|under|less\s+than|fewer\s+than)\s+(\d{1,2})\s*(?:${U})\b`));
    const atLeast = t.eat(new RegExp(String.raw`\b(?:at\s+least|min(?:imum)?(?:\s+of)?|no\s+(?:less|fewer)\s+than|over|more\s+than)\s+(\d{1,2})\s*(?:${U})\b`));
    const exact = !atLeast && !atMost && t.eat(new RegExp(String.raw`\b(\d{1,2})\s*(?:${U})\b`));
    if (atLeast || atMost) out.constraints.units = { min: atLeast ? Number(atLeast[1]) : null, max: atMost ? Number(atMost[1]) : null };
    else if (exact) out.constraints.units = { min: Number(exact[1]), max: Number(exact[1]) };
  }
  if (!out.constraints.units && t.eat(/\bfull[-\s]?time\b/)) out.constraints.units = { min: 12, max: null };

  // ── Times ─────────────────────────────────────────────────────────────────
  // Most specific first: "nothing after 3" is an end, a bare "after 10" a start.
  const clock = (m: RegExpExecArray | null) => (m ? parseClock(m[1]) : null);
  const noneAfter = clock(t.eat(new RegExp(String.raw`\b${NO_CLASS}(?:after|later than|past)\s+${TIME}`)));
  const noneBefore = clock(t.eat(new RegExp(String.raw`\b${NO_CLASS}(?:before|earlier than|until)\s+${TIME}`)));
  const doneBy = clock(t.eat(new RegExp(String.raw`\b(?:done|finish(?:ed)?|end(?:ing)?|out|free|off)\s+(?:by|before|at)\s+${TIME}`)));
  const startAfter = clock(t.eat(new RegExp(String.raw`\b(?:(?:start(?:ing|s)?|begin(?:ning|s)?)\s+(?:at\s+or\s+)?after|after|later than|not before|from)\s+${TIME}`)));
  const endBefore = clock(t.eat(new RegExp(String.raw`\b(?:before|until|by)\s+${TIME}`)));
  const noXam = t.eat(/\bno\s+(\d{1,2})\s*(?:am|a\.m\.|a)s?\b/);
  const xamCut = noXam ? parseClock(`${noXam[1]}am`) : null;
  const earliest = noneBefore ?? startAfter ?? (xamCut != null ? xamCut + 60 : null);
  const latest = noneAfter ?? doneBy ?? endBefore;
  if (earliest != null) out.constraints.earliestStart = earliest;
  if (latest != null) out.constraints.latestEnd = latest;
  if (t.eat(/\b(?:no|not|avoid|without)\s+(?:early\s+)?morning(?:\s+(?:classes|class|lectures))?\b|\bno\s+mornings\b/)) out.constraints.earliestStart = MORNING_END;
  if (t.eat(/\b(?:no|not|avoid|without)\s+(?:evening|night|late)(?:\s+(?:classes|class|lectures))?\b|\bno\s+(?:evenings|nights)\b/)) out.constraints.latestEnd = EVENING_START;
  if (t.eat(/\b(?:sleep\s+in|later\s+start|start\s+later|start\s+late|late\s+start)\b/)) prefer("later_start");
  if (t.eat(/\b(?:earlier\s+finish|finish\s+earlier|end\s+earlier|done\s+earlier|out\s+earlier)\b/)) prefer("earlier_finish");

  // ── Days ──────────────────────────────────────────────────────────────────
  for (const m of t.eatAll(/\b(?:no|not\s+on|avoid|without|free|off)\s+(?:(?:classes|class|school)\s+)?(?:on\s+)?((?:mon|tue|tues|wed|thu|thur|thurs|fri)(?:days?|s)?(?:\s*(?:,|and|or|\/)\s*(?:mon|tue|tues|wed|thu|thur|thurs|fri)(?:days?|s)?)*)\b/)) {
    for (const w of m[1].split(/\s*(?:,|and|or|\/)\s*/)) {
      const d = dayFromWord(w);
      if (d) avoid(d);
    }
  }
  for (const m of t.eatAll(/\b((?:mon|tue|tues|wed|thu|thur|thurs|fri)(?:days?|s)?)\s+(?:off|free)\b/)) {
    const d = dayFromWord(m[1]);
    if (d) avoid(d);
  }
  const only = t.eat(/\bonly\s+(?:on\s+)?((?:[mtwrf]|tu|th)+|(?:mon|tue|tues|wed|thu|thur|thurs|fri)(?:days?|s)?(?:\s*(?:,|and|\/)\s*(?:mon|tue|tues|wed|thu|thur|thurs|fri)(?:days?|s)?)*)\b/);
  if (only) {
    const named = daysFromPattern(only[1]) ?? only[1].split(/\s*(?:,|and|\/)\s*/).map(dayFromWord).filter((d): d is DayOfWeek => Boolean(d));
    if (named.length) for (const d of WEEKDAYS) if (!named.includes(d)) avoid(d);
  }

  // ── Preferences ───────────────────────────────────────────────────────────
  if (t.eat(/\b(?:fewer|less|minimum|minimal|least)\s+(?:campus\s+)?days\b|\b(?:compact|condensed|compressed)\s+(?:schedule|week)\b|\bfewer\s+days\s+on\s+campus\b/)) prefer("fewer_days");
  if (t.eat(/\b(?:fewer|less|shorter|smaller|minimal|no(?:\s+big)?|minimi[sz]e(?:\s+the)?)\s+(?:gaps?|breaks?|downtime|waiting)(?:\s+between\s+(?:classes|class|lectures))?\b|\bback[-\s]to[-\s]back\b/)) prefer("fewer_gaps");
  if (t.eat(/\b(?:different|another|other|new)\s+(?:instructor|professor|prof|teacher|lecturer)\b/)) prefer("different_instructor");
  if (t.eat(/\b(?:open|available)\s+seats?\b|\b(?:not|isn'?t|aren'?t)\s+full\b|\bwith\s+seats?\b/)) out.constraints.openSeats = true;
  if (t.eat(/\b(?:more|most|max(?:imum)?)\s+(?:requirement|degree|ge|major)\s+(?:progress|credit)\b|\b(?:counts?|count)\s+(?:toward|towards|for)\s+(?:my\s+)?(?:requirements?|degree|major)\b/)) prefer("requirements");

  // ── Prerequisites ─────────────────────────────────────────────────────────
  if (t.eat(/\b(?:with\s+|that\s+(?:have|has)\s+)?(?:no|zero|without(?:\s+any)?)\s+(?:pre-?req(?:uisite)?s?|requirements?\s+before)\b|\bno[-\s]pre-?req\w*\b/)) out.constraints.noPrerequisites = true;
  if (t.eat(/\b(?:pre-?req(?:uisite)?s?\s+i\s+(?:meet|have|satisfy|satisfied|fulfill|fulfil)|(?:that|which)\s+i\s+(?:can|am\s+able\s+to)\s+take|i(?:'m|\s+am)\s+eligible\s+(?:for|to\s+take)|i\s+qualify\s+for)\b/)) out.constraints.prereqsMet = true;

  // ── Requirements ──────────────────────────────────────────────────────────
  let college: string | null = null;
  for (const [re, key] of COLLEGE_ALIASES) {
    if (t.eat(re)) { college = college ?? key; }
  }
  let discipline: WarrenDiscipline | null = null;
  for (const [re, d] of DISCIPLINE_ALIASES) {
    if (!discipline && t.test(re)) {
      t.eat(re);
      discipline = d;
    }
  }
  const pofc = Boolean(t.eat(POFC));
  const areaStudy = !pofc && Boolean(t.eat(AREA_STUDY));
  let requirement: RequirementRef | null = null;
  if (pofc || areaStudy || (college === "warren" && discipline)) {
    // A program by name only counts here, where a PofC was asked about:
    // elsewhere "economics" is a subject, not a Warren program.
    const named = programFromText(t.rest);
    if (named) t.take([named.start, named.end]);
    requirement = {
      kind: areaStudy ? "warren_area_study" : "warren_pofc",
      discipline: discipline ?? (named && named.program.disciplines.length === 1 ? named.program.disciplines[0] : null),
      program: named?.program.id ?? null,
    };
    t.eat(GE_WORD);
  } else if (t.eat(DEI)) {
    requirement = { kind: "university", list: "campus:DEI" };
  } else if (t.eat(AHI)) {
    requirement = { kind: "university", list: "campus:AHI" };
  } else {
    const ge = Boolean(t.eat(GE_WORD));
    // An area of the named college whose name the request uses: "sixth humanities".
    const areaWords = discipline === "humanities" ? "humanities" : discipline === "social" ? "social" : discipline === "science" ? "natural" : null;
    const scope = college ? vocab.areas.filter((a) => a.college === college) : [];
    let area: string | null = null;
    const typed = t.rest.split(/[^a-z]+/).filter((w) => w.length >= 4 && !FILLER.has(w));
    for (const a of scope) {
      const name = a.area.toLowerCase();
      const words = name.split(/[^a-z]+/).filter((w) => w.length >= 4);
      // "math" names Revelle's "Mathematics"; "regional" alone names no one region.
      const hit = typed.find((w) => words.some((n) => n.startsWith(w) || w.startsWith(n)) && w !== "regional");
      if (hit || (areaWords && name.includes(areaWords))) {
        area = a.key;
        if (hit) t.eat(new RegExp(`\\b${hit}\\b`));
        break;
      }
    }
    if (ge || college || area) {
      requirement = { kind: "college_ge", college, area, words: area ? null : areaWords };
    } else if (discipline) {
      requirement = { kind: "college_ge", college: null, area: null, words: areaWords };
    }
  }
  if (t.eat(/\b(?:my\s+)?major(?:\s+(?:requirements?|courses?|class(?:es)?))?\b/)) requirement = requirement ?? { kind: "major" };
  out.requirement = requirement;

  // ── Subjects named in words ───────────────────────────────────────────────
  const addSubjects = (subjects: string[]) => {
    for (const s of subjects) if (vocab.subjects.has(s) && !out.subjects.includes(s)) out.subjects.push(s);
  };
  for (const dept of vocab.departments) {
    const name = dept.name.toLowerCase().replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ").trim();
    if (name.length < 5) continue;
    if (t.eat(new RegExp(`\\b${name}\\b`))) addSubjects(dept.subjects);
  }
  for (const [re, subjects] of SUBJECT_WORDS) if (t.eat(re)) addSubjects(subjects);
  // A subject code on its own: "cogs courses", "a cse class".
  for (const m of [...t.rest.matchAll(/\b([a-z]{3,5})\b(?=\s+(?:courses?|class(?:es)?|electives?)\b)/g)]) {
    const subject = m[1].toUpperCase();
    if (!vocab.subjects.has(subject)) continue;
    addSubjects([subject]);
    t.take([m.index, m.index + m[1].length]);
  }

  // ── A topic: "a course about film" ─────────────────────────────────────────
  // One word after a clear topic marker, searched in titles. A longer topic
  // leaves words behind and goes to the model; a requirement word was read
  // as a requirement above and never reaches here.
  const about = t.eat(/\b(?:about|covering)\s+([a-z][a-z-]{2,30})\b/);
  if (about && !REQUIREMENT_WORDS.test(about[1]) && !FILLER.has(about[1])) out.topic = about[1];

  // ── What kind of request, when no command said ────────────────────────────
  const kindPhrases: [RegExp, IntentKind][] = [
    [/\b(?:build|plan|make|create|draft|put together|design|set up|generate)\s+(?:me\s+)?(?:a\s+|my\s+|the\s+)?(?:\d{1,2}\s*-\s*\d{1,2}\s+unit\s+)?(?:full\s+)?(?:quarter|schedule|term|week|timetable)\b/, "build_quarter"],
    [/\b(?:improve|optimi[sz]e|fix|tweak|adjust|rework|clean up|better)\s+(?:my\s+|the\s+|this\s+)?(?:plan|schedule|week|quarter)?\b/, "improve_plan"],
    [/\b(?:compare|difference between|differences)\b/, "compare_options"],
    [/\b(?:find|suggest|recommend|show|look for|search for|need|want|get)\s+(?:me\s+)?(?:a|an|some|another|one|more)?\s*(?:good\s+)?(?:courses?|class(?:es)?|ges?|options?)\b/, "find_fitting_course"],
    [/\bwhy\b|\bexplain\b|\bwhat\s+requirements?\b|\bwhat\s+(?:would|will|does)\b|\bwhat\s+(?:changes|happens)\b/, "explain_choice"],
    [/\bshow\s+(?:me\s+)?(?:the\s+)?(?:alternatives?|other\s+options|more\s+options)\b|\balternatives?\b/, "compare_options"],
  ];
  for (const [re, kind] of kindPhrases) {
    if (t.test(re)) {
      t.eat(re);
      if (!out.kind) out.kind = kind;
    }
  }
  if (t.eat(/\b(?:make\s+it|something|a\s+quarter|a\s+schedule)?\s*(?:easier|easy|lighter|less\s+(?:work|stressful|hard)|chill(?:er)?|not\s+(?:too\s+)?hard)\b/)) {
    out.ask = "easier";
  }
  t.eat(/\b(?:that|which|to)\s+(?:fits?|works?)\s+(?:with\s+|in(?:to)?\s+|around\s+)?(?:my|the)?\s*(?:current\s+)?(?:schedule|plan|week|classes|calendar)?\b/);
  t.eat(/\bbetween\s+(?:classes|class|lectures)\b/);

  // ── Whatever is left ──────────────────────────────────────────────────────
  out.leftover = t.rest
    .split(/[^a-z0-9'+#&-]+/)
    .map((w) => w.replace(/^[-'&]+|[-'&]+$/g, ""))
    .filter((w) => w && !FILLER.has(w) && !/^\d{1,2}$/.test(w) && !/^[.,!?]+$/.test(w));

  if (whatIf && !out.kind) out.kind = "explain_choice";
  if (!out.kind) {
    if (out.ask === "easier") out.kind = "clarify";
    else if (out.constraints.units) out.kind = "build_quarter";
    else if (out.requirement || out.subjects.length || out.topic || out.constraints.noPrerequisites || out.constraints.prereqsMet) out.kind = "find_fitting_course";
    else if (out.preferences.length || out.constraints.earliestStart != null || out.constraints.latestEnd != null || out.constraints.avoidDays?.length) out.kind = "improve_plan";
    else if (out.courses.length && !out.leftover.length) out.kind = "find_fitting_course";
  }
  if (out.kind === "add_course" && !out.courses.length && out.optionRef == null) out.explicit = false;
  if (out.kind === "remove_course" && !out.courses.length) out.explicit = false;
  if (out.kind === "move_course" && (!out.courses.length || !out.quarter)) out.explicit = false;
  if (out.leftover.length) out.explicit = false;
  return out;
}

/** True when nothing in the request went unread: no model is needed for it. */
export function isComplete(p: Interpretation): boolean {
  return p.reply != null || (p.kind != null && p.leftover.length === 0);
}
