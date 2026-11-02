/**
 * What the language model may be sent, word by word.
 *
 * privacy.ts screens a request for the shapes of personal details — emails,
 * ids, grades, names. A screen can only catch what it knows to look for, so
 * by itself it was the whole privacy guarantee: a sentence it did not
 * recognise ("I'm on academic probation and my dad is sick") went to the
 * model as typed.
 *
 * This module makes the boundary structural instead. A request leaves only
 * as words from a public vocabulary: the words of course planning, UCSD's
 * subject codes and names, college GE areas, Warren programs, words that
 * appear in published course titles, numbers, times and course codes. Any
 * other word is withheld and replaced with "…", and the student is told which
 * words stayed here. A word right after "my", "I'm", "I have" and the like
 * must be a planning word, because public words can still carry personal
 * context there ("my depression"). The server applies the same rule and
 * refuses a request that breaks it, so the browser is not trusted to have
 * done it.
 *
 * The screen stays as defence in depth; this is the guarantee.
 */

import { WARREN_PROGRAMS } from "./warren";

/** The words of planning a quarter: commands, time, load, requirements, and the glue between them. */
const PLANNING = `
a an the my me i i'm im i've ive i'd i'll for to with and or of in on at please can could you would like want wanna need
needs some any that this these those it its it's is are be get give find show course courses class classes quarter quarters
term terms schedule schedules plan plans one ones something anything also just only still really more much good nice around
already chose chosen picked current currently have has had do does did so but if then than which what will should help let's
lets make build create put together from into as by there their them they we our us your am being been was were how about
over under within okay ok hi hello hey thanks thank whole entire draft drafts suggest suggestion suggestions recommend options
option look looking take taking fits fit fitting work works working between new other another instead same now try trying
might may satisfy satisfies satisfied count counts combination combo doesn't don't isn't aren't won't wouldn't can't cannot
here where when both all each every bit very too maybe perhaps probably sure fine great cool thing things way able happens
happen happened yes no not nothing none without except avoid avoiding free off keep keeping drop dropping add adding remove
removing replace replacing swap swapping switch switching move moving undo redo compare comparing explain why because best
better worst top highest high higher low lower lowest most least fewer few less many first second third fourth last next
previous earlier later early late before after until till through starting start starts end ends ending finish finishes
finishing day days daily week weeks weekday weekdays weekend weekends morning mornings afternoon afternoons evening evenings
night nights noon midday am pm a.m a.m. p.m p.m. o'clock hour hours hr hrs minute minutes min mins time times break breaks gap gaps
back-to-back straight row long longer short shorter monday mondays tuesday tuesdays wednesday wednesdays thursday thursdays
friday fridays mon tue tues wed thu thur thurs fri mw mwf tth tuth tr unit units credit credits load light lighter heavy
heavier easy easier easiest hard harder hardest difficult workload chill ge ges gen ed eds general education requirement
requirements require required requires prereq prereqs prerequisite prerequisites eligible eligibility major majors minor
minors college colleges upper lower division div elective electives seat seats open full waitlist waitlisted online remote
hybrid in-person person lecture lectures discussion discussions lab labs section sections final finals exam exams midterm
midterms professor professors prof profs instructor instructors teacher rated rating ratings rmp grade grades graded gpa
average fall winter spring summer year years freshman sophomore junior senior first-year transfer pofc program programs
concentration area areas study studies dei ahi diversity equity inclusion american history institutions humanities social
natural science sciences quantitative arts art writing language languages core sequence revelle muir marshall warren erc
roosevelt eleanor sixth seventh eighth campus ucsd uc san diego taught teach teaches teaching offered offering available
fill fills filled fulfill fulfills fulfilling meet meets meeting meetings topic topics subject subjects department
departments interesting fun related kind kinds type types similar ideally prefer preferably preference rather either neither
nor whether also too even though although while during per total maximum minimum max min least most exactly about roughly
one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen twenty
`.trim().split(/\s+/);

const PLANNING_SET: ReadonlySet<string> = new Set(PLANNING);

/** First-person phrases after which only a planning word may follow. */
const PERSONAL_LEAD = new Set(["my", "i'm", "im", "i've", "ive", "i'd", "mine"]);
const PERSONAL_LEAD_PAIRS = new Set(["i am", "i have", "i had", "i was", "i feel", "i've been", "i got", "i need", "i struggle", "i suffer"]);
/** Words a first-person lead may skip over before the word that matters. */
const SKIP_AFTER_LEAD = new Set(["a", "an", "the", "been", "got", "currently", "really", "very", "so", "on", "in", "taking"]);

/** Course code, number, time, range or ordinal: never personal on its own. */
const SHAPED = [
  /^\d{1,3}[a-z]{0,4}$/, // 11, 20a, 15l, 1st? (ordinals below)
  /^\d{1,2}(?::\d{2})?(?:am|pm|a|p)?$/, // 10, 10am, 3:30pm
  /^\d{1,2}(?::\d{2})?-\d{1,2}(?::\d{2})?(?:am|pm)?$/, // 12-16, 9-5
  /^\d{1,2}(?:st|nd|rd|th)$/,
  /^'\d\d$/, // '27
  /^20\d\d$/, // 2027
];

