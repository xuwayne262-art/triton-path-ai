"use client";

import { useState, useRef } from "react";
import { Sparkles, Loader2, AlertCircle, Bot, FileText, UploadCloud, X, Plus, Minus } from "lucide-react";
import { COURSE_COLORS_STRING } from "./types";
import type { Course } from "./types";

interface ScheduleCourse {
  course: Course;
  id: string;
}

// Quarter options that exactly match the planner grid's year (1–4) and quarter strings
const QUARTER_OPTIONS = ([1, 2, 3, 4] as const).flatMap((year) =>
  (["Fall", "Winter", "Spring"] as const).map((q) => ({
    value: `${q}-${year}`,
    label: `${q} — Year ${year}`,
  }))
);

interface AIAuditUploaderProps {
  darkMode: boolean;
  selectedMajor: string;
  selectedMinor: string;
  selectedCollege: string | null;
  selectedCourses: ScheduleCourse[];
  addToSchedule: (course: Course) => void;
  removeFromSchedule: (id: string) => void;
  plannedCourses: Array<{ courseId: string; course: Course }>;
  addAICourseToPlan: (course: Course, year: 1 | 2 | 3 | 4, quarter: "Fall" | "Winter" | "Spring") => void;
  removePlannedCourse: (courseId: string) => void;
}

// Shape returned by Gemini before we map it to Course
interface GeminiCourse {
  id: string;
  name: string;
  units: number;
  category: string[];
}

function toCourseShape(rec: GeminiCourse, index: number): Course {
  return {
    id: `ai-${rec.id.replace(/\s+/g, "-").toLowerCase()}`,
    code: rec.id,
    title: rec.name,
    units: typeof rec.units === "number" ? rec.units : 4,
    categories: rec.category as Course["categories"],
    color: COURSE_COLORS_STRING[index % COURSE_COLORS_STRING.length],
  };
}

// ── Markdown renderer ─────────────────────────────────────────────────────────
function renderMarkdown(text: string, darkMode: boolean) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let listBuffer: string[] = [];
  let key = 0;

  const flushList = () => {
    if (listBuffer.length === 0) return;
    elements.push(
      <ul key={key++} className="space-y-1 my-2 pl-1">
        {listBuffer.map((item, i) => (
          <li key={i} className="flex gap-2 text-sm leading-snug">
            <span className={`mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0 ${darkMode ? "bg-blue-400" : "bg-blue-500"}`} />
            <span>{inlineMarkdown(item, darkMode)}</span>
          </li>
        ))}
      </ul>
    );
    listBuffer = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.startsWith("### ")) { flushList(); elements.push(<h3 key={key++} className={`text-xs font-bold mt-3 mb-1 ${darkMode ? "text-gray-200" : "text-gray-800"}`}>{line.slice(4)}</h3>); continue; }
    if (line.startsWith("## "))  { flushList(); elements.push(<h2 key={key++} className={`text-sm font-bold mt-4 mb-1 ${darkMode ? "text-blue-300" : "text-blue-700"}`}>{line.slice(3)}</h2>); continue; }
    if (line.startsWith("# "))   { flushList(); elements.push(<h1 key={key++} className={`text-sm font-bold mt-4 mb-1 ${darkMode ? "text-white" : "text-gray-900"}`}>{line.slice(2)}</h1>); continue; }
    if (line.startsWith("- ") || line.startsWith("* ")) { listBuffer.push(line.slice(2)); continue; }
    if (line.trim() === "") { flushList(); elements.push(<div key={key++} className="h-1" />); continue; }
    flushList();
    elements.push(<p key={key++} className={`text-sm leading-relaxed ${darkMode ? "text-gray-300" : "text-gray-700"}`}>{inlineMarkdown(line, darkMode)}</p>);
  }
  flushList();
  return elements;
}

function inlineMarkdown(text: string, darkMode: boolean): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("**") && part.endsWith("**")
          ? <strong key={i} className={darkMode ? "text-white font-semibold" : "text-gray-900 font-semibold"}>{part.slice(2, -2)}</strong>
          : part
      )}
    </>
  );
}

