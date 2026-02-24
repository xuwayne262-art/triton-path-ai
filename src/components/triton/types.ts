export type College =
  | "Revelle"
  | "Muir"
  | "Marshall"
  | "Warren"
  | "ERC"
  | "Sixth"
  | "Seventh"
  | "Eighth";

export type Quarter = "Fall" | "Winter" | "Spring" | "Summer";

export type DayOfWeek = "Mon" | "Tue" | "Wed" | "Thu" | "Fri";

export type CourseCategory = "Lower Division" | "Upper Division" | "GE";

export interface CourseSection {
  id: string;
  courseId: string;
  section: string;
  type: "Lecture" | "Discussion" | "Lab" | "Seminar";
  instructor: string;
  location: string;
  enrolled: number;
  capacity: number;
}

export interface CourseTime {
  day: DayOfWeek;
  start: string; // "10:00"
  end: string; // "11:00"
}

export interface Course {
  id: string;
  code: string; // "CSE 11"
  title: string;
  units: number;
  description?: string;
  prerequisites?: string[];
  departments?: string[];
  genEd?: string[];
  termsOffered?: Quarter[];
  sections?: CourseSection[];
  tags?: string[];
  color?: string;
  time?: CourseTime[];
  category?: CourseCategory;
}

export interface ScheduledCourse {
  course: Course;
  section: CourseSection;
  time: CourseTime[];
  quarter: Quarter;
  year: 1 | 2 | 3 | 4;
}

export interface QuarterSlot {
  year: 1 | 2 | 3 | 4;
  quarter: Quarter;
  courses: ScheduledCourse[];
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

// UCSD College GE Requirements
export interface GERequirement {
  category: string;
  courses: string[];
  units: number;
  completed: boolean;
}

export interface CollegeRequirements {
  college: College;
  requirements: {
    category: string;
    items: string[];
    units: number;
  }[];
}

// Department data
export interface Department {
  code: string;
  name: string;
  courseCount: number;
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
    "Chemical Engineering (B.S.)",
    "Structural Engineering (B.S.)",
  ],
  Science: [
    "Biology (B.S.)",
    "Chemistry (B.S.)",
    "Physics (B.S.)",
    "Mathematics (B.S.)",
    "Cognitive Science (B.S.)",
    "Neuroscience (B.S.)",
    "Data Science (B.S.)",
    "Marine Biology (B.S.)",
  ],
  "Social Sciences": [
    "Economics (B.S.)",
    "Psychology (B.S.)",
    "Political Science (B.A.)",
    "Sociology (B.A.)",
    "Communication (B.A.)",
    "International Studies (B.A.)",
  ],
  Humanities: [
    "History (B.A.)",
    "Literature (B.A.)",
    "Philosophy (B.A.)",
    "Linguistics (B.A.)",
    "Visual Arts (B.A.)",
  ],
  "Computer Science": [
    "Computer Science (B.S.)",
    "Computer Science (B.A.)",
    "Computer Engineering (B.S.)",
    "Data Science (B.S.)",
  ],
};

// UCSD Departments with course counts
export const DEPARTMENTS: Department[] = [
  { code: "CSE", name: "Computer Science & Engineering", courseCount: 156 },
  { code: "MATH", name: "Mathematics", courseCount: 89 },
  { code: "PHYS", name: "Physics", courseCount: 112 },
  { code: "CHEM", name: "Chemistry & Biochemistry", courseCount: 98 },
  { code: "BIOL", name: "Biology", courseCount: 134 },
  { code: "COGS", name: "Cognitive Science", courseCount: 67 },
  { code: "ECON", name: "Economics", courseCount: 78 },
  { code: "PSYC", name: "Psychology", courseCount: 95 },
  { code: "POLI", name: "Political Science", courseCount: 72 },
  { code: "SOCI", name: "Sociology", courseCount: 58 },
  { code: "COMM", name: "Communication", courseCount: 45 },
  { code: "HIST", name: "History", courseCount: 89 },
  { code: "LIGN", name: "Linguistics", courseCount: 42 },
  { code: "PHIL", name: "Philosophy", courseCount: 51 },
  { code: "LIT", name: "Literature", courseCount: 76 },
  { code: "AWP", name: "Academic Writing", courseCount: 34 },
  { code: "MCWP", name: "Muir College Writing", courseCount: 28 },
  { code: "HUM", name: "Revelle Humanities", courseCount: 45 },
  { code: "MUS", name: "Music", courseCount: 38 },
  { code: "VIS", name: "Visual Arts", courseCount: 42 },
  { code: "TDTR", name: " Theatre, Dance & Performance", courseCount: 35 },
  { code: "ANTH", name: "Anthropology", courseCount: 67 },
  { code: "GLBS", name: "Global Studies", courseCount: 34 },
  { code: "INTL", name: "International Studies", courseCount: 29 },
  { code: "DSGN", name: "Design", courseCount: 28 },
  { code: "NENG", name: "NanoEngineering", courseCount: 45 },
  { code: "MAE", name: "Mechanical & Aerospace Eng", courseCount: 78 },
  { code: "BENG", name: "Bioengineering", courseCount: 56 },
  { code: "ECE", name: "Electrical & Computer Eng", courseCount: 134 },
  { code: "SE", name: "Structural Engineering", courseCount: 42 },
];

