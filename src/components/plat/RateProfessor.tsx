"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Star, Trash2 } from "lucide-react";
import { ratingKey, useTermRatings } from "./useTermRatings";

const SCALE = [1, 2, 3, 4, 5] as const;

const QUALITY_WORD: Record<number, string> = {
  1: "Awful", 2: "Poor", 3: "Fine", 4: "Good", 5: "Excellent",
};
const DIFFICULTY_WORD: Record<number, string> = {
  1: "Very easy", 2: "Easy", 3: "Average", 4: "Hard", 5: "Very hard",
};

/**
 * A RateMyProfessors-style verdict, scoped to one instructor teaching one course
 * in one term — the point being that the same professor can be worth taking in
 * Fall and worth avoiding in Winter, which a single lifetime score hides.
 *
 * Saved to this browser only. There is no backend to pool ratings into a shared
 * average, so the copy says "your rating" throughout and never implies a crowd.
 */
export default function RateProfessor({
  term, termName, code, instructor, onClose,
}: {
  term: string;
  termName: string;
  code: string;
  instructor: string;
  onClose: () => void;
}) {
  const { ratings, save, clear } = useTermRatings();
  const key = ratingKey(term, code, instructor);
  const saved = ratings[key];

  // Draft state, seeded from whatever is already stored. The call site gives this
  // component a React key per instructor, so switching rows reseeds the draft.
  const [quality, setQuality] = useState(saved?.quality ?? 0);
  const [difficulty, setDifficulty] = useState(saved?.difficulty ?? 0);
  const [again, setAgain] = useState<boolean | null>(saved?.again ?? null);
  const [justSaved, setJustSaved] = useState(false);

  // Clearing the "Saved" flash on unmount avoids setState on a dead component.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const submit = () => {
    if (quality < 1) return;
    save(key, { quality, difficulty, again });
    setJustSaved(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setJustSaved(false), 2000);
  };

  return (
    <div className="border-t border-gray-100 bg-gray-50/70 px-3 py-4 dark:border-white/5 dark:bg-white/[0.03] sm:pl-14">
      <p className="text-xs font-semibold">
        Rate {instructor}
        <span className="font-normal text-gray-500 dark:text-gray-400"> · {code} · {termName}</span>
      </p>

      <fieldset className="mt-3">
        <legend className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
          Overall quality
        </legend>
        <div className="mt-1.5 flex items-center gap-1">
          {SCALE.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setQuality(n)}
              aria-pressed={quality === n}
              aria-label={`${n} out of 5 — ${QUALITY_WORD[n]}`}
              className="rounded p-0.5 transition hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1B2C4F] dark:focus-visible:ring-[#FFC72C]"
            >
              <Star
                className={`h-6 w-6 ${
                  n <= quality
                    ? "fill-[#FFC72C] text-[#FFC72C]"
                    : "fill-transparent text-gray-300 dark:text-gray-600"
                }`}
              />
            </button>
          ))}
          <span className="ml-2 text-xs font-medium text-gray-500 dark:text-gray-400">
            {quality > 0 ? QUALITY_WORD[quality] : "Pick a rating"}
          </span>
        </div>
      </fieldset>

      <fieldset className="mt-4">
        <legend className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
          Difficulty <span className="text-gray-400">(optional)</span>
        </legend>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {SCALE.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setDifficulty(difficulty === n ? 0 : n)}
              aria-pressed={difficulty === n}
              className={`rounded-md border px-2.5 py-1 text-xs font-medium transition ${
                difficulty === n
                  ? "border-[#1B2C4F] bg-[#1B2C4F] text-white dark:border-[#FFC72C] dark:bg-[#FFC72C] dark:text-[#1B2C4F]"
                  : "border-gray-200 bg-white text-gray-600 hover:border-gray-400 dark:border-white/10 dark:bg-white/5 dark:text-gray-300"
              }`}
            >
              {DIFFICULTY_WORD[n]}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="mt-4">
        <legend className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
          Would you take them again? <span className="text-gray-400">(optional)</span>
        </legend>
        <div className="mt-1.5 flex items-center gap-1.5">
          {([true, false] as const).map((v) => (
            <button
              key={String(v)}
              type="button"
              onClick={() => setAgain(again === v ? null : v)}
              aria-pressed={again === v}
              className={`rounded-md border px-3 py-1 text-xs font-medium transition ${
                again === v
                  ? "border-[#1B2C4F] bg-[#1B2C4F] text-white dark:border-[#FFC72C] dark:bg-[#FFC72C] dark:text-[#1B2C4F]"
                  : "border-gray-200 bg-white text-gray-600 hover:border-gray-400 dark:border-white/10 dark:bg-white/5 dark:text-gray-300"
              }`}
            >
              {v ? "Yes" : "No"}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={quality < 1}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#1B2C4F] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#24406e] disabled:cursor-not-allowed disabled:opacity-40 dark:bg-[#FFC72C] dark:text-[#1B2C4F] dark:hover:bg-[#ffd450]"
        >
          {justSaved ? <><Check className="h-3.5 w-3.5" />Saved</> : saved ? "Update rating" : "Save rating"}
        </button>

        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-gray-500 transition hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/10"
        >
          Close
        </button>

        {saved && (
          <button
            type="button"
            onClick={() => { clear(key); setQuality(0); setDifficulty(0); setAgain(null); setJustSaved(false); }}
            className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-gray-400 transition hover:text-red-600 dark:hover:text-red-400"
          >
            <Trash2 className="h-3.5 w-3.5" />Remove
          </button>
        )}
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-gray-400 dark:text-gray-500">
        Saved in this browser only — your ratings are not published or shared, and
        they do not affect the RateMyProfessors score shown above.
      </p>
    </div>
  );
}
