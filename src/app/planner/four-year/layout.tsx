import type { Metadata } from "next";

/** Only here to name the tab; the page is a client component. */
export const metadata: Metadata = { title: "4-year plan" };

export default function FourYearLayout({ children }: { children: React.ReactNode }) {
  return children;
}
