"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import SearchResults, { optionId, resultHrefs, type Combined } from "./SearchResults";
import { noteRecent } from "./useRecent";
import {
  loadIndex, loadProfessors, searchCourses, searchProfessors,
  type CourseRow, type ProfessorRecord,
} from "@/lib/plat";
import { MIN_QUERY, moveActive, resultSummary } from "@/lib/combobox";

/**
 * Search across courses and instructors, as a combobox a keyboard and a
 * screen reader can both drive: the field is the combobox, the results a
 * listbox of grouped options it points at, and the count is announced as it
 * changes (lib/combobox.ts has the rules). The site bar and the home page
 * share it, so the two behave alike.
 */
export default function SearchCombobox({
  variant,
  label = "Search courses and professors",
  placeholder,
  shortPlaceholder,
  value,
  onValueChange,
  className = "",
}: {
  variant: "bar" | "hero";
  label?: string;
  placeholder: string;
  /** Shown instead of `placeholder` wherever the box is too narrow to show it whole. */
  shortPlaceholder?: string;
  /** Controlled text, for a page that fills it in (the home page's recent searches). */
  value?: string;
  onValueChange?: (q: string) => void;
  className?: string;
}) {
  const router = useRouter();
  const id = useId();
  const listId = `${id}-list`;
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [profs, setProfs] = useState<ProfessorRecord[]>([]);
  const [own, setOwn] = useState("");
  const q = value ?? own;
  const setQ = (v: string) => (onValueChange ? onValueChange(v) : setOwn(v));
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // The course index and the 220KB professor list are fetched when the search
  // is about to be used (pointer over it, focus, or text in it), not on every
  // page load: most pages never search, and both files are cached once loaded.
  const [wanted, setWanted] = useState(false);
  const want = () => { if (!wanted) setWanted(true); };
  const searching = wanted || q.trim().length > 0;
  useEffect(() => {
    if (!searching) return;
    loadIndex().then((d) => setCourses(d.courses)).catch(() => {});
    loadProfessors().then((d) => setProfs(d.professors)).catch(() => {});
  }, [searching]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // A prompt cut off mid-word reads as a bug, so where the full one does not
  // fit the box (a phone, or a laptop bar beside five links) it says the short
  // one. The field's accessible name is the full label either way.
  const [fits, setFits] = useState(true);
  useEffect(() => {
    const input = inputRef.current;
    if (!shortPlaceholder || !input || typeof ResizeObserver === "undefined") return;
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) return;
    const measure = new ResizeObserver(() => {
      const cs = getComputedStyle(input);
      ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const room = input.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      setFits(ctx.measureText(placeholder).width <= room);
    });
    measure.observe(input);
    return () => measure.disconnect();
  }, [placeholder, shortPlaceholder]);

  const results = useMemo<Combined>(
    () => ({ profs: searchProfessors(profs, q, 4), courses: searchCourses(courses, q, 6) }),
    [courses, profs, q],
  );
  const hrefs = useMemo(() => resultHrefs(results), [results]);
  const loaded = courses.length > 0;

  // A new query starts over at the first result.
  const [activeFor, setActiveFor] = useState(q);
  if (activeFor !== q) {
    setActiveFor(q);
    setActive(hrefs.length ? 0 : -1);
  }

  const shown = open && q.trim().length >= MIN_QUERY;

  /**
   * The results panel's place, worked out from the field's. In the site bar
   * the field shares a row with the nav and can be ~250px wide, and a panel
   * that inherited that cut "Joseph Gibbs Politz" and course titles short. So
   * on a wide screen the panel is 440–560px whatever the field, and on a phone
   * it spans the screen less a 16px gutter; either way it is kept inside the
   * viewport's edges.
   */
  const [panel, setPanel] = useState<{ left: number; width: number } | null>(null);
  useEffect(() => {
    if (!shown) return;
    const place = () => {
      const box = boxRef.current?.getBoundingClientRect();
      if (!box) return;
      const vw = document.documentElement.clientWidth;
      const gutter = 16;
      const room = vw - gutter * 2;
      const width = vw < 640 ? room : Math.min(room, Math.max(box.width, Math.min(560, Math.max(440, box.width))));
      // Start under the field, then slide left just enough to stay on screen.
      const left = Math.max(gutter, Math.min(box.left, vw - gutter - width)) - box.left;
      setPanel({ left, width });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [shown]);
  const go = (href: string | undefined) => {
    if (!href) return;
    // Kept in this browser so the home page can offer the search again.
    if (q.trim().length >= MIN_QUERY) noteRecent({ kind: "search", key: q.trim(), label: q.trim(), href: "/" });
    setOpen(false);
    if (variant === "bar") setQ("");
    router.push(href);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp" || ((e.key === "Home" || e.key === "End") && shown)) {
      e.preventDefault();
      setOpen(true);
      setActive((i) => moveActive(e.key as "ArrowDown", i, hrefs.length));
    } else if (e.key === "Enter") {
      // Enter that confirms an IME composition (Chinese, Japanese, Korean input) is not a choice.
      if (e.nativeEvent.isComposing || e.keyCode === 229) return;
      if (shown && active >= 0) { e.preventDefault(); go(hrefs[active]); }
    } else if (e.key === "Escape") {
      // First Escape closes the list; a second one clears the field.
      if (shown) setOpen(false);
      else setQ("");
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  };

  const hero = variant === "hero";
  return (
    <div ref={boxRef} className={`relative ${className}`} onPointerEnter={want} onTouchStart={want}>
      <Search aria-hidden className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-gray-500 ${hero ? "left-3.5 h-4 w-4" : "left-3 h-4 w-4"}`} />
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-label={label}
        aria-expanded={shown}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={shown && active >= 0 ? optionId(id, active) : undefined}
        autoComplete="off"
        spellCheck={false}
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); want(); }}
        onFocus={() => { setOpen(true); want(); }}
        onKeyDown={onKeyDown}
        placeholder={shortPlaceholder && !fits ? shortPlaceholder : placeholder}
        className={hero
          ? "h-12 w-full rounded-xl border border-gray-300 bg-white pl-10 pr-10 text-[15px] shadow-sm outline-none transition placeholder:text-gray-500 focus:border-[#1B2C4F] focus:ring-2 focus:ring-[#1B2C4F]/15 dark:border-white/15 dark:bg-white/5 dark:text-gray-100 dark:placeholder:text-gray-400 dark:focus:border-[#FFC72C] dark:focus:ring-[#FFC72C]/20"
          : "w-full rounded-full border border-gray-200 bg-gray-50 py-2 pl-9 pr-8 text-sm outline-none transition placeholder:text-gray-500 focus:border-[#182B49] focus:bg-white focus:ring-2 focus:ring-[#182B49]/15 dark:border-white/10 dark:bg-white/5 dark:text-gray-100 dark:placeholder:text-gray-400 dark:focus:border-[#FFCD00] dark:focus:bg-white/10"}
      />
      {q && (
        <button
          type="button"
          onClick={() => { setQ(""); inputRef.current?.focus(); }}
          aria-label="Clear search"
          className={`absolute top-1/2 -translate-y-1/2 rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-white/10 dark:hover:text-white ${hero ? "right-3" : "right-2"}`}
        >
          <X aria-hidden className="h-3.5 w-3.5" />
        </button>
      )}

      <div
        style={panel ? { left: panel.left, width: panel.width } : undefined}
        className={`absolute top-full z-50 mt-2 max-h-[min(26rem,calc(100dvh-6rem))] overflow-y-auto overscroll-contain rounded-xl border border-gray-200 bg-white p-1 shadow-xl dark:border-white/10 dark:bg-[#101a2b] ${panel ? "" : "left-0 right-0"} ${shown ? "" : "hidden"}`}
      >
        {/* Only options live in the listbox; its empty and loading states sit beside it. */}
        <div id={listId} role="listbox" aria-label="Search results">
          {shown && loaded && hrefs.length > 0 && (
            <SearchResults results={results} query={q} active={active} onHover={setActive} onPick={go} idPrefix={id} />
          )}
        </div>
        {shown && !loaded && <p className="px-4 py-6 text-center text-sm text-gray-600 dark:text-gray-400">Loading courses…</p>}
        {shown && loaded && hrefs.length === 0 && (
          <SearchResults results={results} query={q} active={-1} onHover={setActive} onPick={go} idPrefix={id} />
        )}
      </div>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {shown && loaded ? resultSummary(results.profs.length, results.courses.length) : ""}
      </p>
    </div>
  );
}
