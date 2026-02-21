"use client";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, X, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Course } from "./types";

interface CourseCardProps {
  course: Course;
  onRemove?: () => void;
  isDragging?: boolean;
  compact?: boolean;
}

export function DraggableCourseCard({
  course,
  onRemove,
}: CourseCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: course.id });

  const style = {
    transform: CSS.Translate.toString(transform),
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        "group relative flex items-start gap-1.5 px-2.5 py-2 rounded-lg border text-xs font-medium select-none cursor-grab active:cursor-grabbing transition-all duration-150",
        course.color ?? "bg-blue-50 border-blue-200 text-blue-800",
        isDragging && "opacity-50 scale-95 shadow-xl ring-2 ring-blue-400"
      )}
    >
      <div className="mt-0.5 shrink-0 opacity-30 group-hover:opacity-60 transition-opacity">
        <GripVertical className="w-3 h-3" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-bold leading-tight truncate">{course.code}</p>
        <p className="leading-tight truncate opacity-70 text-[10px] mt-0.5">{course.title}</p>
        <p className="opacity-50 text-[10px] mt-0.5">{course.units}u</p>
      </div>
      {onRemove && (
        <button
          onClick={onRemove}
          className="shrink-0 opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity mt-0.5"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

export function StaticCourseCard({ course, onRemove, compact = false }: CourseCardProps) {
  return (
    <div
      className={cn(
        "group relative flex items-start gap-1.5 rounded-lg border text-xs font-medium select-none",
        compact ? "px-2 py-1.5" : "px-2.5 py-2",
        course.color ?? "bg-blue-50 border-blue-200 text-blue-800"
      )}
    >
      <BookOpen className={cn("shrink-0 opacity-40", compact ? "w-2.5 h-2.5 mt-0.5" : "w-3 h-3 mt-0.5")} />
      <div className="flex-1 min-w-0">
        <p className="font-bold leading-tight truncate">{course.code}</p>
        {!compact && (
          <p className="leading-tight truncate opacity-70 text-[10px] mt-0.5">{course.title}</p>
        )}
        <p className="opacity-50 text-[10px] mt-0.5">{course.units}u</p>
      </div>
      {onRemove && (
        <button
          onClick={onRemove}
          className="shrink-0 opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity mt-0.5"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}
