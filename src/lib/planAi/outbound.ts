/**
 * What the language model may be sent: a request rebuilt from canonical
 * planning tokens, never a fragment of what the student typed.
 *
 * An earlier version filtered the student's words against a vocabulary and
 * forwarded the fragments that passed. Two things broke that: a fragment was
 * copied from the original text, so "course私密信息" passed as the ASCII word
 * "course" with the rest attached; and public words — a course title's
 * "depression" — can still state something personal.
 *
 * So the request is constructed, not filtered:
 *  - the text is folded to ASCII lower case and split into tokens; a token
 *    that is not plain ASCII after folding is never emitted;
 *  - each token is emitted only as an entry of a closed lexicon of planning
 *    words, a catalog course code ("CSE 11"), a subject code, a GE-area or
 *    Warren-program word, or a number, time or range in canonical form;
 *  - course-title words are not in the lexicon (topics are read locally);
 *  - first-person words ("I", "my", "me") are dropped, and so is the rest of
 *    any clause after a reason marker ("because", "since"), where personal
 *    context lives;
 *  - clauses are rejoined with " | ".
 * Everything else stays on this device and is named to the student there.
 *
 * The server runs the same construction on what it receives and accepts the
 * request only when that changes nothing (`isCanonicalRequest`), so a direct
 * API call cannot carry anything the browser would have kept back.
 *
 * What this cannot promise: a sentence made only of planning words still
 * means what it says. The lexicon is kept to words about schedules, load and
 * requirements so that such a sentence says little about the person.
 */

import { WARREN_PROGRAMS } from "./warren";

/** Words about planning a quarter: commands, time, load, requirements, and the glue between them. */
const PLANNING = `
a an the for to with and or of in on at please can could you would like want need needs some any that this these those it
its is are be get give find show course courses class classes quarter quarters term terms schedule schedules plan plans one
ones something anything also just only still more much around already chose chosen picked current currently have has had do
does did but if then than which what will should help make build create put together from into as by there them they how
about over under within okay ok whole entire draft drafts suggest suggestion suggestions recommend options option look looking
take taking fits fit fitting between new other another instead same now try might may satisfy satisfies satisfied count
counts combination combo don't doesn't can't cannot here where when both all each every bit very too maybe probably way able
yes no not nothing none without except avoid avoiding free off keep keeping drop dropping add adding remove removing replace
replacing swap swapping switch switching move moving undo redo compare comparing explain why best better worst top highest
high higher low lower lowest most least fewer few less many first second third fourth last next previous earlier later early
late before after until till through starting start starts end ends ending finish finishes finishing day days daily week
weeks weekday weekdays weekend weekends morning mornings afternoon afternoons evening evenings night nights noon midday am pm
o'clock hour hours hr hrs minute minutes min mins time times break breaks gap gaps back-to-back straight row long longer short
shorter monday mondays tuesday tuesdays wednesday wednesdays thursday thursdays friday fridays mon tue tues wed thu thur thurs
fri mw mwf tth tuth tr unit units credit credits load light lighter heavy heavier easy easier easiest hard harder ge ges gen
ed general education requirement requirements require required requires prereq prereqs prerequisite prerequisites eligible
major majors minor minors college colleges upper lower division div elective electives seat seats open full waitlist online
remote hybrid in-person lecture lectures discussion discussions lab labs section sections final finals exam exams midterm
midterms professor professors prof profs instructor instructors rated rating ratings rmp grade grades gpa average fall
winter spring summer year years freshman sophomore junior senior first-year transfer pofc program programs concentration area
areas dei ahi diversity equity inclusion american history institutions humanities social natural science sciences
quantitative arts writing language languages core sequence revelle muir marshall warren erc roosevelt eleanor sixth seventh
eighth campus ucsd taught teach teaches teaching offered offering available fulfill fulfills meet meets meeting meetings
subject subjects department departments related similar prefer preferably rather either neither whether even per total
maximum minimum max exactly roughly one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen
sixteen seventeen eighteen twenty
`.trim().split(/\s+/);

/** Glue that carries no request by itself: a request of only these is not worth a model call. */
const GLUE = new Set(`
a an the for to with and or of in on at please can could you would like want need needs some any that this these those it
its is are be get give that also just only still around already but if then than which what will should help from into as by
there them they how about over under within okay ok here where when both all each every bit very too maybe probably way able
even per either neither whether rather
`.trim().split(/\s+/));

/** Dropped without comment: they frame a request as being about the person, and add nothing a parser needs. */
const FIRST_PERSON = new Set(["i", "i'm", "im", "i've", "ive", "i'd", "id", "i'll", "me", "my", "mine", "myself", "we", "our", "us", "ours"]);

/** A clause's remainder after one of these is the student's reason, which is theirs to keep. */
const REASON = new Set(["because", "since", "cause", "cuz", "coz", "bc", "due"]);

const NUMBER = /^\d{1,2}$/;
const TIME = /^(\d{1,2})(?::([0-5]\d))?(am|pm|a|p)$/;
const RANGE = /^(\d{1,2})-(\d{1,2})$/;
const COURSE_NUMBER = /^\d{1,3}[a-z]{0,4}$/;

export interface OutboundVocab {
  /** Lower-case words that may be sent. */
  lexicon: ReadonlySet<string>;
  /** Lower-case subject codes, "cse". */
  subjects: ReadonlySet<string>;
  /** Catalog course codes as written, "CSE 11". */
  courses: ReadonlySet<string>;
}

