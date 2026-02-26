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

export type CourseCategory =
  // Legacy — used by existing sample CSE/MATH courses
  | "Lower Division"
  | "Upper Division"
  | "GE"
  // Business Economics Major
  | "Lower Division Econ/Math"
  | "Upper Division Core"
  | "Major Electives"
  // Warren College GEs
  | "Warren Writing"
  | "Ethics & Society"
  | "PofC 1"
  | "PofC 2"
  // Revelle College GEs
  | "Humanities (HUM)"
  | "Math"
  | "Science"
  | "Social Science"
  | "Fine Arts"
  | "Language"
  // Muir College GEs
  | "Muir Writing (MCWP)"
  | "Social Science Seq"
  | "Math/Science Seq"
  | "Fine Arts/Humanities Seq"
  // Marshall College GEs
  | "DOC Sequence"
  | "Math/Stats"
  | "Natural Science"
  | "Humanities/Culture"
  | "Disciplinary Breadth"
  // ERC GEs
  | "MMW Sequence"
  | "Quantitative"
  | "Regional Spec"
  // Sixth College GEs
  | "CAT Sequence"
  | "Info Tech"
  | "Humanities"
  | "Art"
  | "Math/Logic"
  // Seventh College GEs
  | "Synthesis (SYN)"
  | "Arts"
  // Eighth College GEs
  | "Eighth Core"
  // General Biology Minor
  | "Minor Lower Div"
  | "Minor Upper Div"
  // Data Science Major / Minor
  | "DS Lower Division"
  | "DS Upper Division";

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
  /** One or more requirement categories this course satisfies simultaneously */
  categories?: CourseCategory[];
  /**
   * If set, this course is only shown in the sidebar when the user's selected
   * college is one of the listed values. Omit for universally available courses.
   */
  collegeLimit?: College[];
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
  { code: "DSC", name: "Data Science", courseCount: 48 },
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
  { code: "CAT", name: "Culture, Art & Technology (Sixth)", courseCount: 12 },
  { code: "DOC", name: "Dimensions of Culture (Marshall)", courseCount: 12 },
  { code: "MMW", name: "Making of the Modern World (ERC)", courseCount: 16 },
  { code: "SYN", name: "Synthesis (Seventh)", courseCount: 8 },
  { code: "WCWP", name: "Warren College Writing", courseCount: 10 },
  { code: "EIGHTH", name: "Eighth College Core", courseCount: 12 },
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

