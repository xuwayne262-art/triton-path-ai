"use client";

import { useState, useMemo, useEffect } from "react";
import { 
  Search, Moon, Sun, Plus, X, Calendar, BookOpen, 
  GraduationCap, ChevronDown, ChevronRight, AlertTriangle,
  CheckCircle2, Clock, Filter, RotateCcw, Download, Menu
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { 
  Collapsible, 
  CollapsibleContent, 
  CollapsibleTrigger 
} from "@/components/ui/collapsible";
import { 
  Tooltip, 
  TooltipContent, 
  TooltipTrigger 
} from "@/components/ui/tooltip";
import {
  DEPARTMENTS,
  COLLEGES,
  MAJORS,
  SAMPLE_COURSES,
  COURSE_COLORS,
  COLLEGE_GE_REQUIREMENTS,
  DAYS,
  TIME_SLOTS,
  type Course,
  type DayOfWeek,
  type College,
  type CourseTime
} from "@/components/triton/types";
import { REQUIREMENT_GROUPS } from "@/data/requirements";

// Helper to generate sample course times
function generateSampleTime(code: string): CourseTime[] {
  const hash = code.split("").reduce((a, b) => a + b.charCodeAt(0), 0);
  const allDays: DayOfWeek[][] = [
    ["Mon", "Wed", "Fri"],
    ["Tue", "Thu"],
    ["Mon", "Wed"],
    ["Tue", "Thu"],
    ["Mon"]
  ];
  const days = allDays[hash % 5];
  const startHour = 8 + (hash % 12);
  return days.map(day => ({
    day,
    start: `${startHour.toString().padStart(2, "0")}:00`,
    end: `${startHour + 1 + (hash % 2)}:00`
  }));
}

// Add times to courses
const coursesWithTimes: Course[] = SAMPLE_COURSES.map(c => ({
  ...c,
  time: generateSampleTime(c.code)
}));

// More departments for display
const MORE_DEPARTMENTS = [
  { code: "DS", name: "Data Science", courseCount: 45 },
  { code: "ECE", name: "Electrical & Computer Eng", courseCount: 134 },
  { code: "MAE", name: "Mechanical & Aerospace Eng", courseCount: 78 },
  { code: "BENG", name: "Bioengineering", courseCount: 56 },
  { code: "NENG", name: "NanoEngineering", courseCount: 45 },
  { code: "SE", name: "Structural Engineering", courseCount: 42 },
  { code: "CENG", name: "Chemical Engineering", courseCount: 52 },
  { code: "JAMS", name: "Media", courseCount: 38 },
];

const ALL_DEPARTMENTS = [...DEPARTMENTS, ...MORE_DEPARTMENTS].sort((a, b) => a.name.localeCompare(b.name));

interface ScheduleCourse {
  course: Course;
  id: string;
}

interface PlannedCourse {
  courseId: string;
  course: Course;
  year: 1 | 2 | 3 | 4;
  quarter: "Fall" | "Winter" | "Spring";
}

export default function Home() {
  const [darkMode, setDarkMode] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selectedCollege, setSelectedCollege] = useState<College | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDepartment, setSelectedDepartment] = useState<string | null>(null);
  const [selectedCourses, setSelectedCourses] = useState<ScheduleCourse[]>([]);
  const [plannedCourses, setPlannedCourses] = useState<PlannedCourse[]>([]);
  const [expandedDepts, setExpandedDepts] = useState<string[]>(["CSE", "MATH"]);
  const [showPlanner, setShowPlanner] = useState(false);
  const [plannerYear, setPlannerYear] = useState<1 | 2 | 3 | 4>(1);
  const [plannerQuarter, setPlannerQuarter] = useState<"Fall" | "Winter" | "Spring">("Fall");
  const [conflicts, setConflicts] = useState<string[]>([]);

  // Apply dark mode
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [darkMode]);

  // Filter courses based on search and department
  const filteredCourses = useMemo(() => {
    return coursesWithTimes.filter(course => {
      const matchesSearch = searchQuery === "" || 
        course.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        course.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        course.tags?.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
      
      const matchesDept = selectedDepartment === null || 
        course.departments?.includes(selectedDepartment);
      
      return matchesSearch && matchesDept;
    });
  }, [searchQuery, selectedDepartment]);

  // Check for conflicts
  useEffect(() => {
    const newConflicts: string[] = [];
    for (let i = 0; i < selectedCourses.length; i++) {
      for (let j = i + 1; j < selectedCourses.length; j++) {
        const course1 = selectedCourses[i].course;
        const course2 = selectedCourses[j].course;
        if (course1.time && course2.time) {
          for (const t1 of course1.time) {
            for (const t2 of course2.time) {
              if (t1.day === t2.day) {
                const start1 = parseInt(t1.start.replace(":", ""));
                const end1 = parseInt(t1.end.replace(":", ""));
                const start2 = parseInt(t2.start.replace(":", ""));
                const end2 = parseInt(t2.end.replace(":", ""));
                if (start1 < end2 && start2 < end1) {
                  newConflicts.push(`${selectedCourses[i].id}-${selectedCourses[j].id}`);
                }
              }
            }
          }
        }
      }
    }
    setConflicts(newConflicts);
  }, [selectedCourses]);

  const addToSchedule = (course: Course) => {
    if (!selectedCourses.find(c => c.course.id === course.id)) {
      setSelectedCourses([...selectedCourses, { 
        course, 
        id: `${course.id}-${Date.now()}` 
      }]);
    }
  };

  const removeFromSchedule = (id: string) => {
    setSelectedCourses(selectedCourses.filter(c => c.id !== id));
  };

  const addToPlanner = () => {
    selectedCourses.forEach(sc => {
      if (!plannedCourses.find(pc => pc.courseId === sc.course.id)) {
        setPlannedCourses([...plannedCourses, {
          courseId: sc.course.id,
          course: sc.course,
          year: plannerYear,
          quarter: plannerQuarter
        }]);
      }
    });
  };

  const getYearName = (year: 1 | 2 | 3 | 4) => {
    return year === 1 ? "Freshman" : year === 2 ? "Sophomore" : year === 3 ? "Junior" : "Senior";
  };

  const getColorForCourse = (index: number) => {
    return COURSE_COLORS[index % COURSE_COLORS.length];
  };

  const toggleDept = (code: string) => {
    setExpandedDepts(prev => 
      prev.includes(code) 
        ? prev.filter(d => d !== code)
        : [...prev, code]
    );
  };

  // Group departments alphabetically
  const groupedDepts = useMemo(() => {
    const groups: Record<string, typeof ALL_DEPARTMENTS> = {};
    ALL_DEPARTMENTS.forEach(dept => {
      const letter = dept.name[0].toUpperCase();
      if (!groups[letter]) groups[letter] = [];
      groups[letter].push(dept);
    });
    return groups;
  }, []);

  // Group filtered courses by primary department
  const groupedCourses = useMemo(() => {
    const groups: Record<string, typeof filteredCourses> = {};
    filteredCourses.forEach(course => {
      const dept = course.departments?.[0] ?? "Other";
      if (!groups[dept]) groups[dept] = [];
      groups[dept].push(course);
    });
    return groups;
  }, [filteredCourses]);

  // Degree audit: tally units per category — a course may satisfy multiple categories
  const degreeProgress = useMemo(() => {
    const tally: Record<string, number> = {};
    selectedCourses.forEach(({ course }) => {
      course.categories?.forEach(cat => {
        tally[cat] = (tally[cat] ?? 0) + course.units;
      });
    });
    return REQUIREMENT_GROUPS.map(group => ({
      ...group,
      requirements: group.requirements.map(req => ({
        ...req,
        current: tally[req.category] ?? 0,
      })),
    }));
  }, [selectedCourses]);

  return (
    <div className={`h-screen flex flex-col ${darkMode ? "dark bg-gray-900" : "bg-gray-50"}`}>
      {/* Header */}
      <header className={`flex items-center justify-between px-4 py-3 border-b ${
        darkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"
      }`}>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="lg:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center font-bold text-sm"
              style={{ background: darkMode ? "#FFCD00" : "#182B49", color: darkMode ? "#182B49" : "white" }}>
              T
            </div>
            <div>
              <h1 className={`font-bold text-lg leading-tight ${darkMode ? "text-white" : "text-gray-900"}`}>
                TritonPath
              </h1>
              <p className={`text-xs ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
                UCSD Academic Planner
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Pass Times Banner */}
          <div className={`hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full text-xs ${
            darkMode ? "bg-blue-900/50 text-blue-300" : "bg-blue-50 text-blue-700"
          }`}>
            <Calendar className="w-3.5 h-3.5" />
            <span>Pass 2 In Progress</span>
            <span className={`mx-1 ${darkMode ? "text-gray-500" : "text-gray-400"}`}>•</span>
            <span className="font-medium">Spring 2026</span>
          </div>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setDarkMode(!darkMode)}
                className={`p-2 rounded-lg ${darkMode ? "hover:bg-gray-700 text-yellow-400" : "hover:bg-gray-100 text-gray-600"}`}
              >
                {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            </TooltipContent>
          </Tooltip>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className={`${sidebarOpen ? "w-80" : "w-0"} lg:w-80 flex-shrink-0 overflow-hidden border-r transition-all ${
          darkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"
        }`}>
          <div className="h-full flex flex-col">
            {/* Degree Progress */}
            <div className={`px-3 pt-2.5 pb-2 border-b ${darkMode ? "border-gray-700" : "border-gray-200"}`}>
              {/* Section header */}
              <div className="flex items-center gap-1.5 mb-2">
                <GraduationCap className="w-3.5 h-3.5 text-yellow-500" />
                <span className={`text-xs font-semibold ${darkMode ? "text-gray-200" : "text-gray-700"}`}>
                  Degree Progress
                </span>
              </div>

              {/* Requirement groups */}
              <div className="space-y-2.5">
                {degreeProgress.map(group => (
                  <div key={group.id}>
                    {/* Group header */}
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${group.color}`} />
                      <span className={`text-[9px] font-bold uppercase tracking-widest truncate ${
                        darkMode ? "text-gray-500" : "text-gray-400"
                      }`}>
                        {group.groupLabel}
                      </span>
                    </div>

                    {/* Requirements */}
                    <div className="space-y-1.5 pl-3">
                      {group.requirements.map(req => {
                        const pct = req.targetUnits > 0
                          ? Math.min(100, Math.round((req.current / req.targetUnits) * 100))
                          : 0;
                        const complete = req.current >= req.targetUnits;
                        return (
                          <div key={req.category}>
                            <div className="flex items-center justify-between mb-0.5">
                              <span className={`text-[10px] font-medium truncate ${
                                darkMode ? "text-gray-300" : "text-gray-600"
                              }`}>
                                {req.label}
                              </span>
                              <span className={`text-[10px] tabular-nums ml-1.5 flex-shrink-0 ${
                                complete
                                  ? "text-green-500 font-semibold"
                                  : darkMode ? "text-gray-500" : "text-gray-400"
                              }`}>
                                {req.current}/{req.targetUnits}u
                              </span>
                            </div>
                            <div className={`h-1 rounded-full overflow-hidden ${
                              darkMode ? "bg-gray-700" : "bg-slate-200"
                            }`}>
                              <div
                                className={`h-full rounded-full transition-all duration-500 ease-out ${group.color}${
                                  complete ? " opacity-75" : ""
                                }`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Search */}
            <div className="p-3 border-b dark:border-gray-700">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search courses..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={`w-full pl-9 pr-3 py-2 text-sm rounded-lg border ${
                    darkMode 
                      ? "bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:border-blue-500" 
                      : "bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 focus:border-blue-500"
                  } outline-none focus:ring-1 focus:ring-blue-500`}
                />
              </div>
            </div>

            {/* College Selector */}
            <div className={`px-3 py-2 border-b ${darkMode ? "border-gray-700" : "border-gray-200"}`}>
              <div className="flex items-center gap-1.5 mb-1.5">
                <GraduationCap className="w-3.5 h-3.5 text-yellow-500" />
                <label className={`text-xs font-semibold ${darkMode ? "text-gray-300" : "text-gray-600"}`}>
                  College
                </label>
              </div>
              <select
                value={selectedCollege ?? ""}
                onChange={(e) => setSelectedCollege(e.target.value ? e.target.value as College : null)}
                className={`w-full px-2 py-1.5 text-sm rounded-lg border ${
                  darkMode
                    ? "bg-gray-700 border-gray-600 text-white"
                    : "bg-white border-gray-200 text-gray-900"
                } outline-none focus:ring-1 focus:ring-blue-500`}
              >
                <option value="">— Select College —</option>
                {COLLEGES.map(c => (
                  <option key={c} value={c}>{c} College</option>
                ))}
              </select>
            </div>

            {/* Course List */}
            <div className="flex-1 overflow-y-auto">
              <div className="p-2">
                {filteredCourses.length === 0 ? (
                  <div className="text-center py-8 text-gray-400 text-sm">
                    No courses found
                  </div>
                ) : (
                  <div className="space-y-0.5">
                    {Object.entries(groupedCourses).map(([dept, courses]) => {
                      const deptName = ALL_DEPARTMENTS.find(d => d.code === dept)?.name ?? dept;
                      const isExpanded = expandedDepts.includes(dept);
                      return (
                        <Collapsible key={dept} open={isExpanded} onOpenChange={() => toggleDept(dept)}>
                          <CollapsibleTrigger className={`flex items-center justify-between w-full px-2 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                            darkMode ? "text-gray-300 hover:bg-gray-700" : "text-gray-600 hover:bg-gray-100"
                          }`}>
                            <div className="flex items-center gap-1.5 min-w-0">
                              <ChevronRight className={`w-3 h-3 flex-shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                              <span className="truncate">{deptName}</span>
                            </div>
                            <span className={`ml-1 flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded-full ${
                              darkMode ? "bg-gray-600 text-gray-400" : "bg-gray-100 text-gray-400"
                            }`}>{courses.length}</span>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <div className="ml-2 mt-0.5 space-y-0.5 pb-1">
                              {courses.map((course) => {
                                const globalIdx = filteredCourses.indexOf(course);
                                const color = getColorForCourse(globalIdx);
                                const scheduledItem = selectedCourses.find(s => s.course.id === course.id);
                                const isAdded = !!scheduledItem;
                                return (
                                  <div
                                    key={course.id}
                                    className={`flex items-center justify-between px-2 py-1.5 rounded-md transition-colors ${
                                      darkMode ? "hover:bg-gray-700" : "hover:bg-gray-50"
                                    }`}
                                  >
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-1.5">
                                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${color.bg} ${color.text}`}>
                                          {course.code}
                                        </span>
                                        <span className={`text-[10px] ${darkMode ? "text-gray-500" : "text-gray-400"}`}>
                                          {course.units}u
                                        </span>
                                      </div>
                                      <p className={`text-xs truncate mt-0.5 ${
                                        darkMode ? "text-gray-200" : "text-gray-700"
                                      }`}>
                                        {course.title}
                                      </p>
                                    </div>
                                    <button
                                      onClick={() => isAdded
                                        ? removeFromSchedule(scheduledItem!.id)
                                        : addToSchedule(course)
                                      }
                                      className={`ml-1.5 flex-shrink-0 p-1 rounded transition-colors ${
                                        isAdded
                                          ? "text-green-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                                          : "text-gray-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20"
                                      }`}
                                    >
                                      {isAdded
                                        ? <CheckCircle2 className="w-4 h-4" />
                                        : <Plus className="w-4 h-4" />
                                      }
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Stats */}
            <div className={`p-3 border-t text-xs ${
              darkMode ? "border-gray-700 text-gray-400" : "border-gray-200 text-gray-500"
            }`}>
              <div className="flex justify-between mb-1">
                <span>Selected Courses</span>
                <span className="font-medium">{selectedCourses.length}</span>
              </div>
              <div className="flex justify-between">
                <span>Total Units</span>
                <span className="font-medium">
                  {selectedCourses.reduce((sum, c) => sum + c.course.units, 0)}
                </span>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-hidden flex flex-col">
          {/* View Toggle */}
          <div className={`flex items-center gap-2 px-4 py-2 border-b ${
            darkMode ? "border-gray-700 bg-gray-800" : "border-gray-200 bg-white"
          }`}>
            <button
              onClick={() => setShowPlanner(false)}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                !showPlanner
                  ? "bg-blue-600 text-white"
                  : darkMode 
                    ? "text-gray-300 hover:bg-gray-700" 
                    : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              <Calendar className="w-4 h-4 inline-block mr-1.5" />
              Weekly Schedule
            </button>
            <button
              onClick={() => setShowPlanner(true)}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                showPlanner
                  ? "bg-blue-600 text-white"
                  : darkMode 
                    ? "text-gray-300 hover:bg-gray-700" 
                    : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              <BookOpen className="w-4 h-4 inline-block mr-1.5" />
              4-Year Planner
            </button>
          </div>

          {/* Weekly Schedule View */}
          {!showPlanner && (
            <div className="flex-1 overflow-auto">
              <div className="p-4">
                {selectedCourses.length === 0 ? (
                  <div className={`flex flex-col items-center justify-center h-full py-20 ${
                    darkMode ? "text-gray-400" : "text-gray-500"
                  }`}>
                    <Calendar className="w-16 h-16 mb-4 opacity-20" />
                    <p className="text-lg font-medium mb-2">No courses added yet</p>
                    <p className="text-sm">Search and add courses from the sidebar</p>
                  </div>
                ) : (
                  <div className={`rounded-xl overflow-hidden border ${
                    darkMode ? "border-gray-700 bg-gray-800" : "border-gray-200 bg-white"
                  }`}>
                    {/* Header */}
                    <div className={`grid grid-cols-6 text-center text-sm font-medium py-2 ${
                      darkMode ? "bg-gray-700 text-gray-300" : "bg-gray-50 text-gray-600"
                    }`}>
                      <div className={darkMode ? "text-gray-400" : "text-gray-400"}></div>
                      {DAYS.map(day => (
                        <div key={day}>{day}</div>
                      ))}
                    </div>
                    
                    {/* Time Grid */}
                    <div className="relative">
                      {/* Time labels */}
                      <div className="absolute left-0 top-0 bottom-0 w-14 flex flex-col">
                        {TIME_SLOTS.filter((_, i) => i % 2 === 0).map(time => (
                          <div 
                            key={time} 
                            className={`h-14 text-xs text-right pr-2 pt-1 ${
                              darkMode ? "text-gray-500" : "text-gray-400"
                            }`}
                          >
                            {time}
                          </div>
))}
                      </div>

                      {/* Grid */}
                      <div className="ml-14 grid grid-cols-5 border-l border-r">
                        {DAYS.map(day => (
                          <div key={day} className={`relative min-h-[840px] ${
                            darkMode ? "border-gray-700" : "border-gray-100"
                          }`}>
                            {/* Hour lines */}
                            {TIME_SLOTS.filter((_, i) => i % 2 === 0).map((_, i) => (
                              <div 
                                key={i} 
                                className={`h-14 border-b ${
                                  darkMode ? "border-gray-700" : "border-gray-100"
                                }`}
                              />
                            ))}
                            
                            {/* Course blocks */}
                            {selectedCourses.map((sc, idx) => {
                              const course = sc.course;
                              if (!course.time) return null;
                              
                              return course.time
                                .filter(t => t.day === day)
                                .map((t, tIdx) => {
                                  const startHour = parseInt(t.start.split(":")[0]);
                                  const startMin = parseInt(t.start.split(":")[1]);
                                  const endHour = parseInt(t.end.split(":")[0]);
                                  const endMin = parseInt(t.end.split(":")[1]);
                                  const duration = (endHour - startHour) * 60 + (endMin - startMin);
                                  const top = ((startHour - 8) * 60 + startMin) / 30 * 28;
                                  const height = duration / 30 * 28;
                                  const color = getColorForCourse(idx);
                                  const hasConflict = conflicts.some(c => c.includes(sc.id));
                                  
                                  return (
                                    <div
                                      key={`${sc.id}-${tIdx}`}
                                      className={`group absolute left-1 right-1 rounded-lg p-2 overflow-hidden ${
                                        hasConflict ? "ring-2 ring-red-500" : ""
                                      } ${color.bg} ${color.border} border-l-4`}
                                      style={{
                                        top: `${top}px`,
                                        height: `${height}px`,
                                      }}
                                    >
                                      <p className={`text-xs font-bold truncate pr-4 ${color.text}`}>
                                        {course.code}
                                      </p>
                                      {height > 40 && (
                                        <p className={`text-[10px] truncate ${color.text} opacity-80`}>
                                          {t.start} - {t.end}
                                        </p>
                                      )}
                                      <button
                                        onClick={() => removeFromSchedule(sc.id)}
                                        className="absolute top-0.5 right-0.5 p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity bg-white/70 hover:bg-white hover:text-red-600 text-gray-600"
                                      >
                                        <X className="w-3 h-3" />
                                      </button>
                                    </div>
                                  );
                                });
                            })}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Clear Button */}
                {selectedCourses.length > 0 && (
                  <div className="mt-4 flex justify-center">
                    <button
                      onClick={() => setSelectedCourses([])}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm ${
                        darkMode 
                          ? "text-gray-400 hover:bg-gray-700" 
                          : "text-gray-500 hover:bg-gray-100"
                      }`}
                    >
                      <RotateCcw className="w-4 h-4" />
                      Clear Schedule
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 4-Year Planner View */}
          {showPlanner && (
            <div className="flex-1 overflow-auto">
              <div className="p-4">
                {/* Planner Controls */}
                <div className={`mb-4 p-4 rounded-xl ${
                  darkMode ? "bg-gray-800" : "bg-white"
                } border ${darkMode ? "border-gray-700" : "border-gray-200"}`}>
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-2">
                      <label className={`text-sm font-medium ${
                        darkMode ? "text-gray-300" : "text-gray-700"
                      }`}>Year:</label>
                      <select
                        value={plannerYear}
                        onChange={(e) => setPlannerYear(Number(e.target.value) as 1 | 2 | 3 | 4)}
                        className={`px-3 py-1.5 text-sm rounded-lg border ${
                          darkMode 
                            ? "bg-gray-700 border-gray-600 text-white" 
                            : "bg-white border-gray-200"
                        }`}
                      >
                        <option value={1}>Year 1 - Freshman</option>
                        <option value={2}>Year 2 - Sophomore</option>
                        <option value={3}>Year 3 - Junior</option>
                        <option value={4}>Year 4 - Senior</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className={`text-sm font-medium ${
                        darkMode ? "text-gray-300" : "text-gray-700"
                      }`}>Quarter:</label>
                      <select
                        value={plannerQuarter}
                        onChange={(e) => setPlannerQuarter(e.target.value as "Fall" | "Winter" | "Spring")}
                        className={`px-3 py-1.5 text-sm rounded-lg border ${
                          darkMode 
                            ? "bg-gray-700 border-gray-600 text-white" 
                            : "bg-white border-gray-200"
                        }`}
                      >
                        <option value="Fall">Fall</option>
                        <option value="Winter">Winter</option>
                        <option value="Spring">Spring</option>
                      </select>
                    </div>
                    <Button 
                      onClick={addToPlanner}
                      className="ml-auto bg-blue-600 hover:bg-blue-700"
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Add Selected to Plan
                    </Button>
                  </div>
                </div>

                {/* GE Requirements */}
                {selectedCollege && (
                  <div className={`mb-4 p-4 rounded-xl ${
                    darkMode ? "bg-gray-800" : "bg-white"
                  } border ${darkMode ? "border-gray-700" : "border-gray-200"}`}>
                    <h3 className={`text-sm font-semibold mb-3 ${
                      darkMode ? "text-white" : "text-gray-900"
                    }`}>
                      {selectedCollege} College GE Requirements
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {COLLEGE_GE_REQUIREMENTS[selectedCollege].items.map((req, idx) => (
                        <div 
                          key={idx}
                          className={`p-2 rounded-lg ${
                            darkMode ? "bg-gray-700" : "bg-gray-50"
                          }`}
                        >
                          <p className={`text-xs font-medium ${
                            darkMode ? "text-gray-300" : "text-gray-700"
                          }`}>
                            {req.name}
                          </p>
                          <p className={`text-[10px] mt-0.5 ${
                            darkMode ? "text-gray-500" : "text-gray-400"
                          }`}>
                            {req.courses}
                          </p>
                          <p className={`text-[10px] mt-0.5 ${
                            darkMode ? "text-gray-400" : "text-gray-500"
                          }`}>
                            {req.units} units
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Planned Courses */}
                <div className={`rounded-xl overflow-hidden border ${
                  darkMode ? "border-gray-700 bg-gray-800" : "border-gray-200 bg-white"
                }`}>
                  {/* Year headers */}
                  <div className="grid grid-cols-4 gap-2 p-2">
                    {[1, 2, 3, 4].map(year => (
                      <div 
                        key={year}
                        className={`p-2 rounded-lg text-center ${
                          darkMode ? "bg-gray-700" : "bg-gray-50"
                        }`}
                      >
                        <p className={`font-semibold ${
                          darkMode ? "text-white" : "text-gray-900"
                        }`}>
                          Year {year}
                        </p>
                        <p className={`text-xs ${
                          darkMode ? "text-gray-400" : "text-gray-500"
                        }`}>
                          {year === 1 ? "Freshman" : year === 2 ? "Sophomore" : year === 3 ? "Junior" : "Senior"}
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* Quarter columns */}
                  <div className="grid grid-cols-4 gap-2 p-2">
                    {[1, 2, 3, 4].map(year => (
                      <div key={year} className="space-y-2">
                        {["Fall", "Winter", "Spring"].map(quarter => {
                          const courses = plannedCourses.filter(
                            p => p.year === year && p.quarter === quarter
                          );
                          return (
                            <div 
                              key={quarter}
                              className={`p-2 rounded-lg min-h-[80px] ${
                                darkMode ? "bg-gray-700/50" : "bg-gray-50/50"
                              }`}
                            >
                              <p className={`text-[10px] font-medium mb-1 ${
                                darkMode ? "text-gray-400" : "text-gray-400"
                              }`}>
                                {quarter}
                              </p>
                              {courses.length === 0 ? (
                                <p className={`text-[10px] ${
                                  darkMode ? "text-gray-600" : "text-gray-300"
                                }`}>
                                  No courses
                                </p>
                              ) : (
                                <div className="space-y-1">
                                  {courses.map((pc, idx) => {
                                    const color = getColorForCourse(idx);
                                    return (
                                      <div 
                                        key={pc.courseId}
                                        className={`text-[10px] px-1.5 py-0.5 rounded ${color.bg} ${color.text}`}
                                      >
                                        {pc.course.code}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Mobile sidebar toggle */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
}
