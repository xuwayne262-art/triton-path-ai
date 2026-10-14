"use client";

import SearchCombobox from "./SearchCombobox";

/**
 * The site bar's search across courses and instructors (SearchCombobox).
 * Wherever the bar leaves the box too little room for the long prompt (a
 * phone, or a laptop with five links beside it), it says only "Search"
 * rather than stopping mid-word; its accessible name is the full one either
 * way.
 */
export default function SearchBox({ className = "" }: { className?: string }) {
  return (
    <SearchCombobox
      variant="bar"
      className={className}
      placeholder="Search courses and professors"
      shortPlaceholder="Search"
    />
  );
}
