/**
 * Telling every open view that the saved Academic History changed.
 *
 * The planner reads the history once when it opens. After a save or delete
 * on /import, in this tab or another, it has to read it again, or the 4-year
 * plan and degree progress go on showing the record as it was. Only a time
 * stamp travels: the record itself is fetched again from the server.
 */

/** Same tab: a window event. */
export const HISTORY_EVENT = "ucsdplans-history-changed";
/** Other tabs: a localStorage key whose change fires their `storage` event. */
export const HISTORY_KEY = "ucsdplans-history-rev";

export function announceHistoryChange(): void {
  try {
    window.dispatchEvent(new Event(HISTORY_EVENT));
    localStorage.setItem(HISTORY_KEY, String(Date.now()));
  } catch {
    /* storage can be off; the same-tab event has already gone out */
  }
}

/** Calls `onChange` whenever the history may have changed, until the returned function is called. */
export function onHistoryChange(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => { if (e.key === HISTORY_KEY) onChange(); };
  const onVisible = () => { if (document.visibilityState === "visible") onChange(); };
  window.addEventListener(HISTORY_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    window.removeEventListener(HISTORY_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
