"use client";

import SearchCombobox from "./SearchCombobox";
import { useMediaQuery } from "@/components/planner/useMediaQuery";

/**
 * The site bar's search across courses and instructors (SearchCombobox).
 * A phone's bar leaves the box about a hundred pixels, which cut the long
 * prompt off mid-word, so it says only "Search" there; its accessible name is
 * the full one either way.
 */
export default function SearchBox({ className = "" }: { className?: string }) {
  const narrow = useMediaQuery("(max-width: 639.98px)");
  return (
    <SearchCombobox
      variant="bar"
      className={className}
      placeholder={narrow ? "Search" : "Search courses and professors"}
    />
  );
}
