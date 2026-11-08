import type { Metadata } from "next";

/** Only here to name the tab; the page is a client component. */
export const metadata: Metadata = { title: "Academic History" };

export default function ImportLayout({ children }: { children: React.ReactNode }) {
  return children;
}
