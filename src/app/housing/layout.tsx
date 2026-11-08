import type { Metadata } from "next";
import { TITLE_TEMPLATE } from "@/lib/siteTitle";

/**
 * Only here to name the housing pages, which are client components and so
 * cannot export metadata of their own. A listing retitles its tab once it has
 * loaded; the form names itself. The template is passed on, since a plain
 * string here would drop " | UCSDPlans" from the form's title.
 */
export const metadata: Metadata = {
  title: { default: "Housing", template: TITLE_TEMPLATE },
  description:
    "Sublets and rooms posted by students signed in with @ucsd.edu, each one measured by the trip to the classes on your schedule.",
};

export default function HousingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
