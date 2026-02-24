import type { CourseCategory } from "@/components/triton/types";

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface DegreeRequirement {
  /** Must match the `category` field stamped on Course objects */
  category: CourseCategory;
  label: string;
  targetUnits: number;
}

export interface RequirementGroup {
  /** Stable key used for React rendering */
  id: string;
  /** Human-readable section header */
  groupLabel: string;
  /** Tailwind bg-* class applied to every progress bar in this group */
  color: string;
  requirements: DegreeRequirement[];
}

// ── Degree Audit: Warren College · Business Economics B.S. · General Biology Minor
// Source: UCSD General Catalog 2025–2026 ─────────────────────────────────────

export const REQUIREMENT_GROUPS: RequirementGroup[] = [
  // 1 ── Major ──────────────────────────────────────────────────────────────
  {
    id: "major",
    groupLabel: "Major — Business Economics",
    color: "bg-blue-500",
    requirements: [
      {
        category: "Lower Division Econ/Math",
        label: "Lower Div Econ/Math",
        targetUnits: 24,
      },
      {
        category: "Upper Division Core",
        label: "Upper Division Core",
        targetUnits: 36,
      },
      {
        category: "Major Electives",
        label: "Major Electives",
        targetUnits: 12,
      },
    ],
  },

  // 2 ── College ─────────────────────────────────────────────────────────────
  {
    id: "college",
    groupLabel: "College — Warren GEs",
    color: "bg-amber-500",
    requirements: [
      {
        category: "Warren Writing",
        label: "Warren Writing",
        targetUnits: 8,
      },
      {
        category: "Ethics & Society",
        label: "Ethics & Society",
        targetUnits: 8,
      },
      {
        category: "PofC: Biology",
        label: "PofC: Biology",
        targetUnits: 24,
      },
      {
        category: "PofC: Humanities",
        label: "PofC: Humanities",
        targetUnits: 24,
      },
    ],
  },

  // 3 ── Minor ───────────────────────────────────────────────────────────────
  {
    id: "minor",
    groupLabel: "Minor — General Biology",
    color: "bg-emerald-500",
    requirements: [
      {
        category: "Minor Lower Div",
        label: "Minor Lower Div",
        targetUnits: 8,
      },
      {
        category: "Minor Upper Div",
        label: "Minor Upper Div",
        targetUnits: 20,
      },
    ],
  },
];
