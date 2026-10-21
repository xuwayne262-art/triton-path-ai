import type { Metadata } from "next";
import CourseDiscovery from "@/components/plat/CourseDiscovery";

export const metadata: Metadata = {
  title: "Find courses · UCSDPlans",
  description: "Filter real UCSD courses by college GE list, university requirement and subject, or describe the quarter you want to Plan with AI.",
};

export default function DiscoverPage() {
  return <CourseDiscovery />;
}