// Course colors for visual distinction
export const COURSE_COLORS = [
  { bg: "bg-blue-100", border: "border-blue-300", text: "text-blue-800", hex: "#3B82F6" },
  { bg: "bg-green-100", border: "border-green-300", text: "text-green-800", hex: "#22C55E" },
  { bg: "bg-purple-100", border: "border-purple-300", text: "text-purple-800", hex: "#A855F7" },
  { bg: "bg-orange-100", border: "border-orange-300", text: "text-orange-800", hex: "#F97316" },
  { bg: "bg-pink-100", border: "border-pink-300", text: "text-pink-800", hex: "#EC4899" },
  { bg: "bg-teal-100", border: "border-teal-300", text: "text-teal-800", hex: "#14B8A6" },
  { bg: "bg-yellow-100", border: "border-yellow-300", text: "text-yellow-800", hex: "#EAB308" },
  { bg: "bg-red-100", border: "border-red-300", text: "text-red-800", hex: "#EF4444" },
  { bg: "bg-cyan-100", border: "border-cyan-300", text: "text-cyan-800", hex: "#06B6D4" },
  { bg: "bg-indigo-100", border: "border-indigo-300", text: "text-indigo-800", hex: "#6366F1" },
];

// Legacy string format for backward compatibility
export const COURSE_COLORS_STRING = [
  "bg-blue-100 border-blue-300 text-blue-800",
  "bg-green-100 border-green-300 text-green-800",
  "bg-purple-100 border-purple-300 text-purple-800",
  "bg-orange-100 border-orange-300 text-orange-800",
  "bg-pink-100 border-pink-300 text-pink-800",
  "bg-teal-100 border-teal-300 text-teal-800",
  "bg-yellow-100 border-yellow-300 text-yellow-800",
  "bg-red-100 border-red-300 text-red-800",
];

