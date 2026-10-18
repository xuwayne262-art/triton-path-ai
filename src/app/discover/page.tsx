import type { Metadata } from "next";
import CourseDiscovery from "@/components/plat/CourseDiscovery";

export const metadata: Metadata = {
  title: "Find courses in your own words · UCSDPlans",
  description: "Describe the courses you want, review the search filters, and explore UCSDPlans course data.",
};

export default function DiscoverPage() {
  return <CourseDiscovery />;
}
