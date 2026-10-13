/**
 * Where each college publishes its own general-education requirements — the
 * authority the site's community-compiled GE lists defer to.
 *
 * Every link was opened and checked on 2026-10-13 (HTTP 200, a page titled
 * for that college's requirements). Each college's own site is preferred; the
 * UCSD General Catalog stands in for Eleanor Roosevelt College, whose site has
 * no single GE page. Recheck them when a college reorganises its site: a dead
 * link here would send a student mid-decision to an error page.
 */

export interface CollegeSource {
  /** The college's name as the site writes it (collegeName in lib/plat.ts). */
  name: string;
  url: string;
  /** Whose page it is, for the link's label. */
  publisher: string;
}

export const COLLEGE_SOURCES_CHECKED = "2026-10-13";

export const COLLEGE_SOURCES: Record<string, CollegeSource> = {
  revelle: {
    name: "Revelle College",
    url: "https://revelle.ucsd.edu/academics/general-education/index.html",
    publisher: "Revelle College",
  },
  muir: {
    name: "Muir College",
    url: "https://muir.ucsd.edu/academics/degree.html",
    publisher: "Muir College",
  },
  marshall: {
    name: "Marshall College",
    url: "https://marshall.ucsd.edu/academics/first-year-ge.html",
    publisher: "Thurgood Marshall College",
  },
  warren: {
    name: "Warren College",
    url: "https://warren.ucsd.edu/academics/general-education/index.html",
    publisher: "Warren College",
  },
  erc: {
    name: "Eleanor Roosevelt College",
    url: "https://catalog.ucsd.edu/undergraduate/colleges/eleanor-roosevelt-college/index.html",
    publisher: "the UCSD General Catalog",
  },
  sixth: {
    name: "Sixth College",
    url: "https://sixth.ucsd.edu/academics/requirements/index.html",
    publisher: "Sixth College",
  },
  seventh: {
    name: "Seventh College",
    url: "https://seventh.ucsd.edu/academics/degree-requirements/degree-requirements-first.html",
    publisher: "Seventh College",
  },
  eighth: {
    name: "Eighth College",
    url: "https://eighth.ucsd.edu/academics/degree-requirements/first-year.html",
    publisher: "Eighth College",
  },
};

/** UCSD's own page of every college's graduation requirements, for anything the lists above do not cover. */
export const GRADUATION_REQUIREMENTS_URL = "https://catalog.ucsd.edu/undergraduate/graduation-requirements/index.html";
