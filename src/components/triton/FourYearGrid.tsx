"use client";

import { useState, useCallback } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
} from "@dnd-kit/core";
import { Plus, BarChart3, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { DraggableCourseCard, StaticCourseCard } from "./CourseCard";
import { cn } from "@/lib/utils";
import type { Course, Quarter } from "./types";
import {
  SAMPLE_COURSES,
  COURSE_COLORS,
} from "./types";

type SlotKey = `${number}-${Quarter}`;

interface GridState {
  slots: Record<SlotKey, Course[]>;
  unplaced: Course[];
}

const YEARS = [1, 2, 3, 4] as const;
const QUARTERS: Quarter[] = ["Fall", "Winter", "Spring"];

const QUARTER_COLORS: Record<Quarter, string> = {
  Fall: "bg-orange-50 border-orange-200",
  Winter: "bg-sky-50 border-sky-200",
  Spring: "bg-green-50 border-green-200",
};

const QUARTER_HEADER_COLORS: Record<Quarter, string> = {
  Fall: "text-orange-700 bg-orange-100",
  Winter: "text-sky-700 bg-sky-100",
  Spring: "text-green-700 bg-green-100",
};

function DroppableQuarter({
  slotKey,
  courses,
  onRemoveCourse,
}: {
  slotKey: SlotKey;
  courses: Course[];
  onRemoveCourse: (courseId: string) => void;
}) {
  const [, quarter] = slotKey.split("-") as [string, Quarter];
  const { setNodeRef, isOver } = useDroppable({ id: slotKey });

  const totalUnits = courses.reduce((sum, c) => sum + c.units, 0);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex-1 min-h-[130px] rounded-lg border-2 border-dashed p-2 transition-all duration-150",
        QUARTER_COLORS[quarter],
        isOver && "border-solid ring-2 ring-offset-1",
        isOver && quarter === "Fall" && "ring-orange-400 border-orange-400",
        isOver && quarter === "Winter" && "ring-sky-400 border-sky-400",
        isOver && quarter === "Spring" && "ring-green-400 border-green-400"
      )}
    >
      <div className="space-y-1.5">
        {courses.map((course) => (
          <DraggableCourseCard
            key={course.id}
            course={course}
            onRemove={() => onRemoveCourse(course.id)}
          />
        ))}
      </div>
      {courses.length === 0 && (
        <div className="h-full flex items-center justify-center">
          <p className="text-xs text-gray-400">Drop courses here</p>
        </div>
      )}
      {courses.length > 0 && (
        <p className="text-[10px] text-gray-400 mt-1.5 text-right pr-0.5">
          {totalUnits}u
        </p>
      )}
    </div>
  );
}

