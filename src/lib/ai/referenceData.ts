import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Loads the local academic reference data the advisor is allowed to cite.
 *
 * This is *trusted* input: it ships with the repository and no request can
 * influence which files are read. It is deliberately separate from anything
 * the student sends.
 */

export interface ReferenceData {
  /** Raw catalog JSON text, inlined into the system prompt verbatim. */
  coursesJson: string;
  /** How many courses the local dataset actually contains. */
  courseCount: number;
  /** GE summary for the requested college, or null when we have none. */
  collegeGeRules: unknown;
  /** Every college the local GE file covers — used to describe the data honestly. */
  collegesWithGeRules: string[];
}

/** Distinguishes "our data is broken" from "the model call failed". */
export class ReferenceDataError extends Error {
  readonly stage: "read" | "parse";
  constructor(stage: "read" | "parse", message: string) {
    super(message);
    this.name = "ReferenceDataError";
    this.stage = stage;
  }
}

export interface LoadOptions {
  /** Overridable so tests can point at a fixture directory. */
  dataDir?: string;
}

export async function loadReferenceData(
  selectedCollege: string,
  options: LoadOptions = {},
): Promise<ReferenceData> {
  const dir = options.dataDir ?? path.join(process.cwd(), "data");

  let coursesJson: string;
  let geRulesJson: string;
  try {
    [coursesJson, geRulesJson] = await Promise.all([
      fs.readFile(path.join(dir, "courses.json"), "utf8"),
      fs.readFile(path.join(dir, "ge_rules.json"), "utf8"),
    ]);
  } catch (err) {
    // The path is deliberately not propagated — it would leak server layout.
    throw new ReferenceDataError("read", `Could not read course data: ${errName(err)}`);
  }

  let courses: unknown;
  let geRules: unknown;
  try {
    courses = JSON.parse(coursesJson);
    geRules = JSON.parse(geRulesJson);
  } catch (err) {
    throw new ReferenceDataError("parse", `Course data is not valid JSON: ${errName(err)}`);
  }

  const geByCollege =
    typeof geRules === "object" && geRules !== null && !Array.isArray(geRules)
      ? (geRules as Record<string, unknown>)
      : {};

  return {
    coursesJson,
    courseCount: Array.isArray(courses) ? courses.length : 0,
    collegeGeRules: geByCollege[selectedCollege] ?? null,
    collegesWithGeRules: Object.keys(geByCollege).sort(),
  };
}

function errName(err: unknown): string {
  if (err && typeof err === "object" && "code" in err && typeof err.code === "string") {
    return err.code;
  }
  return err instanceof Error ? err.name : "UnknownError";
}