// Curated sample — mirrors data/courses.json exactly (single source of truth for IDs)
export const SAMPLE_COURSES: Course[] = [

  // ── CSE Lower Division ───────────────────────────────────────────────────────
  {
    id: "cse11",
    code: "CSE 11",
    title: "Introduction to Programming",
    units: 4,
    categories: ["Lower Division"],
    description: "Introduction to programming fundamentals using Python. Variables, control structures, functions, and basic object-oriented programming.",
    prerequisites: [],
    departments: ["CSE"],
    genEd: ["Major"],
    termsOffered: ["Fall"],
    tags: ["Major"],
  },
  {
    id: "cse12",
    code: "CSE 12",
    title: "Basic Data Structures and Object-Oriented Design",
    units: 4,
    categories: ["Lower Division"],
    description: "Fundamental data structures (arrays, linked lists, stacks, queues, trees, heaps, hash tables) and object-oriented design principles.",
    prerequisites: ["CSE 11"],
    departments: ["CSE"],
    genEd: ["Major"],
    termsOffered: ["Fall", "Winter", "Spring"],
    tags: ["Major"],
  },
  {
    id: "cse15l",
    code: "CSE 15L",
    title: "Software Tools and Techniques Laboratory",
    units: 2,
    categories: ["Lower Division"],
    description: "Hands-on practice with Unix, shell scripting, version control (Git), debugging, and testing.",
    prerequisites: ["CSE 11"],
    departments: ["CSE"],
    genEd: ["Major"],
    termsOffered: ["Fall", "Winter", "Spring"],
    tags: ["Major"],
  },
  {
    id: "cse20",
    code: "CSE 20",
    title: "Discrete Mathematics",
    units: 4,
    categories: ["Lower Division"],
    description: "Propositional logic, sets, relations, functions, induction, combinatorics, and graph theory.",
    prerequisites: [],
    departments: ["CSE", "MATH"],
    genEd: ["Major"],
    termsOffered: ["Fall", "Winter", "Spring"],
    tags: ["Major"],
  },
  {
    id: "cse21",
    code: "CSE 21",
    title: "Mathematics for Algorithms and Systems",
    units: 4,
    categories: ["Lower Division"],
    description: "Mathematical foundations for algorithm analysis: recurrences, generating functions, and discrete probability.",
    prerequisites: ["CSE 20"],
    departments: ["CSE", "MATH"],
    genEd: ["Major"],
    termsOffered: ["Fall", "Winter", "Spring"],
    tags: ["Major"],
  },

  // ── CSE Upper Division ───────────────────────────────────────────────────────
  {
    id: "cse100",
    code: "CSE 100",
    title: "Advanced Data Structures",
    units: 4,
    categories: ["Upper Division"],
    description: "Balanced trees, heaps, hash tables, and graph algorithms with complexity analysis.",
    prerequisites: ["CSE 12", "CSE 21"],
    departments: ["CSE"],
    genEd: ["Major"],
    termsOffered: ["Fall", "Winter", "Spring"],
    tags: ["Major"],
  },
  {
    id: "cse101",
    code: "CSE 101",
    title: "Design and Analysis of Algorithms",
    units: 4,
    categories: ["Upper Division"],
    description: "Divide and conquer, greedy, dynamic programming, network flow, NP-completeness, and approximation algorithms.",
    prerequisites: ["CSE 100"],
    departments: ["CSE"],
    genEd: ["Major"],
    termsOffered: ["Fall", "Winter", "Spring"],
    tags: ["Major"],
  },
  {
    id: "cse110",
    code: "CSE 110",
    title: "Software Engineering",
    units: 4,
    categories: ["Upper Division"],
    description: "Software development lifecycle: requirements, design patterns, testing, version control, and agile methodologies.",
    prerequisites: ["CSE 100"],
    departments: ["CSE"],
    genEd: ["Major"],
    termsOffered: ["Fall", "Winter", "Spring"],
    tags: ["Major"],
  },
  {
    id: "cse140",
    code: "CSE 140",
    title: "Components and Design Techniques for Digital Systems",
    units: 4,
    categories: ["Upper Division"],
    description: "Boolean algebra, logic gates, combinational and sequential circuits, FSMs, and hardware description languages.",
    prerequisites: ["CSE 20"],
    departments: ["CSE"],
    genEd: ["Major"],
    termsOffered: ["Fall", "Winter"],
    tags: ["Major"],
  },

  // ── Lower Division Econ/Math ─────────────────────────────────────────────────
  {
    id: "math20a",
    code: "MATH 20A",
    title: "Calculus for Science and Engineering",
    units: 4,
    categories: ["Lower Division Econ/Math"],
    description: "Limits, continuity, and differential calculus of functions of one variable.",
    prerequisites: [],
    departments: ["MATH"],
    genEd: ["GE", "Major"],
    termsOffered: ["Fall", "Winter"],
    tags: ["GE", "Major"],
  },
  {
    id: "math20b",
    code: "MATH 20B",
    title: "Calculus for Science and Engineering II",
    units: 4,
    categories: ["Lower Division Econ/Math"],
    description: "Integral calculus, techniques of integration, sequences, and series.",
    prerequisites: ["MATH 20A"],
    departments: ["MATH"],
    genEd: ["GE", "Major"],
    termsOffered: ["Winter", "Spring"],
    tags: ["GE", "Major"],
  },
  {
    id: "econ1",
    code: "ECON 1",
    title: "Principles of Microeconomics",
    units: 4,
    categories: ["Lower Division Econ/Math"],
    description: "Consumer theory, production costs, market structures, price theory, and welfare economics.",
    prerequisites: [],
    departments: ["ECON"],
    genEd: ["SS", "Major"],
    termsOffered: ["Fall", "Winter", "Spring"],
    tags: ["SS", "Major"],
  },
  {
    id: "econ3",
    code: "ECON 3",
    title: "Environmental and Resource Economics",
    units: 4,
    categories: ["Lower Division Econ/Math"],
    description: "Market failures, externalities, public goods, and the economics of environmental policy and natural resource use.",
    prerequisites: ["ECON 1"],
    departments: ["ECON"],
    genEd: ["SS", "Major"],
    termsOffered: ["Fall", "Winter", "Spring"],
    tags: ["SS", "Major"],
  },
  {
    id: "mgt45",
    code: "MGT 45",
    title: "Principles of Accounting",
    units: 4,
    categories: ["Lower Division Econ/Math"],
    description: "Financial statements, bookkeeping principles, cost behavior, and introductory managerial accounting.",
    prerequisites: [],
    departments: ["MGT"],
    genEd: ["Major"],
    termsOffered: ["Fall", "Winter", "Spring"],
    tags: ["Major"],
  },

  // ── Upper Division Core (Econ Major) ─────────────────────────────────────────
  {
    id: "econ100a",
    code: "ECON 100A",
    title: "Microeconomics A",
    units: 4,
    categories: ["Upper Division Core"],
    description: "Advanced consumer and producer theory, general equilibrium, welfare economics, and market imperfections.",
    prerequisites: ["ECON 1"],
    departments: ["ECON"],
    genEd: ["Major"],
    termsOffered: ["Fall", "Winter", "Spring"],
    tags: ["Major"],
  },
  {
    id: "mgt100",
    code: "MGT 100",
    title: "Organizational Behavior",
    units: 4,
    categories: ["Upper Division Core"],
    description: "Individual and group behavior in organizations: motivation, leadership, decision-making, and organizational design.",
    prerequisites: [],
    departments: ["MGT"],
    genEd: ["Major"],
    termsOffered: ["Fall", "Winter", "Spring"],
    tags: ["Major"],
  },

  // ── Warren Writing ───────────────────────────────────────────────────────────
  {
    id: "wcwp10a",
    code: "WCWP 10A",
    title: "Warren College Writing — The Essay",
    units: 4,
    categories: ["Warren Writing"],
    collegeLimit: ["Warren"],
    description: "Expository and argumentative essay writing, critical reading, and research skills for university-level discourse.",
    prerequisites: [],
    departments: ["WCWP"],
    genEd: ["Writing"],
    termsOffered: ["Fall", "Winter"],
    tags: ["Writing"],
  },
  {
    id: "wcwp10b",
    code: "WCWP 10B",
    title: "Warren College Writing — The Research Paper",
    units: 4,
    categories: ["Warren Writing"],
    collegeLimit: ["Warren"],
    description: "Advanced academic research writing, source integration, citation practice, and scholarly argument.",
    prerequisites: ["WCWP 10A"],
    departments: ["WCWP"],
    genEd: ["Writing"],
    termsOffered: ["Winter", "Spring"],
    tags: ["Writing"],
  },

  // ── Ethics & Society ─────────────────────────────────────────────────────────
  {
    id: "phil27",
    code: "PHIL 27",
    title: "Ethics and Society",
    units: 4,
    categories: ["Ethics & Society"],
    description: "Introduction to ethical theory — utilitarianism, deontology, virtue ethics — applied to contemporary social issues.",
    prerequisites: [],
    departments: ["PHIL"],
    genEd: ["ETH", "AH"],
    termsOffered: ["Fall", "Winter", "Spring"],
    tags: ["ETH", "AH"],
  },

  // ── Biology — multi-college overlap ─────────────────────────────────────────
  {
    id: "bild3",
    code: "BILD 3",
    title: "Organismal and Evolutionary Biology",
    units: 4,
    // Satisfies: Warren PofC 1 · Revelle/Sixth Science · Marshall/ERC/Seventh/Eighth Natural Science · Bio Minor lower-div
    categories: ["Minor Lower Div", "PofC 1", "Natural Science", "Science"],
    description: "Plant and animal diversity, organismal physiology, evolutionary mechanisms, and ecological relationships.",
    prerequisites: [],
    departments: ["BILD"],
    genEd: ["GE", "Science"],
    termsOffered: ["Fall", "Winter", "Spring"],
    tags: ["GE", "Science"],
  },
  {
    id: "bieb174",
    code: "BIEB 174",
    title: "Ecology",
    units: 4,
    categories: ["Minor Lower Div", "Natural Science", "PofC 1"],
    description: "Population dynamics, community structure, ecosystem processes, and the interaction of organisms with their environment.",
    prerequisites: ["BILD 3"],
    departments: ["BIEB"],
    genEd: ["GE", "Science"],
    termsOffered: ["Fall", "Spring"],
    tags: ["GE", "Science"],
  },

  // ── Humanities / Arts — multi-college overlap ────────────────────────────────
  {
    id: "mus19r",
    code: "MUS 19R",
    title: "History of Rock",
    units: 4,
    categories: ["PofC 2", "Fine Arts", "Arts"],
    description: "Survey of American popular music from the 1950s to the present, with attention to cultural, social, and political context.",
    prerequisites: [],
    departments: ["MUS"],
    genEd: ["GE", "AH"],
    termsOffered: ["Fall", "Winter", "Spring"],
    tags: ["GE", "AH"],
  },
  {
    id: "ltea138",
    code: "LTEA 138",
    title: "Modern Chinese Literature",
    units: 4,
    categories: ["PofC 2", "Humanities/Culture", "Humanities"],
    description: "Literary texts from 20th-century China read in translation: fiction, poetry, and drama in historical context.",
    prerequisites: [],
    departments: ["LTEA"],
    genEd: ["GE", "AH"],
    termsOffered: ["Fall", "Spring"],
    tags: ["GE", "AH"],
  },

  // ── New GE seed courses (FA25 / WI25) ────────────────────────────────────────
  {
    id: "mcwp40",
    code: "MCWP 40",
    title: "The Craft of Scientific Writing",
    units: 4,
    categories: ["Muir Writing (MCWP)"],
    collegeLimit: ["Muir"],
    description: "Scientific writing fundamentals for Muir College students; genre analysis, argumentation, and revision practices.",
    prerequisites: [],
    departments: ["MCWP"],
    genEd: ["Writing"],
    termsOffered: ["Fall", "Winter", "Spring"],
    tags: ["Writing"],
  },
  {
    id: "hum1",
    code: "HUM 1",
    title: "Humanities I: Ancient Civilizations",
    units: 4,
    categories: ["Humanities (HUM)"],
    collegeLimit: ["Revelle"],
    description: "Revelle College humanities sequence — ancient Greece, Rome, and the medieval world through primary texts.",
    prerequisites: [],
    departments: ["HUM"],
    genEd: ["AH"],
    termsOffered: ["Fall"],
    tags: ["AH"],
  },
  {
    id: "cat1",
    code: "CAT 1",
    title: "Culture, Art, and Technology I",
    units: 4,
    categories: ["CAT Sequence"],
    collegeLimit: ["Sixth"],
    description: "First in the Sixth College CAT sequence; inquiry into connections between culture, art, and technology in modern society.",
    prerequisites: [],
    departments: ["CAT"],
    genEd: ["AH"],
    termsOffered: ["Fall"],
    tags: ["AH"],
  },
  {
    id: "doc1",
    code: "DOC 1",
    title: "Dimensions of Culture I",
    units: 4,
    categories: ["DOC Sequence"],
    collegeLimit: ["Marshall"],
    description: "First in Marshall College's DOC sequence; democratic citizenship, justice, and the foundations of American society.",
    prerequisites: [],
    departments: ["DOC"],
    genEd: ["SS", "AH"],
    termsOffered: ["Fall"],
    tags: ["SS", "AH"],
  },

  // ── Revelle: HUM sequence (HUM 2–5) ──────────────────────────────────────────
  {
    id: "hum2",
    code: "HUM 2",
    title: "Humanities II: Medieval Europe",
    units: 4,
    categories: ["Humanities (HUM)"],
    collegeLimit: ["Revelle"],
    description: "Revelle humanities sequence — medieval Christendom, Islamic civilization, and the emergence of European culture.",
    prerequisites: ["HUM 1"],
    departments: ["HUM"],
    genEd: ["AH"],
    termsOffered: ["Winter"],
    tags: ["AH"],
  },
  {
    id: "hum3",
    code: "HUM 3",
    title: "Humanities III: Renaissance and Reformation",
    units: 4,
    categories: ["Humanities (HUM)"],
    collegeLimit: ["Revelle"],
    description: "Revelle humanities sequence — humanism, the print revolution, religious reform, and scientific new worlds.",
    prerequisites: ["HUM 2"],
    departments: ["HUM"],
    genEd: ["AH"],
    termsOffered: ["Spring"],
    tags: ["AH"],
  },
  {
    id: "hum4",
    code: "HUM 4",
    title: "Humanities IV: Enlightenment to Modernity",
    units: 4,
    categories: ["Humanities (HUM)"],
    collegeLimit: ["Revelle"],
    description: "Revelle humanities sequence — reason, revolution, romanticism, and the birth of modern political thought.",
    prerequisites: ["HUM 3"],
    departments: ["HUM"],
    genEd: ["AH"],
    termsOffered: ["Fall"],
    tags: ["AH"],
  },
  {
    id: "hum5",
    code: "HUM 5",
    title: "Humanities V: The Contemporary World",
    units: 4,
    categories: ["Humanities (HUM)"],
    collegeLimit: ["Revelle"],
    description: "Revelle humanities sequence — modernism, totalitarianism, decolonization, and globalization through primary texts.",
    prerequisites: ["HUM 4"],
    departments: ["HUM"],
    genEd: ["AH"],
    termsOffered: ["Winter"],
    tags: ["AH"],
  },

  // ── Muir: MCWP sequence (MCWP 50) ────────────────────────────────────────────
  {
    id: "mcwp50",
    code: "MCWP 50",
    title: "The Craft of Academic Writing",
    units: 4,
    categories: ["Muir Writing (MCWP)"],
    collegeLimit: ["Muir"],
    description: "Advanced research writing for Muir College — argument synthesis, scholarly conversation, and revision across disciplines.",
    prerequisites: ["MCWP 40"],
    departments: ["MCWP"],
    genEd: ["Writing"],
    termsOffered: ["Winter", "Spring"],
    tags: ["Writing"],
  },

  // ── Marshall: DOC sequence (DOC 2–3) ─────────────────────────────────────────
  {
    id: "doc2",
    code: "DOC 2",
    title: "Dimensions of Culture II: Power, Inequality, and Freedom",
    units: 4,
    categories: ["DOC Sequence"],
    collegeLimit: ["Marshall"],
    description: "Second quarter of Marshall's DOC sequence — examining race, class, gender, and the structures of social power in American life.",
    prerequisites: ["DOC 1"],
    departments: ["DOC"],
    genEd: ["SS", "AH"],
    termsOffered: ["Winter"],
    tags: ["SS", "AH"],
  },
  {
    id: "doc3",
    code: "DOC 3",
    title: "Dimensions of Culture III: Modernity and Its Discontents",
    units: 4,
    categories: ["DOC Sequence"],
    collegeLimit: ["Marshall"],
    description: "Third quarter of Marshall's DOC sequence — global modernities, empire, resistance movements, and contemporary justice.",
    prerequisites: ["DOC 2"],
    departments: ["DOC"],
    genEd: ["SS", "AH"],
    termsOffered: ["Spring"],
    tags: ["SS", "AH"],
  },

  // ── ERC: MMW sequence (MMW 11–15, 4u each = 20u) ─────────────────────────────
  {
    id: "mmw11",
    code: "MMW 11",
    title: "Making of the Modern World: Origins to 600 CE",
    units: 4,
    categories: ["MMW Sequence"],
    collegeLimit: ["ERC"],
    description: "ERC foundational sequence — ancient civilizations of Mesopotamia, Egypt, Greece, Rome, and early China through primary sources.",
    prerequisites: [],
    departments: ["MMW"],
    genEd: ["AH"],
    termsOffered: ["Fall"],
    tags: ["AH"],
  },
  {
    id: "mmw12",
    code: "MMW 12",
    title: "Making of the Modern World: 600–1450",
    units: 4,
    categories: ["MMW Sequence"],
    collegeLimit: ["ERC"],
    description: "ERC sequence — Islamic expansion, Tang and Song China, Mongol world-system, and cross-cultural exchange in the pre-modern era.",
    prerequisites: ["MMW 11"],
    departments: ["MMW"],
    genEd: ["AH"],
    termsOffered: ["Winter"],
    tags: ["AH"],
  },
  {
    id: "mmw13",
    code: "MMW 13",
    title: "Making of the Modern World: 1350–1700",
    units: 4,
    categories: ["MMW Sequence"],
    collegeLimit: ["ERC"],
    description: "ERC sequence — Renaissance, Reformation, Atlantic exploration, colonial encounter, and early capitalism.",
    prerequisites: ["MMW 12"],
    departments: ["MMW"],
    genEd: ["AH"],
    termsOffered: ["Spring"],
    tags: ["AH"],
  },
  {
    id: "mmw14",
    code: "MMW 14",
    title: "Making of the Modern World: 1700–1914",
    units: 4,
    categories: ["MMW Sequence"],
    collegeLimit: ["ERC"],
    description: "ERC sequence — Enlightenment, industrialization, nationalism, empire, and the restructuring of global society.",
    prerequisites: ["MMW 13"],
    departments: ["MMW"],
    genEd: ["AH"],
    termsOffered: ["Fall"],
    tags: ["AH"],
  },
  {
    id: "mmw15",
    code: "MMW 15",
    title: "Making of the Modern World: 1914–Present",
    units: 4,
    categories: ["MMW Sequence"],
    collegeLimit: ["ERC"],
    description: "ERC sequence — world wars, decolonization, Cold War, globalization, and contemporary challenges facing an interconnected world.",
    prerequisites: ["MMW 14"],
    departments: ["MMW"],
    genEd: ["AH"],
    termsOffered: ["Winter"],
    tags: ["AH"],
  },

  // ── Sixth: CAT sequence (CAT 2–3) ────────────────────────────────────────────
  {
    id: "cat2",
    code: "CAT 2",
    title: "Culture, Art, and Technology II",
    units: 4,
    categories: ["CAT Sequence"],
    collegeLimit: ["Sixth"],
    description: "Second quarter of Sixth College's CAT sequence — deeper inquiry into technology's role in shaping culture, identity, and society.",
    prerequisites: ["CAT 1"],
    departments: ["CAT"],
    genEd: ["AH"],
    termsOffered: ["Winter"],
    tags: ["AH"],
  },
  {
    id: "cat3",
    code: "CAT 3",
    title: "Culture, Art, and Technology III",
    units: 4,
    categories: ["CAT Sequence"],
    collegeLimit: ["Sixth"],
    description: "Third quarter of Sixth College's CAT sequence — research-intensive exploration of technology ethics, policy, and civic engagement.",
    prerequisites: ["CAT 2"],
    departments: ["CAT"],
    genEd: ["AH"],
    termsOffered: ["Spring"],
    tags: ["AH"],
  },

  // ── Seventh: SYN sequence (SYN 1–3, 4u each = 12u) ──────────────────────────
  {
    id: "syn1",
    code: "SYN 1",
    title: "Synthesis I: Systems Thinking",
    units: 4,
    categories: ["Synthesis (SYN)"],
    collegeLimit: ["Seventh"],
    description: "First in Seventh College's Synthesis sequence — interdisciplinary frameworks, systems thinking, and complex problem formulation.",
    prerequisites: [],
    departments: ["SYN"],
    genEd: ["AH"],
    termsOffered: ["Fall"],
    tags: ["AH"],
  },
  {
    id: "syn2",
    code: "SYN 2",
    title: "Synthesis II: Theory and Method",
    units: 4,
    categories: ["Synthesis (SYN)"],
    collegeLimit: ["Seventh"],
    description: "Second in Seventh College's Synthesis sequence — research methodologies across disciplines; data, argument, and evidence.",
    prerequisites: ["SYN 1"],
    departments: ["SYN"],
    genEd: ["AH"],
    termsOffered: ["Winter"],
    tags: ["AH"],
  },
  {
    id: "syn3",
    code: "SYN 3",
    title: "Synthesis III: Capstone",
    units: 4,
    categories: ["Synthesis (SYN)"],
    collegeLimit: ["Seventh"],
    description: "Third in Seventh College's Synthesis sequence — capstone project integrating prior coursework into an original interdisciplinary inquiry.",
    prerequisites: ["SYN 2"],
    departments: ["SYN"],
    genEd: ["AH"],
    termsOffered: ["Spring"],
    tags: ["AH"],
  },

  // ── Eighth: Core sequence (EIGHTH 1–4, 4u each = 16u) ───────────────────────
  {
    id: "eighth1",
    code: "EIGHTH 1",
    title: "Eighth College Core I: Foundations of Innovation",
    units: 4,
    categories: ["Eighth Core"],
    collegeLimit: ["Eighth"],
    description: "First in Eighth College's core sequence — entrepreneurial thinking, design principles, and the ethics of innovation.",
    prerequisites: [],
    departments: ["EIGHTH"],
    genEd: ["AH"],
    termsOffered: ["Fall"],
    tags: ["AH"],
  },
  {
    id: "eighth2",
    code: "EIGHTH 2",
    title: "Eighth College Core II: Systems and Society",
    units: 4,
    categories: ["Eighth Core"],
    collegeLimit: ["Eighth"],
    description: "Second in Eighth College's core sequence — sociotechnical systems, organizational behavior, and responsible leadership.",
    prerequisites: ["EIGHTH 1"],
    departments: ["EIGHTH"],
    genEd: ["AH"],
    termsOffered: ["Winter"],
    tags: ["AH"],
  },
  {
    id: "eighth3",
    code: "EIGHTH 3",
    title: "Eighth College Core III: Critique and Culture",
    units: 4,
    categories: ["Eighth Core"],
    collegeLimit: ["Eighth"],
    description: "Third in Eighth College's core sequence — critical analysis of technological change, power, and cultural transformation.",
    prerequisites: ["EIGHTH 2"],
    departments: ["EIGHTH"],
    genEd: ["AH"],
    termsOffered: ["Spring"],
    tags: ["AH"],
  },
  {
    id: "eighth4",
    code: "EIGHTH 4",
    title: "Eighth College Core IV: Synthesis and Impact",
    units: 4,
    categories: ["Eighth Core"],
    collegeLimit: ["Eighth"],
    description: "Fourth in Eighth College's core sequence — capstone synthesis project connecting innovation, ethics, and real-world impact.",
    prerequisites: ["EIGHTH 3"],
    departments: ["EIGHTH"],
    genEd: ["AH"],
    termsOffered: ["Fall"],
    tags: ["AH"],
  },

  // ── Data Science Lower Division ──────────────────────────────────────────────
  {
    id: "dsc10",
    code: "DSC 10",
    title: "Principles of Data Science",
    units: 4,
    categories: ["DS Lower Division"],
    description: "Introduction to data science using Python. Data wrangling, exploratory analysis, and basic statistical inference on real datasets.",
    prerequisites: [],
    departments: ["DSC"],
    genEd: ["Major"],
    termsOffered: ["Fall", "Winter", "Spring"],
    tags: ["Major"],
  },
  {
    id: "dsc20",
    code: "DSC 20",
    title: "Programming and Basic Data Structures for Data Scientists",
    units: 4,
    categories: ["DS Lower Division"],
    description: "Python programming, data structures (lists, dictionaries, trees), and recursion for data science applications.",
    prerequisites: ["DSC 10"],
    departments: ["DSC"],
    genEd: ["Major"],
    termsOffered: ["Fall", "Winter", "Spring"],
    tags: ["Major"],
  },
  {
    id: "dsc30",
    code: "DSC 30",
    title: "Data Structures and Algorithms for Data Science",
    units: 4,
    categories: ["DS Lower Division"],
    description: "Linked lists, trees, heaps, hash maps, and sorting/searching algorithms analyzed for time and space complexity.",
    prerequisites: ["DSC 20"],
    departments: ["DSC"],
    genEd: ["Major"],
    termsOffered: ["Fall", "Winter", "Spring"],
    tags: ["Major"],
  },

  // ── Data Science Upper Division ───────────────────────────────────────────────
  {
    id: "dsc40a",
    code: "DSC 40A",
    title: "Theoretical Foundations of Data Science I",
    units: 4,
    categories: ["DS Upper Division"],
    description: "Mathematical foundations: probability, statistics, optimization, and the geometry of high-dimensional data.",
    prerequisites: ["DSC 10", "MATH 20A"],
    departments: ["DSC"],
    genEd: ["Major"],
    termsOffered: ["Fall", "Winter", "Spring"],
    tags: ["Major"],
  },
  {
    id: "dsc80",
    code: "DSC 80",
    title: "Practice and Application of Data Science",
    units: 4,
    categories: ["DS Upper Division"],
    description: "Data cleaning, feature engineering, model selection, and the full data science workflow on messy real-world datasets.",
    prerequisites: ["DSC 30", "DSC 40A"],
    departments: ["DSC"],
    genEd: ["Major"],
    termsOffered: ["Fall", "Winter", "Spring"],
    tags: ["Major"],
  },

  // ── Minor Upper Div ──────────────────────────────────────────────────────────
  {
    id: "bipn100",
    code: "BIPN 100",
    title: "Genetics",
    units: 4,
    categories: ["Minor Upper Div"],
    description: "Mendelian and molecular genetics: DNA replication, transcription, translation, mutation, and gene regulation.",
    prerequisites: ["BILD 3"],
    departments: ["BIPN"],
    genEd: ["GE", "Science"],
    termsOffered: ["Fall", "Winter", "Spring"],
    tags: ["GE", "Science"],
  },

  // ── Legacy GE (retained for schedule demo) ───────────────────────────────────
  {
    id: "phys2a",
    code: "PHYS 2A",
    title: "Physics — Mechanics",
    units: 4,
    categories: ["GE"],
    description: "Newtonian mechanics, kinematics, energy, momentum, and rotational motion. Laboratory included.",
    prerequisites: ["MATH 20A"],
    departments: ["PHYS"],
    genEd: ["GE", "Major"],
    termsOffered: ["Fall", "Winter", "Spring"],
    tags: ["GE", "Major"],
  },
  {
    id: "cogs1",
    code: "COGS 1",
    title: "Introduction to Cognitive Science",
    units: 4,
    categories: ["GE"],
    description: "Interdisciplinary study of mind, brain, and intelligent behavior — AI, neuroscience, psychology, and linguistics.",
    prerequisites: [],
    departments: ["COGS"],
    genEd: ["GE", "SS"],
    termsOffered: ["Fall", "Winter", "Spring"],
    tags: ["GE", "SS"],
  },
];