// Sample courses to demonstrate
export const SAMPLE_COURSES: Course[] = [
  {
    id: "cse11",
    code: "CSE 11",
    title: "Introduction to Programming I",
    units: 4,
    category: "Lower Division",
    description: "Introduction to programming fundamentals using Python. Topics include variables, control structures, functions, arrays, and basic object-oriented programming.",
    prerequisites: [],
    departments: ["CSE"],
    genEd: ["Major"],
    termsOffered: ["Fall", "Winter", "Spring"],
    tags: ["Programming", "Python", "Fundamentals"]
  },
  {
    id: "cse12",
    code: "CSE 12",
    title: "Data Structures",
    units: 4,
    category: "Lower Division",
    description: "Fundamental data structures including arrays, linked lists, stacks, queues, trees, heaps, hash tables, and graphs.",
    prerequisites: ["CSE 11"],
    departments: ["CSE"],
    genEd: ["Major"],
    termsOffered: ["Fall", "Winter", "Spring"],
    tags: ["Data Structures", "Algorithms"]
  },
  {
    id: "cse15l",
    code: "CSE 15L",
    title: "Software Tools",
    units: 2,
    category: "Lower Division",
    description: "Introduction to software development tools including Unix, version control, debugging, and testing.",
    prerequisites: ["CSE 11"],
    departments: ["CSE"],
    genEd: ["Major"],
    termsOffered: ["Fall", "Winter", "Spring"],
    tags: ["Tools", "Development"]
  },
  {
    id: "cse20",
    code: "CSE 20",
    title: "Discrete Math",
    units: 4,
    category: "Lower Division",
    description: "Introduction to discrete mathematics. Topics include logic, sets, relations, functions, combinatorics, and proofs.",
    prerequisites: [],
    departments: ["CSE", "MATH"],
    genEd: ["Major", "GE"],
    termsOffered: ["Fall", "Winter", "Spring"],
    tags: ["Math", "Theory"]
  },
  {
    id: "cse21",
    code: "CSE 21",
    title: "Math for Algorithms",
    units: 4,
    category: "Lower Division",
    description: "Mathematical foundations for algorithm analysis. Topics include recurrences, generating functions, and probability.",
    prerequisites: ["CSE 20"],
    departments: ["CSE", "MATH"],
    genEd: ["Major"],
    termsOffered: ["Fall", "Winter", "Spring"],
    tags: ["Algorithms", "Math"]
  },
  {
    id: "cse30",
    code: "CSE 30",
    title: "Programming Abstractions",
    units: 4,
    category: "Lower Division",
    description: "Advanced programming concepts including recursion, abstract data types, and algorithm design.",
    prerequisites: ["CSE 12"],
    departments: ["CSE"],
    genEd: ["Major"],
    termsOffered: ["Fall", "Winter", "Spring"],
    tags: ["Programming", "Abstractions"]
  },
  {
    id: "math20a",
    code: "MATH 20A",
    title: "Calculus for Science & Engineering",
    units: 4,
    category: "GE",
    description: "Differential calculus of functions of one variable. Limits, continuity, derivatives, and applications.",
    prerequisites: [],
    departments: ["MATH"],
    genEd: ["GE", "Major"],
    termsOffered: ["Fall", "Winter", "Spring"],
    tags: ["Calculus", "GE"]
  },
  {
    id: "math20b",
    code: "MATH 20B",
    title: "Calculus for Science & Engineering II",
    units: 4,
    category: "GE",
    description: "Integral calculus, sequences, and series.",
    prerequisites: ["MATH 20A"],
    departments: ["MATH"],
    genEd: ["GE", "Major"],
    termsOffered: ["Fall", "Winter", "Spring"],
    tags: ["Calculus", "GE"]
  },
  {
    id: "math20c",
    code: "MATH 20C",
    title: "Calculus & Analytic Geometry",
    units: 4,
    category: "GE",
    description: "Multivariable calculus, vectors, and differential equations.",
    prerequisites: ["MATH 20B"],
    departments: ["MATH"],
    genEd: ["GE", "Major"],
    termsOffered: ["Fall", "Winter", "Spring"],
    tags: ["Calculus", "Multivariable"]
  },
  {
    id: "phys2a",
    code: "PHYS 2A",
    title: "Physics - Mechanics",
    units: 4,
    category: "GE",
    description: "Mechanics, heat, and sound. Laboratory included.",
    prerequisites: ["MATH 20A"],
    departments: ["PHYS"],
    genEd: ["GE", "Major"],
    termsOffered: ["Fall", "Winter", "Spring"],
    tags: ["Physics", "Mechanics"]
  },
  {
    id: "phys2b",
    code: "PHYS 2B",
    title: "Physics - Electricity & Magnetism",
    units: 4,
    category: "GE",
    description: "Electricity, magnetism, and optics. Laboratory included.",
    prerequisites: ["PHYS 2A", "MATH 20B"],
    departments: ["PHYS"],
    genEd: ["GE", "Major"],
    termsOffered: ["Fall", "Winter", "Spring"],
    tags: ["Physics", "E&M"]
  },
  {
    id: "cogs1",
    code: "COGS 1",
    title: "Introduction to Cognitive Science",
    units: 4,
    category: "GE",
    description: "Introduction to the interdisciplinary study of mind, brain, and behavior.",
    prerequisites: [],
    departments: ["COGS"],
    genEd: ["GE", "SS"],
    termsOffered: ["Fall", "Winter", "Spring"],
    tags: ["Cognitive Science", "Interdisciplinary"]
  },
];

