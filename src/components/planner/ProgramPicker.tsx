"use client";

import { useId, useMemo, useState } from "react";
import { Popover } from "radix-ui";
import { Check, ChevronDown, GraduationCap, Search } from "lucide-react";
import { COLLEGES, type College } from "@/components/triton/types";
import { UCSD_MAJORS, UCSD_MINORS } from "@/data/ucsdMajorsMinors";

/**
 * Major, minor and college, behind one button.
 *
 * They were three always-open controls across the top of the planner — the
 * minor's placeholder cut off at "— None / Select a" — for choices a student
 * makes once and then plans around for years. They still decide what counts
 * toward a requirement (the colours) and what is recommended, so the button
 * says what is chosen; changing it is one click away.
 */
export default function ProgramPicker({
  major, minor, college, onMajor, onMinor, onCollege,
}: {
  major: string;
  minor: string;
  college: College | null;
  onMajor: (m: string) => void;
  onMinor: (m: string) => void;
  onCollege: (c: College | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const summary = [major || "Choose a major", minor !== "None" ? `${minor} minor` : "", college ?? ""]
    .filter(Boolean)
    .join(" · ");

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="flex min-w-0 max-w-[26rem] items-center gap-2 rounded-lg border border-gray-200 px-2 py-1.5 text-left text-sm transition hover:border-gray-300 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFCD00] dark:border-white/15 dark:hover:border-white/25 dark:hover:bg-white/5 sm:px-2.5"
          aria-label={`Your program: ${summary}. Change it`}
        >
          <GraduationCap className="h-4 w-4 shrink-0 text-[#182B49] dark:text-[#FFCD00]" />
          {/* On a phone the header has room for the icon; the popover says the rest. */}
          <span className="hidden min-w-0 truncate font-medium md:inline">{summary}</span>
          <ChevronDown className="hidden h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400 min-[400px]:block" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          collisionPadding={12}
          // Open on the whole picture, not on the major's search box: focusing
          // it would unroll a 150-item list over the minor and college.
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            (e.currentTarget as HTMLElement | null)?.focus();
          }}
          tabIndex={-1}
          className="z-50 w-[min(22rem,calc(100vw-1.5rem))] rounded-xl border border-gray-200 bg-white p-4 text-gray-900 shadow-xl outline-none dark:border-white/10 dark:bg-gray-800 dark:text-gray-100"
        >
          <p className="text-sm font-bold">Your program</p>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            Decides which courses count toward a requirement, and what&rsquo;s recommended.
          </p>

          <div className="mt-3 space-y-3">
            <SearchList label="Major" value={major} options={UCSD_MAJORS} placeholder="Search majors" onPick={onMajor} />
            <SearchList
              label="Minor"
              value={minor}
              options={UCSD_MINORS}
              placeholder="Search minors"
              onPick={onMinor}
              noneLabel="No minor"
            />
            <fieldset>
              <legend className="mb-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300">College</legend>
              <div className="grid grid-cols-3 gap-1.5">
                {[null, ...COLLEGES].map((c) => {
                  const on = college === c;
                  return (
                    <button
                      key={c ?? "none"}
                      type="button"
                      aria-pressed={on}
                      onClick={() => onCollege(c)}
                      className={`rounded-lg border px-2 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFCD00] ${
                        on
                          ? "border-[#182B49] bg-[#182B49] text-white dark:border-[#FFCD00] dark:bg-[#FFCD00] dark:text-[#182B49]"
                          : "border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-white/10 dark:text-gray-200 dark:hover:bg-white/5"
                      }`}
                    >
                      {c ?? "None yet"}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

const display = (v: string, noneLabel?: string) => (v === "None" && noneLabel ? noneLabel : v);

/** A labelled, filterable single choice from a long list. */
function SearchList({
  label, value, options, placeholder, onPick, noneLabel,
}: {
  label: string;
  value: string;
  options: string[];
  placeholder: string;
  onPick: (v: string) => void;
  /** The option spelled "None" in the data, shown as this. */
  noneLabel?: string;
}) {
  const id = useId();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const shown = (v: string) => display(v, noneLabel);

  const hits = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = options.filter(Boolean);
    return needle ? list.filter((o) => display(o, noneLabel).toLowerCase().includes(needle)) : list;
  }, [q, options, noneLabel]);

  const pick = (v: string | undefined) => {
    if (!v) return;
    onPick(v);
    setQ("");
    setOpen(false);
  };

  return (
    <div className="relative">
      <label htmlFor={id} className="mb-1.5 block text-xs font-semibold text-gray-600 dark:text-gray-300">
        {label}
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
        <input
          id={id}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          autoComplete="off"
          placeholder={open ? placeholder : shown(value)}
          value={open ? q : shown(value)}
          onFocus={() => {
            setOpen(true);
            setQ("");
            // Start on what is chosen, so the list opens where you already are.
            setActive(Math.max(0, options.filter(Boolean).indexOf(value)));
          }}
          onBlur={() => setOpen(false)}
          onChange={(e) => { setQ(e.target.value); setActive(0); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, hits.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
            else if (e.key === "Enter") { e.preventDefault(); pick(hits[active]); }
            else if (e.key === "Escape" && open) { e.stopPropagation(); setOpen(false); }
          }}
          className="w-full rounded-lg border border-gray-200 bg-white py-1.5 pl-8 pr-2 text-sm outline-none transition placeholder:text-gray-700 focus:border-[#182B49] focus:ring-1 focus:ring-[#182B49] focus:placeholder:text-gray-400 dark:border-white/15 dark:bg-white/5 dark:placeholder:text-gray-200 dark:focus:border-[#FFCD00] dark:focus:ring-[#FFCD00]"
        />
      </div>
      {open && (
        <ul
          id={`${id}-list`}
          role="listbox"
          aria-label={label}
          className="absolute inset-x-0 top-full z-10 mt-1 max-h-56 list-none overflow-y-auto rounded-lg border border-gray-200 bg-white p-1 shadow-lg dark:border-white/10 dark:bg-gray-800"
        >
          {hits.length === 0 ? (
            <li className="px-2 py-2 text-center text-xs text-gray-500">No matches</li>
          ) : (
            hits.map((o, i) => (
              <li
                key={o}
                role="option"
                aria-selected={o === value}
                onMouseDown={(e) => { e.preventDefault(); pick(o); }}
                onMouseEnter={() => setActive(i)}
                ref={(el) => { if (i === active && el) el.scrollIntoView({ block: "nearest" }); }}
                className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
                  i === active ? "bg-slate-100 dark:bg-white/10" : ""
                } ${o === "None" ? "italic text-gray-500 dark:text-gray-400" : ""}`}
              >
                <span className="min-w-0 flex-1 truncate">{shown(o)}</span>
                {o === value && <Check className="h-3.5 w-3.5 shrink-0 text-[#182B49] dark:text-[#FFCD00]" />}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
