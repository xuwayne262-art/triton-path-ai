/**
 * Answer a student's data request: show, export or delete everything saved
 * under their @ucsd.edu address.
 *
 *   node --import ./test/register.mjs --env-file=<file> scripts/student-data.ts <email>
 *   ... scripts/student-data.ts <email> --export <out.json>
 *   ... scripts/student-data.ts <email> --delete            (shows what would go)
 *   ... scripts/student-data.ts <email> --delete --yes      (deletes it)
 *
 * <file> holds SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and AUTH_SECRET copied
 * from the production project in Vercel. Keep it outside the repository and
 * delete it afterwards. See "Privacy requests" in README.md.
 */

import { writeFileSync } from "node:fs";
import { deleteStudentData, describe, findStudentData } from "@/lib/account/dataRequest";

const args = process.argv.slice(2);
const email = args.find((a) => !a.startsWith("--") && a.includes("@"));
const flag = (name: string) => args.includes(name);
const exportTo = flag("--export") ? args[args.indexOf("--export") + 1] : null;

const env = (...names: string[]) => names.map((n) => process.env[n]?.trim()).find(Boolean) ?? "";
const url = env("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY", "SUPABASE_SECRET_KEY");
const secret = env("AUTH_SECRET", "NEXTAUTH_SECRET");

if (!email || (flag("--export") && !exportTo)) {
  console.error("Usage: scripts/student-data.ts <email> [--export <out.json> | --delete [--yes]]");
  process.exit(2);
}
if (!url || !serviceKey || !secret) {
  console.error("Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and AUTH_SECRET (production values) in the --env-file.");
  process.exit(2);
}

const target = { url, serviceKey };
const found = await findStudentData(email, secret, target);
console.log(`Saved for ${found.email}:\n${describe(found)}`);

if (exportTo) {
  writeFileSync(exportTo, JSON.stringify(found, null, 2));
  console.log(`\nWrote ${exportTo}. It holds the student's records: send it only to them, then delete it.`);
}

if (flag("--delete")) {
  if (!flag("--yes")) {
    console.log("\nNothing deleted. Run again with --delete --yes to delete all of the above.");
  } else {
    const done = await deleteStudentData(email, secret, target);
    console.log(`\nDeleted: ${JSON.stringify(done)}`);
    console.log("Provider backups and logs age out on their own schedules (see the Privacy Policy).");
  }
}
