/**
 * UCSD's own pages that UCSDPlans sends students to, in one place.
 *
 * Every address here is a stable front door, checked on Nov 9, 2026. None
 * carries a session, a SAML step, a CSRF token or a redirect target: those
 * belong to one browser's sign-in and break for everyone else.
 *
 * TSS's own root (`https://tss.ucsd.edu/`) answers "503 Service Not
 * Available / No system found". `https://sis.ucsd.edu/` is the address UCSD
 * publishes for logging in; it forwards to the TSS sign-in page. Course deep
 * links (`https://tss.ucsd.edu/fiori#ZUSModule-display…`) come from Class
 * Planner's data and are left as they are.
 */

/** Where a student logs in to TSS (Triton Student System). */
export const TSS_PORTAL_URL = "https://sis.ucsd.edu/";

/** UCSD's guide to My Academic History in TSS, including its known data gaps. */
export const ACADEMIC_HISTORY_HELP_URL =
  "https://students.ucsd.edu/my-tritonlink/tools/tool-help/academic-history.html";

/** UCSD's guide to logging in to TSS and finding your way around it. */
export const TSS_LOGIN_HELP_URL =
  "https://students.ucsd.edu/my-tritonlink/tools/tool-help/tss-login-nav.html";

/** UCSD's degree audit page: the official word on what counts toward a degree. */
export const DEGREE_AUDIT_URL =
  "https://students.ucsd.edu/academics/advising/degrees-diplomas/degree-audits.html";

/** UCSD's list of advising tools (degree audit, Virtual Advising Center). */
export const ADVISING_TOOLS_URL = "https://advising.ucsd.edu/students/advising-tools.html";

/** Every UCSD front door above, for the test that keeps them free of session state. */
export const UCSD_LINKS = [
  TSS_PORTAL_URL,
  ACADEMIC_HISTORY_HELP_URL,
  TSS_LOGIN_HELP_URL,
  DEGREE_AUDIT_URL,
  ADVISING_TOOLS_URL,
] as const;
