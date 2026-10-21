import { after } from "next/server";
import { auth } from "@/auth";
import { ownerTag, planKey, planStore } from "@/lib/plan/store";
import { handleApply } from "@/lib/planAi/server/applyHandler";
import { serverIndex, serverSubject } from "@/lib/planAi/server/data";
import { bumpMetric } from "@/lib/planAi/server/quota";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleApply(request, {
    email: async () => (await auth())?.user?.email,
    store: planStore,
    ownerTag: (email) => ownerTag(email),
    planKey: (email) => planKey(email),
    async data() {
      const { file, rows } = await serverIndex();
      return {
        term: file.meta.term,
        termName: file.meta.termName,
        row: (code) => rows.get(code),
        async sections(code) {
          const row = rows.get(code);
          if (!row) return null;
          const sec = (await serverSubject(row.s))?.courses[code]?.sec;
          return sec?.length ? sec : null;
        },
      };
    },
    metric: async (event) => { after(() => bumpMetric(event)); },
  });
}
