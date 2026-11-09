/**
 * Academic History pastes for tests. All of them are made up: no real
 * student's name, PID or record.
 *
 * TSS_FIXTURE is the brief's reconstruction of a TSS (Triton Student System)
 * copy, rebuilt from screenshots of the table: two quarters, current blank
 * grades, converted (CNV) summer grades, codes wrapped across lines and
 * unrelated Academic Events text after the courses. It is not a captured
 * clipboard, so the variants below re-cut the same facts the other ways a
 * browser can copy a table.
 */

const ROW = (...cells: string[]) => cells.join("\t");

export const TSS_FIXTURE = [
  "My Academic History",
  "Academic History",
  "Undergraduate",
  "Courses",
  "By Quarter",
  "",
  "2026/2027 Fall Quarter",
  "09/21/2026 - 12/12/2026",
  "Active",
  "Continuing",
  ROW("Course", "Course Title", "Units", "Grading Option", "Grade", "Grade Points"),
  ROW("BIEB-102", "Intro Eclgy/Organisms&Habitats", "4.00", "Letter Grade", "", ""),
  "ECON-",
  ROW("110B", "Short Run Macroeconomics", "4.00", "Letter Grade", "", ""),
  ROW("MGT-160", "Experiments in Firms", "4.00", "Letter Grade", "", ""),
  ROW("MGT-162R", "Negotiations", "4.00", "Letter Grade", "", ""),
  "",
  "2025/2026 Summer Session 2",
  "08/01/2026 - 09/02/2026",
  "Active",
  ROW("Course", "Course Title", "Units", "Grading Option", "Grade", "Grade Points"),
  ROW("MGT-180R", "Business Finance", "4.00", "CNV - Letter Grade", "C+", "9.2000"),
  "WCWP-",
  ROW("010B", "The Writing Course B", "4.00", "CNV - Letter Grade", "B+", "13.2000"),
  "",
  "Academic Events",
  "For Fall 2026 forward - Data Pending.",
  "Undergraduate student data can be viewed in the Degree Audit (uAchieve)",
  "Program Type",
  "Academic Event",
  "Begin Date",
  "End Date",
  ROW("Undergraduate", "UC ENTR LVL WRITNG REQT SA", "09/06/2024", "12/31/9999"),
].join("\n");

/** The same page with every cell on its own line, as some copies come out; blank cells vanish. */
export const TSS_LINE_PER_CELL = [
  "My Academic History",
  "Academic History",
  "Undergraduate",
  "By Quarter",
  "2026/2027",
  "Fall Quarter",
  "09/21/2026 - 12/12/2026",
  "Active",
  "Course", "Course Title", "Units", "Grading Option", "Grade", "Grade Points",
  "BIEB-102", "Intro Eclgy/Organisms&Habitats", "4.00", "Letter Grade",
  "ECON-", "110B", "Short Run", "Macroeconomics", "4.00", "Letter Grade",
  "MGT-160", "Experiments in Firms", "4.00", "Letter Grade",
  "MGT-162R", "Negotiations", "4.00", "Letter Grade",
  "2025/2026 Summer Session 2",
  "08/01/2026 - 09/02/2026",
  "Active",
  "Course", "Course Title", "Units", "Grading Option", "Grade", "Grade Points",
  "MGT-180R", "Business Finance", "4.00", "CNV - Letter Grade", "C+", "9.2000",
  "WCWP-", "010B", "The Writing Course B", "4.00", "CNV - Letter Grade", "B+", "13.2000",
  "Academic Events",
  "Undergraduate", "UC ENTR LVL WRITNG REQT SA", "09/06/2024", "12/31/9999",
].join("\n");

/** Tabs turned into single spaces, as pasting through some editors does. */
export const TSS_SPACED = TSS_FIXTURE.replace(/\t+/g, " ");

/** Windows line endings, non-breaking spaces and a header repeated before every row. */
export const TSS_CRLF_NBSP = TSS_FIXTURE
  .split("\n")
  .flatMap((line) => (/^(BIEB|MGT|ECON-|WCWP-)/.test(line)
    ? [ROW("Course", "Course Title", "Units", "Grading Option", "Grade", "Grade Points"), line]
    : [line]))
  .join("\r\n")
  .replace(/Short Run /g, "Short Run ")
  .replace(/^2026\/2027 Fall Quarter/m, "2026/2027 Fall Quarter");

/** Quarters in descending order with Summer first, as TSS's sort button can show them. */
export const TSS_DESCENDING = [
  "2025/2026 Summer Session 2",
  "08/01/2026 - 09/02/2026",
  ROW("MGT-180R", "Business Finance", "4.00", "CNV - Letter Grade", "C+", "9.2000"),
  "2026/2027 Fall Quarter",
  "09/21/2026 - 12/12/2026",
  ROW("BIEB-102", "Intro Eclgy/Organisms&Habitats", "4.00", "Letter Grade", "", ""),
].join("\n");

/** A made-up identity block of the kind the TSS page shows above the courses. */
export const TSS_IDENTITY = [
  "Personal Information",
  "Pronouns she/her",
  "First Name Testy",
  "Last Name McFixture",
  "Contact Information",
  "UCSD Email tmcfixture@ucsd.edu",
  "Phone 858-555-0100",
  "Academic Information",
  "PID A99999999",
  "College Seventh College",
  "Major Business Economics",
].join("\n");

export const ROW_OF = ROW;
