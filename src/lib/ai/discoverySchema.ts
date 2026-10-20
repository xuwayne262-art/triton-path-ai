import { z } from "zod";

export const discoverySchema = z.object({
  college: z.string().max(30).nullable(),
  area: z.string().max(150).nullable(),
  requirement: z.enum(["campus:DEI", "campus:AHI"]).nullable(),
  subject: z.string().max(12).nullable(),
  filters: z.object({
    q: z.string().max(80),
    units: z.enum(["any", "1", "2", "3", "4", "5", "6"]),
    offeredOnly: z.boolean(), openOnly: z.boolean(), noPre: z.boolean(), hasGrades: z.boolean(),
    load: z.enum(["any", "2.2", "3.2", "4"]),
    sort: z.enum(["grade", "code", "rating"]),
  }).strict(),
  unsupported: z.array(z.string().min(1).max(160)).max(8),
  clarification: z.string().max(240).nullable(),
}).strict();

export const discoveryRequestSchema = z.object({
  query: z.string().trim().min(3).max(600),
}).strict();
