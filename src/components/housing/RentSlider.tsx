"use client";

import { useId } from "react";
import { dollars } from "@/lib/housing/listing";
import { RENT_RANGE } from "@/lib/housing/filters";
import s from "./RentSlider.module.css";

/**
 * The most a student would pay a month, dragged rather than typed, so the
 * list narrows as the thumb moves. The far right end is "Any": a place dearer
 * than the scale still shows until someone drags the cap below it.
 */
export default function RentSlider({
  value, onChange, className = "",
}: {
  /** Dollars a month, or null for no cap. */
  value: number | null;
  onChange: (value: number | null) => void;
  className?: string;
}) {
  const id = useId();
  const { min, max, step } = RENT_RANGE;
  const at = value ?? max;
  const pct = ((at - min) / (max - min)) * 100;

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <label htmlFor={id} className="shrink-0 text-xs text-gray-500 dark:text-gray-400">
        Max rent
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={at}
        onChange={(e) => {
          const v = Number(e.target.value);
          onChange(v >= max ? null : v);
        }}
        aria-valuetext={value === null ? "Any rent" : `Up to ${dollars(value)} a month`}
        className={s.slider}
        style={{ "--pct": `${pct}%` } as React.CSSProperties}
      />
      <output htmlFor={id} className="w-[4.5rem] shrink-0 text-right text-xs font-semibold tabular-nums">
        {value === null ? "Any" : `${dollars(value)}/mo`}
      </output>
    </div>
  );
}
