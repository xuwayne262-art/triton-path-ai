/**
 * Runs `fn` once the browser is idle after the current work, at most
 * `timeout` ms later. For data a page can show without — the campus-wide
 * course index, the professor list — so fetching and parsing it does not
 * compete with the content a student opened the page for. Returns a cancel.
 */
export function afterIdle(fn: () => void, timeout = 1500): () => void {
  if (typeof window === "undefined") return () => {};
  const w = window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };
  if (w.requestIdleCallback) {
    const id = w.requestIdleCallback(fn, { timeout });
    return () => w.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(fn, 200);
  return () => window.clearTimeout(id);
}
