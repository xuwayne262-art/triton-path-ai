import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(req: Request) {
  // Validate API key is configured
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not set. Add it to .env.local." },
      { status: 500 }
    );
  }

  let body: { studentMessage: string; selectedCollege: string; currentPlan: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { studentMessage, selectedCollege, currentPlan } = body;

  if (!studentMessage?.trim()) {
    return NextResponse.json({ error: "studentMessage is required." }, { status: 400 });
  }

  // 1. Read the JSON files from disk
  const [coursesFile, geRulesFile] = await Promise.all([
    fs.readFile(process.cwd() + "/data/courses.json", "utf8"),
    fs.readFile(process.cwd() + "/data/ge_rules.json", "utf8"),
  ]);

  // 2. Parse the rules for the specific college the student selected
  const allGeRules = JSON.parse(geRulesFile);
  const studentCollegeRules = allGeRules[selectedCollege] ?? null;

  // 3. Construct the System Prompt
  const systemPrompt = `
You are TritonPath AI, an expert academic advisor for UC San Diego undergraduates.
You are vastly superior to the traditional Virtual Advising Center (VAC).

The student is in ${selectedCollege || "an undeclared"} College.
Here are the specific GE requirements for their college: ${
    studentCollegeRules
      ? JSON.stringify(studentCollegeRules, null, 2)
      : "No GE rules found for this college — advise the student to confirm with their college office."
  }

Here is the official 2025-2026 course catalog with prerequisites:
${coursesFile}

Here is the student's current 4-year course plan:
${JSON.stringify(currentPlan, null, 2)}

YOUR INSTRUCTIONS:
1. Answer the student's question accurately based ONLY on the catalog and GE rules provided.
2. Check their current plan. If they placed MATH 20B before MATH 20A, you MUST throw a prerequisite warning.
3. Keep your tone encouraging but brutally honest about graduation delays.
4. Format your response clearly — use bullet points or numbered steps where helpful.
5. If you are unsure about something not covered in the catalog or GE rules, say so honestly.
  `.trim();

  // 4. Stream the response from Claude
  const stream = anthropic.messages.stream({
    model: "claude-opus-4-6",
    max_tokens: 1024,
    thinking: { type: "adaptive" },
    system: systemPrompt,
    messages: [{ role: "user", content: studentMessage.trim() }],
  });

  // 5. Pipe the stream back to the client as SSE
  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of stream) {
          // Only forward text tokens — skip thinking blocks
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            const chunk = JSON.stringify({ text: event.delta.text });
            controller.enqueue(encoder.encode(`data: ${chunk}\n\n`));
          }
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: message })}\n\n`)
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
