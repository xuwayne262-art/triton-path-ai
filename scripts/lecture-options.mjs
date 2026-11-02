/**
 * What a course list needs to say about a course's lecture choices, from its
 * section rows: how many lecture options there are this term, and every
 * instructor teaching one of them.
 *
 * The index used to carry only the first lecture's time and instructor, so a
 * course taught twice by two people read in every list as if one person
 * taught it once (ECON 110B's second lecture was invisible). Shared by
 * build-plat-data.mjs and backfill-lecture-options.mjs so both agree.
 *
 * Tuple positions are fetch-classplanner.mjs's: 0 code, 1 type, 2 days,
 * 3 start, 7 instructor, 10 cancelled.
 */

const isOneOff = (s) => s[1] === "FI" || s[1] === "MI" || /^\d{4}-\d{2}-\d{2}$/.test(s[2] || "");

/** { nl, pp }: lecture options, and the instructors of them other than `shown` — the one the row already names (at most 4). */
export function lectureOptions(sec, shown) {
  const weekly = (sec || []).filter((s) => !isOneOff(s) && s[10] !== 1);
  // The heading kind is the lecture when there is one, else whatever the first meeting is (a seminar, a lab).
  const head = weekly.some((s) => s[1] === "LE") ? "LE" : weekly[0]?.[1];
  if (!head) return { nl: 0, pp: [] };
  const rows = weekly.filter((s) => s[1] === head);
  const codes = new Set(rows.map((s) => s[0]));
  const names = [];
  for (const s of rows) {
    for (const n of String(s[7] || "").split(/\s*;\s*/)) {
      const name = n.trim();
      if (name && !names.includes(name)) names.push(name);
    }
  }
  const others = names.filter((n) => n !== shown);
  return { nl: codes.size, pp: (shown ? others : others.slice(1)).slice(0, 4) };
}
