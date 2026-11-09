/**
 * Course codes as UCSD's systems print them, and the catalog key each means.
 *
 * TSS writes "BIEB-102" and "WCWP-010B"; TritonLink wrote "CSE 11"; a narrow
 * table can wrap "ECON-" onto one line and "110B" onto the next. All of them
 * are read the same way. The leading zero in "010B" is not dropped on
 * reflex: the catalog really has "MAE 02". A code becomes the catalog's only
 * when the catalog has it, exactly or without the zeros, and the source's
 * own spelling is kept beside it.
 */

/**
 * No UCSD subject is a bare Roman numeral, and one was once read as a
 * subject in "Calculus II 6.00".
 */
const ROMAN = /^(?:I{1,3}|IV|V|VI{1,3}|IX|X)$/;

const WHOLE = /^([A-Z]{2,5})\s*[-‐–]?\s*(\d{1,3}[A-Z]{0,3})$/;
const SUBJECT_ONLY = /^([A-Z]{2,5})\s*[-‐–]?$/;
const NUMBER_ONLY = /^(\d{1,3}[A-Z]{0,3})$/;

export interface CodeParts {
  subject: string;
  number: string;
}

/** "BIEB-102", "ECON 110B", "WCWP-010B" -> its parts; null for anything else. */
export function splitCode(text: string): CodeParts | null {
  const m = WHOLE.exec(String(text ?? "").trim());
  if (!m || ROMAN.test(m[1])) return null;
  return { subject: m[1], number: m[2] };
}

/** "ECON-" or "ECON" on its own: the first half of a wrapped code. */
export function subjectFragment(text: string): string | null {
  const m = SUBJECT_ONLY.exec(String(text ?? "").trim());
  return m && !ROMAN.test(m[1]) ? m[1] : null;
}

/** "110B" on its own: the second half of a wrapped code. */
export function numberFragment(text: string): string | null {
  const m = NUMBER_ONLY.exec(String(text ?? "").trim());
  return m ? m[1] : null;
}

/** "CSE 11" from its parts. */
export const joinCode = (p: CodeParts) => `${p.subject} ${p.number}`;

export interface Resolved {
  /** The catalog's key, or the source's code when the catalog has neither form. */
  code: string;
  number: string;
  matched: boolean;
}

/**
 * The catalog key a printed code means: the code as printed when the catalog
 * has it ("MAE 02"), else without leading zeros when the catalog has that
 * ("WCWP 010B" -> "WCWP 10B"), else the code as printed, unmatched.
 */
export function resolveCode(parts: CodeParts, has: ((code: string) => boolean) | null): Resolved {
  const exact = joinCode(parts);
  if (!has) return { code: exact, number: parts.number, matched: false };
  if (has(exact)) return { code: exact, number: parts.number, matched: true };
  const stripped = parts.number.replace(/^0+(?=\d)/, "");
  if (stripped !== parts.number) {
    const alt = `${parts.subject} ${stripped}`;
    if (has(alt)) return { code: alt, number: stripped, matched: true };
  }
  return { code: exact, number: parts.number, matched: false };
}
