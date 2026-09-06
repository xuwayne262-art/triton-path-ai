"use client";

import { useState } from "react";
import { GraduationCap, BookOpen, ChevronRight, ChevronDown, Star, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { COLLEGES, MAJORS, type College } from "./types";
import { cn } from "@/lib/utils";

interface SidebarProps {
  selectedCollege: College | null;
  setSelectedCollege: (college: College | null) => void;
  selectedMajor: string | null;
  setSelectedMajor: (major: string | null) => void;
}

const COLLEGE_DESCRIPTIONS: Record<College, string> = {
  Revelle: "Humanities-focused with a natural science emphasis",
  Muir: "Most flexible GE requirements at UCSD",
  Marshall: "Social science & writing focus",
  Warren: "STEM & math heavy GE sequence",
  ERC: "Eleanor Roosevelt College – global perspective",
  Sixth: "Interdisciplinary approach to culture & society",
  Seventh: "Launched 2020 – interdisciplinary & flexible",
  Eighth: "Newest college – entrepreneurship & innovation",
};

export default function Sidebar({
  selectedCollege,
  setSelectedCollege,
  selectedMajor,
  setSelectedMajor,
}: SidebarProps) {
  const [expandedCategory, setExpandedCategory] = useState<string | null>("Engineering");

  const handleCollegeClick = (college: College) => {
    setSelectedCollege(selectedCollege === college ? null : college);
  };

  const handleMajorClick = (major: string) => {
    setSelectedMajor(selectedMajor === major ? null : major);
  };

  return (
    <aside className="flex flex-col h-full" style={{ background: "#182B49" }}>
      {/* Logo / Header */}
      <div className="px-5 py-5 border-b border-white/10">
        <div className="flex items-center gap-2.5 mb-1">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold"
            style={{ background: "#FFCD00", color: "#182B49" }}
          >
            T
          </div>
          <div>
            <p className="text-white font-bold text-base leading-tight">UCSDPlans AI</p>
            <p className="text-white/50 text-[11px]">Academic Planner</p>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="px-4 py-4 space-y-6">
          {/* College Section */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <GraduationCap className="w-4 h-4 text-[#FFCD00]" />
              <span className="text-[#FFCD00] text-xs font-semibold uppercase tracking-widest">
                College
              </span>
            </div>
            <div className="space-y-1">
              {COLLEGES.map((college) => (
                <Tooltip key={college}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => handleCollegeClick(college)}
                      className={cn(
                        "w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all duration-150 flex items-center justify-between group",
                        selectedCollege === college
                          ? "text-[#182B49] font-semibold shadow-sm"
                          : "text-white/80 hover:text-white hover:bg-white/10"
                      )}
                      style={
                        selectedCollege === college
                          ? { background: "#FFCD00" }
                          : {}
                      }
                    >
                      <span>{college} College</span>
                      {selectedCollege === college && (
                        <Star className="w-3.5 h-3.5 fill-current" />
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-[200px] text-xs">
                    {COLLEGE_DESCRIPTIONS[college]}
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
            {selectedCollege && (
              <div className="mt-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10">
                <div className="flex items-start gap-2">
                  <Info className="w-3.5 h-3.5 text-white/40 mt-0.5 shrink-0" />
                  <p className="text-white/60 text-[11px] leading-relaxed">
                    {COLLEGE_DESCRIPTIONS[selectedCollege]}
                  </p>
                </div>
              </div>
            )}
          </div>

          <Separator className="bg-white/10" />

          {/* Major Section */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <BookOpen className="w-4 h-4 text-[#FFCD00]" />
              <span className="text-[#FFCD00] text-xs font-semibold uppercase tracking-widest">
                Major
              </span>
            </div>
            <div className="space-y-1">
              {Object.entries(MAJORS).map(([category, majors]) => (
                <div key={category}>
                  <button
                    onClick={() =>
                      setExpandedCategory(
                        expandedCategory === category ? null : category
                      )
                    }
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-all text-xs font-semibold uppercase tracking-wider"
                  >
                    {category}
                    {expandedCategory === category ? (
                      <ChevronDown className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5" />
                    )}
                  </button>
                  {expandedCategory === category && (
                    <div className="mt-0.5 ml-2 space-y-0.5">
                      {majors.map((major) => (
                        <button
                          key={major}
                          onClick={() => handleMajorClick(major)}
                          className={cn(
                            "w-full text-left px-3 py-2 rounded-lg text-sm transition-all duration-150",
                            selectedMajor === major
                              ? "font-medium text-[#182B49]"
                              : "text-white/70 hover:text-white hover:bg-white/10"
                          )}
                          style={
                            selectedMajor === major
                              ? { background: "#FFCD00" }
                              : {}
                          }
                        >
                          {major}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <Separator className="bg-white/10" />

          {/* Summary Card */}
          {(selectedCollege || selectedMajor) && (
            <div className="px-3 py-3 rounded-xl bg-white/5 border border-white/10 space-y-2">
              <p className="text-white/40 text-[10px] uppercase tracking-widest font-semibold">
                Your Selection
              </p>
              {selectedCollege && (
                <Badge
                  className="text-[#182B49] text-xs font-semibold border-0"
                  style={{ background: "#FFCD00" }}
                >
                  {selectedCollege} College
                </Badge>
              )}
              {selectedMajor && (
                <p className="text-white/80 text-xs leading-snug">{selectedMajor}</p>
              )}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-white/10">
        <p className="text-white/30 text-[10px] text-center">
          UC San Diego · Academic Planning
        </p>
      </div>
    </aside>
  );
}
