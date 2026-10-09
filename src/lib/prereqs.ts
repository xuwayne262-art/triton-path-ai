/**
 * Reading course codes out of prerequisite sentences.
 *
 * The rule matches the data build's (scripts/build-plat-data.mjs, which works
 * out "Leads to" from it); a test over the real dataset holds the two to the
 * same answers.
 *
 * A bare number continues the subject before it when "or", "and", a comma or
 * a slash joins it to a code — "CHEM 6A or 6AH", "MATH 10C or 20C or 31BH" —
 * but not in "a score of 5", where nothing joins it. "20A-B" names 20A and 20B.
 */

export interface PrereqSegment {
  text: string;
  /** Present when this piece of text names a course. */
  code?: string;
}

const CODE = /\b([A-Z]{2,5}) ?(\d{1,3}[A-Z]{0,3})((?:-[A-Z]{1,2}\b)*)/g;
const MORE = /^\s*(?:,|\/|\bor\b|\band\b|,\s*or\b|,\s*and\b)\s*(\d{1,3}[A-Z]{0,3})\b(?!\s*(?:units?|years?|quarters?|%|or more|\())/;

/** The sentence cut into plain text and the course codes it names, in order. */
export function prereqSegments(text: string | null | undefined): PrereqSegment[] {
  if (!text) return [];
  const src = String(text).replace(/[–—]/g, "-");
  const out: PrereqSegment[] = [];
  let at = 0;
  const plain = (to: number) => {
    if (to > at) out.push({ text: text.slice(at, to) });
    at = to;
  };

  for (const m of src.matchAll(CODE)) {
    const start = m.index ?? 0;
    if (start < at) continue;
    const [whole, sub, num, tail] = m;
    const digits = num.replace(/[A-Z]+$/, "");
    plain(start);
    out.push({ text: text.slice(start, start + whole.length - tail.length), code: `${sub} ${num}` });
    at = start + whole.length - tail.length;
    // "-B-C" after a code continues the sequence on the same digits.
    let pos = at;
    for (const part of tail.split("-").filter(Boolean)) {
      out.push({ text: text.slice(pos, pos + 1) });
      out.push({ text: text.slice(pos + 1, pos + 1 + part.length), code: `${sub} ${digits}${part}` });
      pos += 1 + part.length;
    }
    at = pos;
    // Bare numbers joined to it by "or", "and", "," or "/".
    let rest = src.slice(at);
    for (let next = MORE.exec(rest); next; next = MORE.exec(rest)) {
      const numStart = at + next[0].length - next[1].length;
      plain(numStart);
      out.push({ text: text.slice(numStart, numStart + next[1].length), code: `${sub} ${next[1]}` });
      at = numStart + next[1].length;
      rest = src.slice(at);
    }
  }
  plain(text.length);
  return out;
}

/** Every course code the sentence names, once each, in order of first mention. */
export function prereqCodes(text: string | null | undefined): string[] {
  const seen = new Set<string>();
  for (const s of prereqSegments(text)) if (s.code) seen.add(s.code);
  return [...seen];
}
