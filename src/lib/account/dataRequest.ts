/**
 * Answering a student's "send me my data" or "delete my data" email.
 *
 * Nothing in the database names a student: each table files their rows under
 * a different keyed hash of their email (so the tables cannot be joined, and a
 * leaked key reveals no address). That also means the operator cannot find a
 * student's rows by looking. This module derives every key the app derives,
 * with the app's own functions, and reads or deletes exactly those rows.
 *
 * Run it through scripts/student-data.ts. It needs the production
 * SUPABASE_URL, the service-role key and AUTH_SECRET, and it touches only the
 * rows of the one email it is given.
 */

import { storageKey } from "@/lib/history/store";
import { planKey } from "@/lib/plan/store";
import { ownerKey, photoBelongsTo } from "@/lib/housing/store";
import { quotaOwner } from "@/lib/planAi/server/quota";

export const PHOTO_BUCKET = "housing-photos";

export interface StudentKeys {
  /** academic_history.key */
  history: string;
  /** student_plan.key */
  plan: string;
  /** housing_listing.owner, and what each of their photo names is signed with */
  housingOwner: string;
  /** plan_ai_usage.owner */
  planAi: string;
}

/** Every key the app files this student's rows under. */
export function studentKeys(email: string, secret: string): StudentKeys {
  if (!secret) throw new Error("AUTH_SECRET is needed: every key is derived from it.");
  const normal = String(email || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+$/.test(normal)) throw new Error(`Not an email address: ${email}`);
  return {
    history: storageKey(normal, secret),
    plan: planKey(normal, secret),
    housingOwner: ownerKey(normal, secret),
    planAi: quotaOwner(normal, secret),
  };
}

export interface Target {
  /** https://<ref>.supabase.co */
  url: string;
  /** The service-role (secret) key. */
  serviceKey: string;
  fetch?: typeof fetch;
}

export interface StudentData {
  email: string;
  academicHistory: { record: unknown; updated_at: string } | null;
  plan: { rev: number; record: unknown; updated_at: string } | null;
  housingListings: Array<{ id: string; record: unknown; updated_at: string }>;
  planAiUsage: Array<{ bucket: string; n: number; created_at: string }>;
  /** Photo names in storage signed with this student's key: on a listing or not. */
  photos: string[];
}

function client(target: Target) {
  const base = target.url.replace(/\/+$/, "");
  const doFetch = target.fetch ?? fetch;
  const headers = { apikey: target.serviceKey, authorization: `Bearer ${target.serviceKey}` };
  async function send(path: string, init: RequestInit = {}, ok: number[] = []): Promise<Response> {
    const res = await doFetch(`${base}${path}`, { ...init, headers: { ...headers, ...(init.headers as Record<string, string> | undefined) } });
    if (!res.ok && !ok.includes(res.status)) {
      const detail = await res.text().catch(() => "");
      throw new Error(`${init.method ?? "GET"} ${path.split("?")[0]}: HTTP ${res.status} ${detail.slice(0, 200)}`);
    }
    return res;
  }
  return { send };
}

const eq = (v: string) => `eq.${encodeURIComponent(v)}`;

/** Every photo name in the bucket, a page at a time. */
async function allPhotoNames(send: ReturnType<typeof client>["send"]): Promise<string[]> {
  const names: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const res = await send(`/storage/v1/object/list/${PHOTO_BUCKET}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prefix: "", limit: 1000, offset, sortBy: { column: "name", order: "asc" } }),
    });
    const page = (await res.json()) as Array<{ name?: unknown }>;
    for (const o of page) if (typeof o.name === "string") names.push(o.name);
    if (page.length < 1000) return names;
  }
}

/** Reads everything filed under this student's keys. Changes nothing. */
export async function findStudentData(email: string, secret: string, target: Target): Promise<StudentData> {
  const keys = studentKeys(email, secret);
  const { send } = client(target);
  const rows = async <T>(path: string) => (await (await send(path)).json()) as T[];
  const [history, plan, listings, usage, names] = await Promise.all([
    rows<{ record: unknown; updated_at: string }>(`/rest/v1/academic_history?key=${eq(keys.history)}&select=record,updated_at`),
    rows<{ rev: number; record: unknown; updated_at: string }>(`/rest/v1/student_plan?key=${eq(keys.plan)}&select=rev,record,updated_at`),
    rows<{ id: string; record: unknown; updated_at: string }>(`/rest/v1/housing_listing?owner=${eq(keys.housingOwner)}&select=id,record,updated_at`),
    rows<{ bucket: string; n: number; created_at: string }>(`/rest/v1/plan_ai_usage?owner=${eq(keys.planAi)}&select=bucket,n,created_at`),
    allPhotoNames(send),
  ]);
  const photos = names.filter((name) => name.endsWith(".jpg") && photoBelongsTo(name.slice(0, -4), keys.housingOwner, secret));
  return {
    email: email.trim().toLowerCase(),
    academicHistory: history[0] ?? null,
    plan: plan[0] ?? null,
    housingListings: listings,
    planAiUsage: usage,
    photos,
  };
}

export interface DeletionReport {
  academicHistory: boolean;
  plan: boolean;
  housingListings: number;
  planAiUsage: number;
  photos: number;
}

/** What a deletion would remove, in words, for the operator to read before saying yes. */
export function describe(found: StudentData): string {
  return [
    `Academic History: ${found.academicHistory ? "1 record" : "none"}`,
    `Saved plan: ${found.plan ? "1 record" : "none"}`,
    `Housing listings: ${found.housingListings.length}`,
    `Housing photos (on listings or never posted): ${found.photos.length}`,
    `Plan with AI usage counts: ${found.planAiUsage.length}`,
  ].join("\n");
}

/**
 * Deletes everything findStudentData found, by the same keys. The plan row
 * needs supabase/007_privacy_requests.sql, which lets the service role delete
 * from student_plan (the app itself never deletes a plan).
 */
export async function deleteStudentData(email: string, secret: string, target: Target): Promise<DeletionReport> {
  const keys = studentKeys(email, secret);
  const found = await findStudentData(email, secret, target);
  const { send } = client(target);
  const del = (path: string) => send(path, { method: "DELETE", headers: { prefer: "return=minimal" } });
  if (found.academicHistory) await del(`/rest/v1/academic_history?key=${eq(keys.history)}`);
  if (found.plan) await del(`/rest/v1/student_plan?key=${eq(keys.plan)}`);
  if (found.housingListings.length) await del(`/rest/v1/housing_listing?owner=${eq(keys.housingOwner)}`);
  if (found.planAiUsage.length) await del(`/rest/v1/plan_ai_usage?owner=${eq(keys.planAi)}`);
  if (found.photos.length) {
    await send(`/storage/v1/object/${PHOTO_BUCKET}`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prefixes: found.photos }),
    });
  }
  return {
    academicHistory: Boolean(found.academicHistory),
    plan: Boolean(found.plan),
    housingListings: found.housingListings.length,
    planAiUsage: found.planAiUsage.length,
    photos: found.photos.length,
  };
}
