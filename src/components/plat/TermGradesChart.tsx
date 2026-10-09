"use client";

import { useMemo, useState } from "react";
import { termName, termOrder, typicalGrade } from "@/lib/plat";
import { useWidth } from "./useWidth";

/**
 * Each term's average grade, one dot per instructor per term, oldest on the
 * left — the "is this getting harder?" view a single all-time letter hides.
 *
 * Up to three series (the people teaching it now, or the courses a professor
 * teaches most) get a colour each, in the palette's fixed order; everyone
 * else is grey, so the ones that matter stand out rather than eight hues
 * competing. Identity is never colour alone: the legend names every colour,
 * and the list beside the chart holds every value.
 */

export interface TermPoint {
  /** "FA25" */
  term: string;
  /** Who or what the dot belongs to: an instructor on a course page, a course on a professor's. */
  series: string;
  gpa: number;
  /** Percent of the class awarded an A, when published. */
  aRate: number | null;
}

const SLOTS = ["var(--viz-1)", "var(--viz-2)", "var(--viz-3)"];
const HEIGHT = 208;
const PAD = { top: 10, right: 34, bottom: 26, left: 34 };

/** Where in its year a quarter falls, so the axis keeps real time — including years with no data. */
const QUARTER_AT: Record<string, number> = { WI: 0.12, SP: 0.37, S1: 0.55, S2: 0.62, S3: 0.68, SU: 0.6, FA: 0.85 };
function when(term: string): number {
  const m = /^([A-Z][A-Z0-9])(\d{2})$/.exec(term);
  return m ? 2000 + Number(m[2]) + (QUARTER_AT[m[1]] ?? 0.5) : 0;
}

export default function TermGradesChart({
  points,
  highlight,
  otherLabel,
  title,
}: {
  points: TermPoint[];
  /** Series to colour, in slot order; at most three are used. */
  highlight: string[];
  /** What the grey dots are: "Other instructors". */
  otherLabel: string;
  /** Names the chart for screen readers. */
  title: string;
}) {
  const [box, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const colored = useMemo(() => highlight.slice(0, SLOTS.length), [highlight]);
  const colorOf = (series: string) => {
    const i = colored.indexOf(series);
    return i >= 0 ? SLOTS[i] : "var(--viz-muted)";
  };

  const terms = useMemo(
    () => [...new Set(points.map((p) => p.term))].sort((a, b) => termOrder(a) - termOrder(b)),
    [points],
  );
  const lowest = points.length ? Math.min(...points.map((p) => p.gpa)) : 3;
  // Starts on a half point at or below the lowest average, never above 3.0,
  // so a course that grades A− everywhere is not drawn as a cliff.
  const yMin = Math.min(3, Math.floor((lowest - 0.05) * 2) / 2);
  const yMax = 4;

  // Real time along the bottom: the archive publishes nothing for 2018 and
  // 2019, and evenly spaced terms would quietly close that gap.
  const first = terms.length ? Math.floor(when(terms[0])) : 2020;
  const last = terms.length ? Math.floor(when(terms[terms.length - 1])) + 1 : 2021;
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const xAt = (t: number) => PAD.left + ((t - first) / Math.max(1, last - first)) * plotW;
  const x = (term: string) => xAt(when(term));
  const y = (gpa: number) => PAD.top + (1 - (gpa - yMin) / (yMax - yMin)) * plotH;

  const ticks: number[] = [];
  for (let v = yMin; v <= yMax + 1e-9; v += 0.5) ticks.push(+v.toFixed(1));

  // Each year labelled under its middle; on a narrow chart every other one.
  const perYear = plotW / Math.max(1, last - first);
  const every = perYear < 34 ? 2 : 1;
  const yearMarks: number[] = [];
  for (let yr = first; yr < last; yr++) if ((yr - first) % every === 0) yearMarks.push(yr);

  // Grey first, so the coloured dots sit on top.
  const order = points
    .map((p, i) => ({ p, i }))
    .sort((a, b) => Number(colored.includes(a.p.series)) - Number(colored.includes(b.p.series)));

  const hovered = hover != null ? points[hover] : null;
  const hasOthers = points.some((p) => !colored.includes(p.series));

  return (
    <div>
      <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600 dark:text-gray-300" aria-label="Legend">
        {colored.filter((s) => points.some((p) => p.series === s)).map((s) => (
          <li key={s} className="flex items-center gap-1.5">
            <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: colorOf(s) }} />
            {s}
          </li>
        ))}
        {hasOthers && (
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--viz-muted)" }} />
            {otherLabel}
          </li>
        )}
      </ul>

      <div ref={box} className="relative" onMouseLeave={() => setHover(null)}>
        {width > 0 && (
          <svg width={width} height={HEIGHT} role="img" aria-label={title} className="block">
            {ticks.map((v) => (
              <g key={v}>
                <line x1={PAD.left} x2={width - PAD.right} y1={y(v)} y2={y(v)} stroke="var(--viz-grid)" strokeWidth={1} />
                <text x={PAD.left - 6} y={y(v)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--viz-ink-3)" className="tabular-nums">
                  {v.toFixed(1)}
                </text>
                <text x={width - PAD.right + 6} y={y(v)} dy="0.32em" fontSize={11} fill="var(--viz-ink-3)">
                  {typicalGrade(v)?.letter}
                </text>
              </g>
            ))}
            <line
              x1={PAD.left} x2={width - PAD.right} y1={PAD.top + plotH} y2={PAD.top + plotH}
              stroke="var(--viz-axis)" strokeWidth={1}
            />
            {yearMarks.map((yr) => (
              <g key={yr}>
                <line x1={xAt(yr)} x2={xAt(yr)} y1={PAD.top + plotH} y2={PAD.top + plotH + 4} stroke="var(--viz-axis)" strokeWidth={1} />
                <text x={xAt(yr + 0.5)} y={HEIGHT - 8} textAnchor="middle" fontSize={11} fill="var(--viz-ink-3)" className="tabular-nums">
                  {yr}
                </text>
              </g>
            ))}

            {order.map(({ p, i }) => (
              <circle
                key={i}
                cx={x(p.term)}
                cy={y(p.gpa)}
                r={hover === i ? 6 : 4}
                fill={colorOf(p.series)}
                stroke="var(--viz-surface)"
                strokeWidth={2}
              />
            ))}
            {/* Hit areas bigger than the dots, so the pointer need not land dead-centre. */}
            {order.map(({ p, i }) => (
              <circle
                key={`hit-${i}`}
                cx={x(p.term)}
                cy={y(p.gpa)}
                r={12}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
              />
            ))}
          </svg>
        )}

        {hovered && width > 0 && (
          <div
            role="status"
            className="pointer-events-none absolute z-10 w-max max-w-[16rem] -translate-x-1/2 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs shadow-lg dark:border-white/10 dark:bg-[#101a2b]"
            style={{
              left: Math.min(Math.max(x(hovered.term), 70), width - 70),
              top: Math.max(0, y(hovered.gpa) - 64),
            }}
          >
            <p className="font-semibold text-gray-900 dark:text-gray-100">
              {hovered.gpa.toFixed(2)} · {typicalGrade(hovered.gpa)?.letter}
              {hovered.aRate != null && <span className="font-normal text-gray-500 dark:text-gray-400"> · {Math.round(hovered.aRate)}% A</span>}
            </p>
            <p className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
              <span aria-hidden className="h-0.5 w-3 rounded-full" style={{ background: colorOf(hovered.series) }} />
              {hovered.series} · {termName(hovered.term)}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
