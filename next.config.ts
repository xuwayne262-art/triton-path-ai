import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The course and professor layouts read the dataset from disk to name their
  // pages for link previews; a serverless function only has the files traced
  // into it, and these are read by path, not imported.
  outputFileTracingIncludes: {
    "/course/[sub]/[num]": ["./public/data/plat/subject/*.json"],
    "/professor/[name]": ["./public/data/plat/professors.json"],
  },
};

export default nextConfig;
