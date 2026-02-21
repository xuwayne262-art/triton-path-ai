export type College =
  | "Revelle"
  | "Muir"
  | "Marshall"
  | "Warren"
  | "ERC"
  | "Sixth"
  | "Seventh"
  | "Eighth";

export type Quarter = "Fall" | "Winter" | "Spring";

export interface Course {
  id: string;
  code: string;
  title: string;
  units: number;
  color?: string;
}

export interface QuarterSlot {
  year: 1 | 2 | 3 | 4;
  quarter: Quarter;
  courses: Course[];
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export const COLLEGES: College[] = [
  "Revelle",
  "Muir",
  "Marshall",
  "Warren",
  "ERC",
  "Sixth",
  "Seventh",
  "Eighth",
];

export const MAJORS: Record<string, string[]> = {
  Engineering: [
    "Computer Science (B.S.)",
    "Computer Engineering (B.S.)",
    "Electrical Engineering (B.S.)",
    "Mechanical Engineering (B.S.)",
    "Bioengineering (B.S.)",
    "Data Science (B.S.)",
  ],
  Science: [
    "Biology (B.S.)",
    "Chemistry (B.S.)",
    "Physics (B.S.)",
    "Mathematics (B.S.)",
    "Cognitive Science (B.S.)",
    "Neuroscience (B.S.)",
  ],
  "Social Sciences": [
    "Economics (B.S.)",
    "Psychology (B.S.)",
    "Political Science (B.A.)",
    "Sociology (B.A.)",
    "Communication (B.A.)",
  ],
  Humanities: [
    "History (B.A.)",
    "Literature (B.A.)",
    "Philosophy (B.A.)",
    "Linguistics (B.A.)",
  ],
};

export const COURSE_COLORS = [
  "bg-blue-100 border-blue-300 text-blue-800",
  "bg-green-100 border-green-300 text-green-800",
  "bg-purple-100 border-purple-300 text-purple-800",
  "bg-orange-100 border-orange-300 text-orange-800",
  "bg-pink-100 border-pink-300 text-pink-800",
  "bg-teal-100 border-teal-300 text-teal-800",
  "bg-yellow-100 border-yellow-300 text-yellow-800",
  "bg-red-100 border-red-300 text-red-800",
];

export const SAMPLE_COURSES: Course[] = [
  { id: "c1", code: "CSE 8A", title: "Intro to Programming I", units: 4, color: COURSE_COLORS[0] },
  { id: "c2", code: "CSE 8B", title: "Intro to Programming II", units: 4, color: COURSE_COLORS[0] },
  { id: "c3", code: "CSE 12", title: "Data Structures", units: 4, color: COURSE_COLORS[0] },
  { id: "c4", code: "CSE 15L", title: "Software Tools", units: 2, color: COURSE_COLORS[1] },
  { id: "c5", code: "CSE 20", title: "Discrete Math", units: 4, color: COURSE_COLORS[2] },
  { id: "c6", code: "CSE 21", title: "Math for Algorithms", units: 4, color: COURSE_COLORS[2] },
  { id: "c7", code: "MATH 20A", title: "Calculus for Science", units: 4, color: COURSE_COLORS[3] },
  { id: "c8", code: "MATH 20B", title: "Calculus for Science II", units: 4, color: COURSE_COLORS[3] },
  { id: "c9", code: "MATH 20C", title: "Calculus & Analytic Geo.", units: 4, color: COURSE_COLORS[3] },
  { id: "c10", code: "PHYS 2A", title: "Physics – Mechanics", units: 3, color: COURSE_COLORS[4] },
  { id: "c11", code: "PHYS 2B", title: "Physics – E&M", units: 3, color: COURSE_COLORS[4] },
  { id: "c12", code: "COGS 1", title: "Intro Cognitive Science", units: 4, color: COURSE_COLORS[5] },
];
