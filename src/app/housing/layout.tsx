import type { Metadata } from "next";

/**
 * Only here to name the housing pages, which are client components and so
 * cannot export metadata of their own. A listing retitles its tab once it has
 * loaded; the form names itself.
 */
export const metadata: Metadata = {
  title: "Housing — UCSDPlans",
  description:
    "Sublets and rooms from verified @ucsd.edu students, each one measured by the trip to the classes on your schedule.",
};

export default function HousingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
