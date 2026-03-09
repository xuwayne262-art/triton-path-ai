import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { selectedMajor, selectedCollege } = await req.json();

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY is not configured on the server." },
        { status: 500 }
      );
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: { responseMimeType: "application/json" },
      systemInstruction: `You are the official UCSD plans.ucsd.edu engine. The user is a ${selectedMajor ?? "Computer Science (BS)"} major in ${selectedCollege ?? "Warren"} College. Generate a complete 4-year academic plan (Fall, Winter, Spring for Year 1 through Year 4). You MUST NOT use generic placeholders like "GE" or "Major Elective". You must pick specific, real UCSD courses (e.g., "PHIL 27" instead of "Warren Ethics GE", "MATH 20A" instead of "Calculus"). Return a JSON array of course objects — nothing else. Each object must have exactly these keys: "id" (the UCSD course code, e.g. "CSE 11"), "name" (the full course title, e.g. "Introduction to Programming"), "units" (a number, e.g. 4), "term" (exactly one of: "Fall", "Winter", or "Spring"), and "year" (exactly one of: "Year 1", "Year 2", "Year 3", or "Year 4"). Aim for 3–4 courses per quarter. Do not include duplicate course IDs.`,
    });

    const result = await model.generateContent(
      "Generate the complete 4-year academic plan now."
    );
    const text = result.response.text();

    return NextResponse.json({ text });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