export default function FourYearGrid() {
  const initialSlots: Record<SlotKey, Course[]> = {};
  YEARS.forEach((y) =>
    QUARTERS.forEach((q) => {
      initialSlots[`${y}-${q}` as SlotKey] = [];
    })
  );
  // Pre-seed year 1 as an example
  initialSlots["1-Fall"] = [SAMPLE_COURSES[0], SAMPLE_COURSES[6]];
  initialSlots["1-Winter"] = [SAMPLE_COURSES[1], SAMPLE_COURSES[7]];
  initialSlots["1-Spring"] = [SAMPLE_COURSES[2], SAMPLE_COURSES[8]];

  const [grid, setGrid] = useState<GridState>({
    slots: initialSlots,
    unplaced: SAMPLE_COURSES.slice(3, 6).concat(SAMPLE_COURSES.slice(9)),
  });

  const [activeId, setActiveId] = useState<string | null>(null);
  const [newCourseCode, setNewCourseCode] = useState("");
  const [newCourseTitle, setNewCourseTitle] = useState("");
  const [newCourseUnits, setNewCourseUnits] = useState("4");
  const [colorIdx, setColorIdx] = useState(0);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const findCourse = useCallback(
    (id: string) => {
      for (const [key, courses] of Object.entries(grid.slots)) {
        const course = courses.find((c) => c.id === id);
        if (course) return { course, location: key as SlotKey | "unplaced" };
      }
      const course = grid.unplaced.find((c) => c.id === id);
      if (course) return { course, location: "unplaced" as const };
      return null;
    },
    [grid]
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;
    const sourceInfo = findCourse(active.id as string);
    if (!sourceInfo) return;

    const dest = over.id as string;
    if (sourceInfo.location === dest) return;

    setGrid((prev) => {
      const next = structuredClone(prev);
      const { course, location } = sourceInfo;

      // Remove from source
      if (location === "unplaced") {
        next.unplaced = next.unplaced.filter((c) => c.id !== course.id);
      } else {
        next.slots[location] = next.slots[location].filter((c) => c.id !== course.id);
      }

      // Add to destination
      if (dest === "unplaced") {
        next.unplaced = [...next.unplaced, course];
      } else {
        next.slots[dest as SlotKey] = [...(next.slots[dest as SlotKey] ?? []), course];
      }

      return next;
    });
  };

  const removeCourse = (id: string) => {
    setGrid((prev) => {
      const next = structuredClone(prev);
      for (const key of Object.keys(next.slots) as SlotKey[]) {
        const idx = next.slots[key].findIndex((c) => c.id === id);
        if (idx !== -1) {
          const [course] = next.slots[key].splice(idx, 1);
          next.unplaced.push(course);
          return next;
        }
      }
      return next;
    });
  };

  const addCourse = () => {
    if (!newCourseCode.trim()) return;
    const course: Course = {
      id: `custom-${Date.now()}`,
      code: newCourseCode.trim(),
      title: newCourseTitle.trim() || newCourseCode.trim(),
      units: parseInt(newCourseUnits) || 4,
      color: COURSE_COLORS[colorIdx % COURSE_COLORS.length],
    };
    setGrid((prev) => ({ ...prev, unplaced: [...prev.unplaced, course] }));
    setNewCourseCode("");
    setNewCourseTitle("");
    setColorIdx((i) => i + 1);
  };

  const activeCourse = activeId ? findCourse(activeId)?.course : null;

  const totalPlanned = Object.values(grid.slots).flat().reduce((s, c) => s + c.units, 0);
  const totalCourses = Object.values(grid.slots).flat().length;

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex flex-col h-full bg-gray-50">
        {/* Top bar */}
        <div
          className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-white"
        >
          <div className="flex items-center gap-3">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: "#182B49" }}
            >
              <BookOpen className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-gray-900 text-base leading-tight">
                4-Year Academic Plan
              </h1>
              <p className="text-xs text-gray-400">Drag courses between quarters</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-100">
              <BarChart3 className="w-3.5 h-3.5 text-gray-500" />
              <span className="text-xs text-gray-600 font-medium">
                {totalCourses} courses · {totalPlanned} units
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Main grid — plain div so @dnd-kit scroll offsets are calculated correctly */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-4 space-y-4">
              {YEARS.map((year) => (
                <div key={year} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                  {/* Year header */}
                  <div
                    className="px-4 py-2.5 flex items-center gap-2 border-b border-gray-100"
                    style={{ background: "#182B49" }}
                  >
                    <span className="text-white font-bold text-sm">Year {year}</span>
                    <Badge
                      className="text-[#182B49] text-[10px] font-bold border-0 px-1.5"
                      style={{ background: "#FFCD00" }}
                    >
                      {year === 1
                        ? "Freshman"
                        : year === 2
                        ? "Sophomore"
                        : year === 3
                        ? "Junior"
                        : "Senior"}
                    </Badge>
                  </div>
                  {/* Quarter columns */}
                  <div className="grid grid-cols-3 gap-3 p-3">
                    {QUARTERS.map((quarter) => {
                      const key = `${year}-${quarter}` as SlotKey;
                      return (
                        <div key={quarter} className="flex flex-col gap-2">
                          <div
                            className={cn(
                              "text-center text-xs font-semibold py-1 px-2 rounded-md",
                              QUARTER_HEADER_COLORS[quarter]
                            )}
                          >
                            {quarter}
                          </div>
                          <DroppableQuarter
                            slotKey={key}
                            courses={grid.slots[key] ?? []}
                            onRemoveCourse={removeCourse}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Sidebar: Course bank */}
          <div className="w-56 border-l border-gray-200 bg-white flex flex-col shrink-0">
            <div className="px-3 py-3 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Course Bank
              </p>
              <p className="text-[10px] text-gray-400 mt-0.5">Drag to a quarter</p>
            </div>

            {/* Add course form */}
            <div className="px-3 py-3 border-b border-gray-100 space-y-1.5">
              <input
                value={newCourseCode}
                onChange={(e) => setNewCourseCode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addCourse()}
                placeholder="Course code (e.g. CSE 30)"
                className="w-full text-xs border border-gray-200 rounded-md px-2 py-1.5 outline-none focus:ring-1 focus:ring-[#182B49] placeholder:text-gray-300"
              />
              <input
                value={newCourseTitle}
                onChange={(e) => setNewCourseTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addCourse()}
                placeholder="Title (optional)"
                className="w-full text-xs border border-gray-200 rounded-md px-2 py-1.5 outline-none focus:ring-1 focus:ring-[#182B49] placeholder:text-gray-300"
              />
              <div className="flex gap-1.5">
                <input
                  value={newCourseUnits}
                  onChange={(e) => setNewCourseUnits(e.target.value)}
                  placeholder="Units"
                  type="number"
                  min={1}
                  max={12}
                  className="w-16 text-xs border border-gray-200 rounded-md px-2 py-1.5 outline-none focus:ring-1 focus:ring-[#182B49]"
                />
                <Button
                  size="sm"
                  onClick={addCourse}
                  className="flex-1 h-7 text-xs text-white"
                  style={{ background: "#182B49" }}
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Add
                </Button>
              </div>
            </div>

            <ScrollArea className="flex-1">
              <div className="p-3 space-y-1.5">
                {grid.unplaced.length === 0 ? (
                  <p className="text-xs text-gray-300 text-center py-4">
                    All courses placed!
                  </p>
                ) : (
                  grid.unplaced.map((course) => (
                    <DraggableCourseCard key={course.id} course={course} />
                  ))
                )}
              </div>
            </ScrollArea>

            {/* Stats */}
            <div className="px-3 py-3 border-t border-gray-100 space-y-1">
              <Separator className="mb-2" />
              <div className="flex justify-between text-[10px] text-gray-400">
                <span>In bank</span>
                <span>{grid.unplaced.length}</span>
              </div>
              <div className="flex justify-between text-[10px] text-gray-400">
                <span>Planned</span>
                <span>{totalCourses} ({totalPlanned}u)</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <DragOverlay>
        {activeCourse && (
          <div className="rotate-2 scale-105 shadow-2xl">
            <StaticCourseCard course={activeCourse} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