export interface OutboundVocab {
  /** Lower-case words the model may receive besides the planning words. */
  words: ReadonlySet<string>;
  /** Lower-case subject codes: as much a planning word as "units" ("keep my CSE 12"). */
  codes: ReadonlySet<string>;
}

const WORD = /[a-z0-9][a-z0-9'.:-]*/g;

/** Splits a phrase into the words this module reasons about. */
const wordsOf = (text: string) => (text.toLowerCase().match(WORD) ?? []).map((w) => w.replace(/[.:'-]+$/, ""));

/**
 * The public words beyond planning: subject codes and names, GE areas,
 * Warren programs, and the words of published course titles. Built from the
 * dataset on both sides of the boundary, so browser and server agree.
 */
export function outboundVocab(input: {
  subjects: { code: string; name?: string }[];
  areas?: { area: string }[];
  titles?: Iterable<string>;
}): OutboundVocab {
  const words = new Set<string>();
  const codes = new Set(input.subjects.map((s) => s.code.toLowerCase()));
  const addAll = (text: string | undefined) => { for (const w of wordsOf(text ?? "")) if (w.length > 1 && !/^\d+$/.test(w)) words.add(w); };
  for (const s of input.subjects) { words.add(s.code.toLowerCase()); addAll(s.name); }
  for (const a of input.areas ?? []) addAll(a.area);
  for (const p of WARREN_PROGRAMS) addAll(p.name);
  for (const t of input.titles ?? []) addAll(t);
  return { words, codes };
}

const isPlanning = (w: string, vocab: OutboundVocab) => PLANNING_SET.has(w) || vocab.codes.has(w) || SHAPED.some((re) => re.test(w));

function isPublic(w: string, vocab: OutboundVocab): boolean {
  return isPlanning(w, vocab) || vocab.words.has(w);
}

export interface Minimized {
  /** What may be sent: the request with every withheld word replaced by "…". */
  text: string;
  /** The words that stayed in the browser, as the student typed them. */
  withheld: string[];
  /** Whether anything worth sending is left once filler is set aside. */
  meaningful: boolean;
}

/** The request as the model may see it. */
export function minimizeForModel(text: string, vocab: OutboundVocab): Minimized {
  const out: string[] = [];
  const withheld: string[] = [];
  let meaningful = false;
  // Tokens kept with their original spelling and the separators between them.
  const parts = text.split(/(\s+)/);
  let leadArmed = false;
  /**
   * Set once a clause has withheld a word: the rest of it, to the next
   * punctuation, keeps planning words only. "my mom has cancer" must not
   * send "cancer" because a course title happens to use it.
   */
  let tainted = false;
  let prev = "";
  for (const part of parts) {
    if (!part || /^\s+$/.test(part)) { if (part) out.push(" "); continue; }
    const words = wordsOf(part);
    if (!words.length) {
      // Pure punctuation keeps its place; it also ends a clause.
      out.push(part.replace(/[^,.;:!?()"'-]/g, ""));
      if (/[,.;:!?]/.test(part)) { leadArmed = false; tainted = false; }
      continue;
    }
    let keep = true;
    for (const w of words) {
      const pair = `${prev} ${w}`;
      if (leadArmed && !SKIP_AFTER_LEAD.has(w)) {
        // The word a first-person lead points at must be about planning.
        if (!isPlanning(w, vocab)) keep = false;
        leadArmed = false;
      } else if (tainted ? !isPlanning(w, vocab) : !isPublic(w, vocab)) {
        keep = false;
      }
      if (PERSONAL_LEAD.has(w) || PERSONAL_LEAD_PAIRS.has(pair)) leadArmed = true;
      prev = w;
    }
    if (keep) {
      out.push(part);
      if (words.some((w) => !PLANNING_SET.has(w) || /^\d/.test(w) || !FILLERISH.has(w))) meaningful = true;
    } else {
      out.push("…");
      withheld.push(part.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""));
      leadArmed = false;
      tainted = true;
    }
    if (/[,.;:!?]$/.test(part)) { leadArmed = false; tainted = false; }
  }
  const sent = out.join("").replace(/\s+/g, " ").replace(/(?:…\s*){2,}/g, "… ").trim();
  return { text: sent, withheld: [...new Set(withheld.filter(Boolean))], meaningful };
}

/** Glue words that do not make a request worth a model call by themselves. */
const FILLERISH = new Set(PLANNING.slice(0, PLANNING.indexOf("yes")));

/**
 * The server's side of the boundary: true when every word of `text` is one
 * the browser was allowed to send. "…" stands for withheld words and passes.
 */
export function withinOutboundVocab(text: string, vocab: OutboundVocab): boolean {
  const m = minimizeForModel(text, vocab);
  return m.withheld.length === 0;
}