// College GE Requirements
export const COLLEGE_GE_REQUIREMENTS: Record<College, {
  category: string;
  items: { name: string; courses: string; units: number }[];
}> = {
  // Each entry mirrors COLLEGE_REQUIREMENTS in requirements.ts exactly.
  // "courses" is a human-readable hint shown in the 4-Year Planner tile.
  Warren: {
    category: "Warren College Requirements",
    items: [
      { name: "Warren Writing",   courses: "WCWP 10A, WCWP 10B",                    units: 8  },
      { name: "Ethics & Society", courses: "PHIL 27 or approved ethics course",      units: 8  },
      { name: "PofC 1",           courses: "Approved Program of Concentration (1)",  units: 24 },
      { name: "PofC 2",           courses: "Approved Program of Concentration (2)",  units: 24 },
    ],
  },
  Revelle: {
    category: "Revelle College Requirements",
    items: [
      { name: "Humanities (HUM)", courses: "HUM 1, 2, 3, 4, 5",                     units: 24 },
      { name: "Math",             courses: "MATH 10A/B/C or 20A/B/C",               units: 12 },
      { name: "Science",          courses: "CHEM, PHYS, or BIOL sequence",           units: 20 },
      { name: "Social Science",   courses: "2 social science courses",               units: 8  },
      { name: "Fine Arts",        courses: "1 fine arts course",                     units: 4  },
      { name: "Language",         courses: "2 courses (4th-semester level)",         units: 16 },
    ],
  },
  Muir: {
    category: "Muir College Requirements",
    items: [
      { name: "Muir Writing (MCWP)",      courses: "MCWP 40, MCWP 50",                     units: 8  },
      { name: "Social Science Seq",       courses: "2 social science sequences",             units: 12 },
      { name: "Math/Science Seq",         courses: "1 math + 1 science sequence",            units: 12 },
      { name: "Fine Arts/Humanities Seq", courses: "2 fine arts or humanities sequences",    units: 12 },
    ],
  },
  Marshall: {
    category: "Marshall College Requirements",
    items: [
      { name: "DOC Sequence",         courses: "DOC 1, DOC 2, DOC 3",              units: 12 },
      { name: "Math/Stats",           courses: "2 math or statistics courses",      units: 8  },
      { name: "Natural Science",      courses: "3 natural science courses",         units: 12 },
      { name: "Humanities/Culture",   courses: "2 humanities courses",              units: 8  },
      { name: "Fine Arts",            courses: "1 fine arts course",                units: 4  },
      { name: "Disciplinary Breadth", courses: "4 breadth courses",                 units: 16 },
    ],
  },
  ERC: {
    category: "Eleanor Roosevelt College Requirements",
    items: [
      { name: "MMW Sequence",    courses: "MMW 11, 12, 13, 14, 15",                units: 20 },
      { name: "Quantitative",    courses: "2 quantitative reasoning courses",       units: 8  },
      { name: "Natural Science", courses: "2 natural science courses",              units: 8  },
      { name: "Fine Arts",       courses: "1 fine arts course",                     units: 4  },
      { name: "Language",        courses: "2 language courses (4th-semester)",      units: 16 },
      { name: "Regional Spec",   courses: "3 regional specialization courses",      units: 12 },
    ],
  },
  Sixth: {
    category: "Sixth College Requirements",
    items: [
      { name: "CAT Sequence",   courses: "CAT 1, CAT 2, CAT 3",             units: 12 },
      { name: "Info Tech",      courses: "1 information technology course",  units: 4  },
      { name: "Social Science", courses: "2 social science courses",         units: 8  },
      { name: "Humanities",     courses: "2 humanities courses",             units: 8  },
      { name: "Science",        courses: "2 science courses",                units: 8  },
      { name: "Math/Logic",     courses: "2 math or logic courses",          units: 8  },
      { name: "Art",            courses: "1 art course",                     units: 4  },
    ],
  },
  Seventh: {
    category: "Seventh College Requirements",
    items: [
      { name: "Synthesis (SYN)", courses: "SYN 1, SYN 2, SYN 3",           units: 12 },
      { name: "Arts",            courses: "2 arts courses",                  units: 8  },
      { name: "Humanities",      courses: "2 humanities courses",            units: 8  },
      { name: "Natural Science", courses: "2 natural science courses",       units: 8  },
      { name: "Quantitative",    courses: "2 quantitative courses",          units: 8  },
      { name: "Social Science",  courses: "2 social science courses",        units: 8  },
    ],
  },
  Eighth: {
    category: "Eighth College Requirements",
    items: [
      { name: "Eighth Core",     courses: "EIGHTH 1, EIGHTH 2, EIGHTH 3, EIGHTH 4", units: 16 },
      { name: "Arts",            courses: "1 arts course",                           units: 4  },
      { name: "Humanities",      courses: "1 humanities course",                     units: 4  },
      { name: "Natural Science", courses: "2 natural science courses",               units: 8  },
      { name: "Quantitative",    courses: "2 quantitative courses",                  units: 8  },
      { name: "Social Science",  courses: "2 social science courses",                units: 8  },
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
