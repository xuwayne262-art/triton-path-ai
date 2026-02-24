import type { CourseCategory } from "@/components/triton/types";

export interface DegreeRequirement {
  category: CourseCategory;
  label: string;
  targetUnits: number;
  /** Tailwind bg-* class used for the progress-bar fill */
  color: string;
}

/**
 * Mock CS B.S. degree requirements broken down by category.
 * Adjust targetUnits to reflect your actual program sheet.
 */
export const DEGREE_REQUIREMENTS: DegreeRequirement[] = [
  {
    category: "Lower Division",
    label: "Lower Division",
    targetUnits: 28,
    color: "bg-blue-500",
  },
  {
    category: "Upper Division",
    label: "Upper Division",
    targetUnits: 20,
    color: "bg-violet-500",
  },
  {
    category: "GE",
    label: "General Education",
    targetUnits: 16,
    color: "bg-emerald-500",
  },
];
