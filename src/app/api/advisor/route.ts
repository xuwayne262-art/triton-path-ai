import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { base64Pdf, selectedMajor, selectedMinor, selectedCollege } =
      await req.json();

    if (!base64Pdf) {
      return NextResponse.json(
        { error: "A PDF file is required." },
        { status: 400 }
      );
    }

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
    });

    const textPart = {
      text: `You are an expert UCSD Academic Advisor. Analyze the uploaded PDF against the user's Major (${selectedMajor || "Not specified"}), Minor (${selectedMinor && selectedMinor !== "None" ? selectedMinor : "None"}), and College (${selectedCollege || "Not specified"}). You MUST return your response as a valid JSON object with exactly two keys: "analysisText" (a friendly, markdown-formatted string explaining satisfied requirements, outstanding requirements, and your recommendations) and "recommendedCourses" (an array of exactly 4 course objects the user should take next quarter). Each course object MUST have these exact keys: "id" (the course code, e.g. "MATH 20A"), "name" (the full course title, e.g. "Calculus for Science and Engineering"), "units" (a number), and "category" (an array of strings describing the requirement it fulfills, e.g. ["Lower Division", "Math"]). If a course is not in standard UCSD data, infer and create a valid object. Use an encouraging, friendly tone in analysisText.`,
    };

    const pdfPart = {
      inlineData: {
        data: base64Pdf,
        mimeType: "application/pdf",
      },
    };

    const result = await model.generateContent([textPart, pdfPart]);
    const text = result.response.text();

    return NextResponse.json({ text });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
