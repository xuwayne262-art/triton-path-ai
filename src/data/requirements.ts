import type { College, CourseCategory } from "@/components/triton/types";

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

// ── Per-college accent colors ─────────────────────────────────────────────────

const COLLEGE_COLORS: Record<College, string> = {
  Warren:  "bg-amber-500",
  Revelle: "bg-blue-600",
  Muir:    "bg-emerald-500",
  Marshall:"bg-red-500",
  ERC:     "bg-violet-500",
  Sixth:   "bg-cyan-500",
  Seventh: "bg-orange-500",
  Eighth:  "bg-rose-500",
};

// ── GE Requirements keyed by college ─────────────────────────────────────────
// Source: UCSD General Catalog 2025–2026

export const COLLEGE_REQUIREMENTS: Record<College, RequirementGroup> = {

  Warren: {
    id: "college-warren",
    groupLabel: "Warren GEs",
    color: COLLEGE_COLORS.Warren,
    requirements: [
      { category: "Warren Writing",   label: "Warren Writing",   targetUnits: 8  },
      { category: "Ethics & Society", label: "Ethics & Society", targetUnits: 8  },
      { category: "PofC 1",           label: "PofC 1",           targetUnits: 24 },
      { category: "PofC 2",           label: "PofC 2",           targetUnits: 24 },
    ],
  },

  Revelle: {
    id: "college-revelle",
    groupLabel: "Revelle GEs",
    color: COLLEGE_COLORS.Revelle,
    requirements: [
      { category: "Humanities (HUM)", label: "Humanities (HUM)", targetUnits: 24 },
      { category: "Math",             label: "Math",             targetUnits: 12 },
      { category: "Science",          label: "Science",          targetUnits: 20 },
      { category: "Social Science",   label: "Social Science",   targetUnits: 8  },
      { category: "Fine Arts",        label: "Fine Arts",        targetUnits: 4  },
      { category: "Language",         label: "Language",         targetUnits: 16 },
    ],
  },

  Muir: {
    id: "college-muir",
    groupLabel: "Muir GEs",
    color: COLLEGE_COLORS.Muir,
    requirements: [
      { category: "Muir Writing (MCWP)",       label: "Muir Writing (MCWP)",       targetUnits: 8  },
      { category: "Social Science Seq",        label: "Social Science Seq",        targetUnits: 12 },
      { category: "Math/Science Seq",          label: "Math/Science Seq",          targetUnits: 12 },
      { category: "Fine Arts/Humanities Seq",  label: "Fine Arts/Humanities Seq",  targetUnits: 12 },
    ],
  },

  Marshall: {
    id: "college-marshall",
    groupLabel: "Marshall GEs",
    color: COLLEGE_COLORS.Marshall,
    requirements: [
      { category: "DOC Sequence",        label: "DOC Sequence",        targetUnits: 12 },
      { category: "Math/Stats",          label: "Math/Stats",          targetUnits: 8  },
      { category: "Natural Science",     label: "Natural Science",     targetUnits: 12 },
      { category: "Humanities/Culture",  label: "Humanities/Culture",  targetUnits: 8  },
      { category: "Fine Arts",           label: "Fine Arts",           targetUnits: 4  },
      { category: "Disciplinary Breadth",label: "Disciplinary Breadth",targetUnits: 16 },
    ],
  },

  ERC: {
    id: "college-erc",
    groupLabel: "ERC GEs",
    color: COLLEGE_COLORS.ERC,
    requirements: [
      { category: "MMW Sequence",    label: "MMW Sequence",    targetUnits: 20 },
      { category: "Quantitative",    label: "Quantitative",    targetUnits: 8  },
      { category: "Natural Science", label: "Natural Science", targetUnits: 8  },
      { category: "Fine Arts",       label: "Fine Arts",       targetUnits: 4  },
      { category: "Language",        label: "Language",        targetUnits: 16 },
      { category: "Regional Spec",   label: "Regional Spec",   targetUnits: 12 },
    ],
  },

  Sixth: {
    id: "college-sixth",
    groupLabel: "Sixth College GEs",
    color: COLLEGE_COLORS.Sixth,
    requirements: [
      { category: "CAT Sequence",  label: "CAT Sequence",  targetUnits: 12 },
      { category: "Info Tech",     label: "Info Tech",     targetUnits: 4  },
      { category: "Social Science",label: "Social Science",targetUnits: 8  },
      { category: "Humanities",    label: "Humanities",    targetUnits: 8  },
      { category: "Science",       label: "Science",       targetUnits: 8  },
      { category: "Math/Logic",    label: "Math/Logic",    targetUnits: 8  },
      { category: "Art",           label: "Art",           targetUnits: 4  },
    ],
  },

  Seventh: {
    id: "college-seventh",
    groupLabel: "Seventh College GEs",
    color: COLLEGE_COLORS.Seventh,
    requirements: [
      { category: "Synthesis (SYN)", label: "Synthesis (SYN)", targetUnits: 12 },
      { category: "Arts",            label: "Arts",            targetUnits: 8  },
      { category: "Humanities",      label: "Humanities",      targetUnits: 8  },
      { category: "Natural Science", label: "Natural Science", targetUnits: 8  },
      { category: "Quantitative",    label: "Quantitative",    targetUnits: 8  },
      { category: "Social Science",  label: "Social Science",  targetUnits: 8  },
    ],
  },

  Eighth: {
    id: "college-eighth",
    groupLabel: "Eighth College GEs",
    color: COLLEGE_COLORS.Eighth,
    requirements: [
      { category: "Eighth Core",     label: "Eighth Core",     targetUnits: 16 },
      { category: "Arts",            label: "Arts",            targetUnits: 4  },
      { category: "Humanities",      label: "Humanities",      targetUnits: 4  },
      { category: "Natural Science", label: "Natural Science", targetUnits: 8  },
      { category: "Quantitative",    label: "Quantitative",    targetUnits: 8  },
      { category: "Social Science",  label: "Social Science",  targetUnits: 8  },
    ],
  },
};

// ── Major requirements: majorName → { category: targetUnits } ─────────────────
// page.tsx spreads MAJOR_REQUIREMENTS[selectedMajor] into activeRequirements.

export const MAJOR_REQUIREMENTS: Record<string, Record<string, number>> = {
  "Business Economics (BS)": {
    "Lower Division Econ/Math": 24,
    "Upper Division Core":      36,
    "Major Electives":          12,
  },
  "Computer Science (BS)": {
    "Lower Division": 20,
    "Upper Division": 36,
  },
  "Data Science (BS)": {
    "DS Lower Division": 16,
    "DS Upper Division": 28,
  },
};

// ── Minor requirements: minorName → { category: targetUnits } ─────────────────
// "None" maps to {} so spreading is always safe regardless of selection.

export const MINOR_REQUIREMENTS: Record<string, Record<string, number>> = {
  "General Biology": {
    "Minor Lower Div": 8,
    "Minor Upper Div": 20,
  },
  "Data Science": {
    "DS Lower Division": 12,
    "DS Upper Division": 8,
  },
  "None": {},
};