// College GE Requirements
export const COLLEGE_GE_REQUIREMENTS: Record<College, {
  category: string;
  items: { name: string; courses: string; units: number }[];
}> = {
  Revelle: {
    category: "Revelle College Requirements",
    items: [
      { name: "Mathematics", courses: "MATH 10A/B/C or 20A/B/C", units: 12 },
      { name: "Humanities", courses: "HUM 1, 2, 3, 4, 5", units: 20 },
      { name: "Natural Science", courses: "CHEM, PHYS, or BIOL sequence", units: 12 },
      { name: "Social Science", courses: "2 courses", units: 8 },
      { name: "Foreign Language", courses: "2 courses (4th semester level)", units: 8 },
      { name: "DEI", courses: "1 course", units: 4 },
    ],
  },
  Muir: {
    category: "Muir College Requirements",
    items: [
      { name: "Writing", courses: "MCWP 40, 50", units: 8 },
      { name: "Natural Science", courses: "1 sequence + 1 additional", units: 12 },
      { name: "Social Science", courses: "2 sequences from different areas", units: 12 },
      { name: "Humanities", courses: "2 courses", units: 8 },
      { name: "Arts", courses: "1 course", units: 4 },
      { name: "DEI", courses: "1 course", units: 4 },
    ],
  },
  Marshall: {
    category: "Marshall College Requirements",
    items: [
      { name: "Writing", courses: "WCWP 10A/B", units: 8 },
      { name: "Mathematics", courses: "MATH 10, 11, or 20A", units: 4 },
      { name: "Natural Science", courses: "1 sequence", units: 8-12 },
      { name: "Social Science", courses: "3 courses from 2 disciplines", units: 12 },
      { name: "Humanities", courses: "3 courses from 2 disciplines", units: 12 },
      { name: "DEI", courses: "1 course", units: 4 },
    ],
  },
  Warren: {
    category: "Warren College Requirements",
    items: [
      { name: "Writing", courses: "CAT 125 or equivalent", units: 4 },
      { name: "Mathematics", courses: "MATH 10, 11, or 20A", units: 4 },
      { name: "Natural Science", courses: "1 sequence + 1 additional", units: 12 },
      { name: "Social Science", courses: "3 courses", units: 12 },
      { name: "Humanities", courses: "3 courses", units: 12 },
      { name: "DEI", courses: "1 course", units: 4 },
    ],
  },
  ERC: {
    category: "Eleanor Roosevelt College Requirements",
    items: [
      { name: "Writing", courses: "ERC 30, 31, 32", units: 12 },
      { name: "Natural Science", courses: "1 sequence", units: 8-12 },
      { name: "Social Science", courses: "3 courses", units: 12 },
      { name: "Humanities", courses: "3 courses", units: 12 },
      { name: "Regional", courses: "1 region focus (Asia, Europe, Americas)", units: 8 },
      { name: "DEI", courses: "1 course", units: 4 },
    ],
  },
  Sixth: {
    category: "Sixth College Requirements",
    items: [
      { name: "Writing", courses: "SIX 10A/B/C", units: 12 },
      { name: "Natural Science", courses: "1 sequence", units: 8-12 },
      { name: "Social Science", courses: "3 courses", units: 12 },
      { name: "Humanities", courses: "3 courses", units: 12 },
      { name: "Culture & Technology", courses: "2 courses", units: 8 },
      { name: "DEI", courses: "1 course", units: 4 },
    ],
  },
  Seventh: {
    category: "Seventh College Requirements",
    items: [
      { name: "Foundations", courses: "SE 10, 20, 30", units: 12 },
      { name: "Natural Science", courses: "1 sequence", units: 8-12 },
      { name: "Social Science", courses: "3 courses", units: 12 },
      { name: "Humanities", courses: "3 courses", units: 12 },
      { name: "Data & Technology", courses: "2 courses", units: 8 },
      { name: "DEI", courses: "1 course", units: 4 },
    ],
  },
  Eighth: {
    category: "Eighth College Requirements",
    items: [
      { name: "Foundations", courses: "EIGHT 10, 20, 30", units: 12 },
      { name: "Natural Science", courses: "1 sequence", units: 8-12 },
      { name: "Social Science", courses: "3 courses", units: 12 },
      { name: "Humanities", courses: "3 courses", units: 12 },
      { name: "Innovation & Entrepreneurship", courses: "2 courses", units: 8 },
      { name: "DEI", courses: "1 course", units: 4 },
    ],
  },
};

// Time slots for scheduling (30-minute intervals)
export const TIME_SLOTS = [
  "08:00", "08:30", "09:00", "09:30", "10:00", "10:30", 
  "11:00", "11:30", "12:00", "12:30", "13:00", "13:30", 
  "14:00", "14:30", "15:00", "15:30", "16:00", "16:30", 
  "17:00", "17:30", "18:00", "18:30", "19:00", "19:30", 
  "20:00", "20:30", "21:00", "21:30", "22:00"
];

export const DAYS: DayOfWeek[] = ["Mon", "Tue", "Wed", "Thu", "Fri"];

// Helper function to check time conflicts
export function hasTimeConflict(times1: CourseTime[], times2: CourseTime[]): boolean {
  for (const t1 of times1) {
    for (const t2 of times2) {
      if (t1.day === t2.day) {
        const start1 = t1.start.replace(":", "");
        const end1 = t1.end.replace(":", "");
        const start2 = t2.start.replace(":", "");
        const end2 = t2.end.replace(":", "");
        
        if (start1 < end2 && start2 < end1) {
          return true;
        }
      }
    }
  }
  return false;
}

// Convert time string to minutes for comparison
export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}