// ── AI Course Card ────────────────────────────────────────────────────────────
function AICourseCard({
  course,
  isAdded,
  onAdd,
  onRemove,
  darkMode,
}: {
  course: Course;
  isAdded: boolean;
  onAdd: () => void;
  onRemove: () => void;
  darkMode: boolean;
}) {
  // Pull the first two Tailwind colour tokens from the course.color string
  // e.g. "bg-blue-100 border-blue-300 text-blue-800" → badge uses bg + text
  const colorTokens = (course.color ?? "bg-blue-100 border-blue-300 text-blue-800").split(" ");
  const badgeCls = `${colorTokens[0] ?? "bg-blue-100"} ${colorTokens[2] ?? "text-blue-800"}`;

  return (
    <div className={`rounded-lg border px-2.5 py-2 transition-colors ${
      darkMode ? "border-gray-700 bg-gray-800/60 hover:bg-gray-700/60" : "border-gray-200 bg-white hover:bg-gray-50"
    }`}>
      <div className="flex items-start justify-between gap-2">
        {/* Left: course info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${badgeCls}`}>
              {course.code}
            </span>
            <span className={`text-[10px] ${darkMode ? "text-gray-500" : "text-gray-400"}`}>
              {course.units}u
            </span>
          </div>
          <p className={`text-xs mt-0.5 leading-snug ${darkMode ? "text-gray-200" : "text-gray-700"}`}>
            {course.title}
          </p>
          {course.categories && course.categories.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {course.categories.slice(0, 2).map((cat) => (
                <span key={cat} className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                  darkMode ? "bg-gray-700 text-gray-400" : "bg-gray-100 text-gray-500"
                }`}>
                  {cat}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Right: add / remove button */}
        {isAdded ? (
          <button
            onClick={onRemove}
            className="flex-shrink-0 flex items-center gap-1 bg-red-100 text-red-700 hover:bg-red-200 px-2.5 py-1 rounded-md text-xs font-medium transition-colors"
          >
            <Minus className="w-3 h-3" />
            Remove
          </button>
        ) : (
          <button
            onClick={onAdd}
            className="flex-shrink-0 flex items-center gap-1 bg-blue-100 text-blue-700 hover:bg-blue-200 px-2.5 py-1 rounded-md text-xs font-medium transition-colors"
          >
            <Plus className="w-3 h-3" />
            Add
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AIAuditUploader({
  darkMode,
  selectedMajor,
  selectedMinor,
  selectedCollege,
  selectedCourses,
  addToSchedule,
  removeFromSchedule,
  plannedCourses,
  addAICourseToPlan,
  removePlannedCourse,
}: AIAuditUploaderProps) {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [base64Pdf, setBase64Pdf] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [analysisText, setAnalysisText] = useState<string | null>(null);
  const [recommendedCourses, setRecommendedCourses] = useState<Course[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [targetQuarter, setTargetQuarter] = useState(QUARTER_OPTIONS[0].value);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const readFileAsBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(",")[1]);
      reader.onerror = () => reject(new Error("Failed to read file."));
      reader.readAsDataURL(file);
    });

  const handleFileSelect = async (file: File) => {
    if (file.type !== "application/pdf") { setError("Please upload a PDF file."); return; }
    setError(null); setAnalysisText(null); setRecommendedCourses([]); setPdfFile(file);
    try { setBase64Pdf(await readFileAsBase64(file)); }
    catch { setError("Could not read the file. Please try again."); setPdfFile(null); }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelect(file);
  };

  const clearFile = () => {
    setPdfFile(null); setBase64Pdf(null); setAnalysisText(null);
    setRecommendedCourses([]); setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async () => {
    if (!base64Pdf) return;
    setIsLoading(true); setAnalysisText(null); setRecommendedCourses([]); setError(null);
    try {
      const res = await fetch("/api/advisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64Pdf, selectedMajor, selectedMinor, selectedCollege }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");

      let parsed: { analysisText?: string; recommendedCourses?: GeminiCourse[] };
      try { parsed = JSON.parse(data.text); }
      catch { throw new Error("The AI returned an invalid response. Please try again."); }

      if (!parsed.analysisText && !parsed.recommendedCourses)
        throw new Error("Unexpected response format from AI. Please try again.");

      setAnalysisText(parsed.analysisText ?? null);
      setRecommendedCourses((parsed.recommendedCourses ?? []).map(toCourseShape));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setIsLoading(false);
    }
  };

  // Add: inject the selected quarter/year and place directly in the 4-Year Planner.
  // A unique instanceId (course.id + timestamp) avoids React key collisions if the
  // same AI course is added more than once.
  const handleAdd = (course: Course) => {
    const [quarter, yearStr] = targetQuarter.split("-");
    const year = parseInt(yearStr) as 1 | 2 | 3 | 4;
    addAICourseToPlan(course, year, quarter as "Fall" | "Winter" | "Spring");
  };

  // Remove: find the planned-course entry whose original course.id matches, then
  // delete it by its unique instanceId.
  const handleRemove = (course: Course) => {
    const entry = plannedCourses.find((pc) => pc.course.id === course.id);
    if (entry) removePlannedCourse(entry.courseId);
  };

  const hasResults = !!analysisText || recommendedCourses.length > 0;

  const dropzoneBorder = isDragging
    ? darkMode ? "border-blue-400 bg-blue-900/20" : "border-blue-500 bg-blue-50"
    : darkMode ? "border-gray-600 hover:border-gray-500" : "border-gray-300 hover:border-gray-400";

  return (
    <div className="flex flex-col h-full">
      {/* ── Upload area ── */}
      <div className={`px-3 pt-3 pb-2 border-b flex-shrink-0 ${darkMode ? "border-gray-700" : "border-gray-200"}`}>

        {/* Profile pill */}
        <div className={`flex items-center gap-1.5 mb-2 text-[10px] px-2 py-1 rounded-full w-fit ${darkMode ? "bg-gray-700 text-gray-400" : "bg-gray-100 text-gray-500"}`}>
          <Bot className="w-3 h-3" />
          <span>{selectedMajor || "No major"} · {selectedCollege ?? "No college"}</span>
        </div>

        {/* Dropzone or file pill */}
        {!pdfFile ? (
          <div
            className={`relative rounded-xl border-2 border-dashed transition-colors cursor-pointer ${dropzoneBorder}`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <div className="flex flex-col items-center justify-center gap-1.5 py-5 px-3 text-center">
              <UploadCloud className={`w-7 h-7 ${isDragging ? (darkMode ? "text-blue-400" : "text-blue-500") : (darkMode ? "text-gray-500" : "text-gray-400")}`} />
              <p className={`text-xs font-semibold ${darkMode ? "text-gray-300" : "text-gray-600"}`}>Click to upload your DARS PDF</p>
              <p className={`text-[10px] ${darkMode ? "text-gray-500" : "text-gray-400"}`}>or drag and drop · PDF only</p>
            </div>
            <input ref={fileInputRef} type="file" accept="application/pdf" className="hidden" onChange={handleInputChange} />
          </div>
        ) : (
          <div className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 ${darkMode ? "border-gray-600 bg-gray-700/50" : "border-gray-200 bg-gray-50"}`}>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${darkMode ? "bg-blue-900/60" : "bg-blue-100"}`}>
              <FileText className={`w-4 h-4 ${darkMode ? "text-blue-300" : "text-blue-600"}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-xs font-medium truncate ${darkMode ? "text-gray-200" : "text-gray-700"}`}>{pdfFile.name}</p>
              <p className={`text-[10px] ${darkMode ? "text-gray-500" : "text-gray-400"}`}>{(pdfFile.size / 1024).toFixed(0)} KB · Ready to analyze</p>
            </div>
            <button onClick={clearFile} className={`p-1 rounded-md transition-colors flex-shrink-0 ${darkMode ? "hover:bg-gray-600 text-gray-400" : "hover:bg-gray-200 text-gray-400"}`}>
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Submit button */}
        <button
          onClick={handleSubmit}
          disabled={isLoading || !base64Pdf}
          className={`mt-2 w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition-all ${
            isLoading || !base64Pdf
              ? darkMode ? "bg-gray-700 text-gray-500 cursor-not-allowed" : "bg-gray-100 text-gray-400 cursor-not-allowed"
              : "bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
          }`}
        >
          {isLoading
            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Analyzing your degree progress...</>
            : <><Sparkles className="w-3.5 h-3.5" />Get AI Recommendations</>
          }
        </button>
      </div>

      {/* ── Results area ── */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">

        {error && (
          <div className={`flex items-start gap-2 p-3 rounded-lg border text-xs ${darkMode ? "bg-red-900/20 border-red-800 text-red-300" : "bg-red-50 border-red-200 text-red-700"}`}>
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {analysisText && (
          <div className={`rounded-xl border p-3 ${darkMode ? "bg-gray-800/80 border-gray-700" : "bg-gradient-to-br from-blue-50/60 to-white border-blue-100"}`}>
            <div className="flex items-center gap-1.5 mb-3 pb-2 border-b border-dashed border-current/20">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${darkMode ? "bg-blue-900/60" : "bg-blue-100"}`}>
                <Sparkles className={`w-3 h-3 ${darkMode ? "text-blue-300" : "text-blue-600"}`} />
              </div>
              <span className={`text-xs font-semibold ${darkMode ? "text-blue-300" : "text-blue-700"}`}>AI Advisor Analysis</span>
            </div>
            <div className="space-y-0.5">{renderMarkdown(analysisText, darkMode)}</div>
          </div>
        )}

        {recommendedCourses.length > 0 && (
          <div>
            {/* Quarter selector — determines where "+ Add" places the course */}
            <div className={`flex items-center gap-2 mb-2.5 px-2.5 py-2 rounded-lg ${darkMode ? "bg-gray-700/60" : "bg-gray-50"}`}>
              <span className={`text-[10px] font-medium flex-shrink-0 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
                Add recommended courses to:
              </span>
              <select
                value={targetQuarter}
                onChange={(e) => setTargetQuarter(e.target.value)}
                className={`flex-1 text-[11px] rounded-md border px-1.5 py-1 outline-none focus:ring-1 focus:ring-blue-500 ${
                  darkMode
                    ? "bg-gray-700 border-gray-600 text-white"
                    : "bg-white border-gray-200 text-gray-900"
                }`}
              >
                {QUARTER_OPTIONS.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>

            <p className={`text-[10px] font-bold uppercase tracking-widest mb-2 ${darkMode ? "text-gray-500" : "text-gray-400"}`}>
              Recommended courses
            </p>
            <div className="space-y-1.5">
              {recommendedCourses.map((course) => {
                const isAdded = plannedCourses.some((pc) => pc.course.id === course.id);
                return (
                  <AICourseCard
                    key={course.id}
                    course={course}
                    isAdded={isAdded}
                    onAdd={() => handleAdd(course)}
                    onRemove={() => handleRemove(course)}
                    darkMode={darkMode}
                  />
                );
              })}
            </div>
          </div>
        )}

        {!hasResults && !error && !isLoading && (
          <div className="text-center py-8 px-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-3 ${darkMode ? "bg-gray-700" : "bg-gray-100"}`}>
              <Bot className={`w-5 h-5 ${darkMode ? "text-gray-400" : "text-gray-400"}`} />
            </div>
            <p className={`text-xs font-medium mb-1 ${darkMode ? "text-gray-300" : "text-gray-600"}`}>Your AI Academic Advisor</p>
            <p className={`text-[10px] leading-relaxed ${darkMode ? "text-gray-500" : "text-gray-400"}`}>
              Upload your DARS PDF above, then click the button to get personalized course recommendations powered by Google Gemini.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
