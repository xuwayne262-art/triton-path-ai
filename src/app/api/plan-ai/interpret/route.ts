import { after } from "next/server";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText, Output } from "ai";
import { auth } from "@/auth";
import { modelIntentSchema, modelVocab, type ModelVocab } from "@/lib/planAi/intentSchema";
import { handleInterpret } from "@/lib/planAi/server/interpretHandler";
import { serverGE, serverIndex } from "@/lib/planAi/server/data";
import { bumpMetric, geminiKey, planAiEnabled, planAiModel, reservePlanAi } from "@/lib/planAi/server/quota";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

let vocab: Promise<ModelVocab> | null = null;

export async function POST(request: Request): Promise<Response> {
  return handleInterpret(request, {
    email: async () => (await auth())?.user?.email,
    enabled: planAiEnabled,
    reserve: (email) => reservePlanAi(email),
    vocab: () => {
      vocab ??= Promise.all([serverIndex(), serverGE()]).then(([index, ge]) => modelVocab(index.file, ge));
      vocab.catch(() => { vocab = null; });
      return vocab;
    },
    async interpret(system, text, signal) {
      const { output } = await generateText({
        model: createGoogleGenerativeAI({ apiKey: geminiKey() })(planAiModel()),
        output: Output.object({ schema: modelIntentSchema }),
        // A parse is short; the cap keeps a confused answer short too.
        maxOutputTokens: 700,
        maxRetries: 0,
        reasoning: "none",
        abortSignal: signal,
        system,
        prompt: text,
      });
      return output;
    },
    metric: async (event) => { after(() => bumpMetric(event)); },
  });
}
