import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The course and professor layouts read the dataset from disk to name their
  // pages for link previews; a serverless function only has the files traced
  // into it, and these are read by path, not imported. Plan with AI's routes
  // read it too: the vocabulary the model may answer in, and the sections a
  // change is checked against before it is saved.
  outputFileTracingIncludes: {
    "/api/plan-ai/interpret": ["./public/data/plat/index.json", "./public/data/plat/ge.json"],
    "/api/plan-ai/apply": ["./public/data/plat/index.json", "./public/data/plat/subject/*.json"],
    "/course/[sub]/[num]": ["./public/data/plat/subject/*.json"],
    "/professor/[name]": ["./public/data/plat/professors.json"],
  },
};

export default nextConfig;
