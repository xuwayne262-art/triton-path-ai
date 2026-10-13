/**
 * The search box's keyboard and its announcement, kept apart from the
 * component so both can be tested without a browser.
 *
 * The box follows the WAI-ARIA combobox pattern: focus stays in the text
 * field while the arrow keys move an active option, Enter opens it, Escape
 * closes the list (and a second Escape clears the field), Home and End jump
 * to the ends — and a screen reader is told how many results there are.
 */

export type ComboKey = "ArrowDown" | "ArrowUp" | "Home" | "End";

/** The active option after a key, in a list of `count`; -1 means none is active. */
export function moveActive(key: ComboKey, active: number, count: number): number {
  if (count <= 0) return -1;
  switch (key) {
    case "ArrowDown": return active < 0 ? 0 : Math.min(active + 1, count - 1);
    case "ArrowUp": return active <= 0 ? 0 : active - 1;
    case "Home": return 0;
    case "End": return count - 1;
  }
}

/** "2 professors and 6 courses", "1 course", "No matches" — said once per change, politely. */
export function resultSummary(profs: number, courses: number): string {
  const part = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const parts = [
    ...(profs ? [part(profs, "professor", "professors")] : []),
    ...(courses ? [part(courses, "course", "courses")] : []),
  ];
  if (!parts.length) return "No matches";
  return `${parts.join(" and ")}. Use the up and down arrows to choose, Enter to open.`;
}

/** The shortest query worth searching: one letter matches half the catalog. */
export const MIN_QUERY = 2;