const asciiWords = (text: string) => (text.toLowerCase().match(/[a-z]+(?:[-'][a-z]+)*/g) ?? []);

/**
 * The lexicon for this dataset: planning words, plus the public words of GE
 * area and Warren program names and subject codes and names. Built from the
 * dataset on both sides of the boundary, so browser and server agree.
 */
export function outboundVocab(input: {
  subjects: { code: string; name?: string }[];
  areas?: { area: string }[];
  courses?: Iterable<string>;
}): OutboundVocab {
  const lexicon = new Set(PLANNING);
  const add = (text: string | undefined) => { for (const w of asciiWords(text ?? "")) if (w.length > 1) lexicon.add(w); };
  for (const s of input.subjects) add(s.name);
  for (const a of input.areas ?? []) add(a.area);
  for (const p of WARREN_PROGRAMS) add(p.name);
  for (const w of FIRST_PERSON) lexicon.delete(w);
  return {
    lexicon,
    subjects: new Set(input.subjects.map((s) => s.code.toLowerCase())),
    courses: new Set(input.courses ?? []),
  };
}

export interface CanonicalRequest {
  /** What may be sent: canonical tokens only, clauses joined by " | ". */
  text: string;
  /** Pieces of the request kept on this device, as typed — for the student's eyes only, never sent or logged. */
  withheld: string[];
  /** Whether anything beyond glue is left to interpret. */
  meaningful: boolean;
  /** Mostly written in a script the planner does not read. */
  unsupportedLanguage: boolean;
}

/** ASCII fold: compatibility forms and accents go, invisible format characters go. */
function fold(text: string): string {
  return text.normalize("NFKD").replace(/\p{M}+/gu, "").replace(/\p{Cf}+/gu, "");
}

/** "10", "10am", "3:30pm", "12-16": a canonical spelling, or null. */
function canonicalNumber(token: string): string | null {
  if (NUMBER.test(token)) return String(Number(token));
  const t = TIME.exec(token);
  if (t) {
    const h = Number(t[1]);
    if (h < 1 || h > 12) return null;
    return `${h}${t[2] ? `:${t[2]}` : ""}${t[3].startsWith("a") ? "am" : "pm"}`;
  }
  const r = RANGE.exec(token);
  if (r) return `${Number(r[1])}-${Number(r[2])}`;
  return null;
}

/** Builds the request the model may see; see the module comment. */
export function canonicalRequest(input: string, vocab: OutboundVocab): CanonicalRequest {
  const letters = input.match(/\p{L}/gu) ?? [];
  const nonLatin = letters.filter((ch) => !/[a-z]/i.test(fold(ch))).length;
  const unsupportedLanguage = letters.length > 0 && nonLatin / letters.length > 0.3;

  const withheld: string[] = [];
  const clauses: string[] = [];
  let meaningful = false;

  // Clauses are split on the original punctuation; "a.m." is not a clause end.
  const parts = fold(input).replace(/\b([ap])\.m\./gi, "$1m").split(/[.,;:!?\n|]+/);
  for (const part of parts) {
    const raw = part.trim().split(/\s+/).filter(Boolean);
    const out: string[] = [];
    let reason = false;
    for (let i = 0; i < raw.length; i++) {
      if (reason) { withheld.push(raw[i]); continue; }
      const piece = raw[i];
      // A piece with anything outside plain ASCII after folding is never emitted.
      if (/[^\x20-\x7e]/.test(piece)) { withheld.push(piece); continue; }
      const token = piece.toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "");
      if (!token) continue;
      if (REASON.has(token)) { reason = true; withheld.push(piece); continue; }
      if (FIRST_PERSON.has(token)) continue;
      // A course code: subject code then number, emitted as the catalog writes it.
      if (vocab.subjects.has(token) && i + 1 < raw.length) {
        const num = raw[i + 1].toLowerCase().replace(/[^a-z0-9]+$/g, "");
        const code = `${token.toUpperCase()} ${num.toUpperCase()}`;
        if (COURSE_NUMBER.test(num) && vocab.courses.has(code)) {
          out.push(code);
          meaningful = true;
          i++;
          continue;
        }
      }
      const glued = /^([a-z]{2,5})(\d{1,3}[a-z]{0,4})$/.exec(token);
      if (glued && vocab.courses.has(`${glued[1].toUpperCase()} ${glued[2].toUpperCase()}`)) {
        out.push(`${glued[1].toUpperCase()} ${glued[2].toUpperCase()}`);
        meaningful = true;
        continue;
      }
      if (vocab.subjects.has(token)) { out.push(token); meaningful = true; continue; }
      // "10 am" is one time, written the way a time is: "10am".
      const next = raw[i + 1]?.toLowerCase().replace(/[^a-z]+$/g, "");
      if (NUMBER.test(token) && (next === "am" || next === "pm")) {
        const time = canonicalNumber(`${token}${next}`);
        if (time) { out.push(time); meaningful = true; i++; continue; }
      }
      const n = canonicalNumber(token);
      if (n) { out.push(n); meaningful = true; continue; }
      if (vocab.lexicon.has(token)) {
        out.push(token);
        if (!GLUE.has(token)) meaningful = true;
        continue;
      }
      withheld.push(piece);
    }
    if (out.length) clauses.push(out.join(" "));
  }
  return { text: clauses.join(" | "), withheld, meaningful: meaningful && !unsupportedLanguage, unsupportedLanguage };
}

/**
 * The server's side: true only when `text` is already in canonical form —
 * building it again changes nothing and keeps nothing back.
 */
export function isCanonicalRequest(text: string, vocab: OutboundVocab): boolean {
  if (!text || /[^\x20-\x7e]/.test(text)) return false;
  const again = canonicalRequest(text, vocab);
  return again.withheld.length === 0 && again.text === text;
}
