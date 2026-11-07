/**
 * Whether the quarter asked for is the quarter loaded.
 *
 * The Planner keeps the last quarter it loaded in memory while the next one's
 * files arrive. Switching to Winter and then failing to fetch it used to
 * leave Fall's schedule on screen under the Winter picker, with "Fit my
 * sections" and "Add to calendar" still working on it. Only "ready" may show
 * or change a schedule; "loading" and "failed" name the quarter asked for.
 */

export type TermStatus = "loading" | "ready" | "failed";

/**
 * @param requested the quarter the page asks for (address, picker, stored choice); null before the browser has said
 * @param loaded    the quarter whose files are in memory; "" before any arrived
 * @param failed    the quarter whose files last failed to load, until retried
 */
export function termStatusOf(requested: string | null, loaded: string, failed: string | null): TermStatus {
  if (!requested) return "loading";
  if (loaded === requested) return "ready";
  return failed === requested ? "failed" : "loading";
}
