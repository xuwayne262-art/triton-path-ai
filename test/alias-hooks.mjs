import { statSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Module resolution for the Node test runner.
 *
 * The app is compiled by Next, so its sources use the "@/*" -> "src/*" alias
 * from tsconfig.json and omit file extensions - both perfectly normal for a
 * bundler, and both unknown to plain Node. This hook teaches Node the same two
 * rules. Node 24 strips the TypeScript itself, so nothing else is needed: no
 * test framework, no bundler, no extra dependency.
 */
const SRC = new URL("../src/", import.meta.url);
const EXTENSIONS = [".ts", ".tsx", ".mts", ".js", "/index.ts", "/index.tsx"];

function isFile(url) {
  try {
    return statSync(fileURLToPath(url)).isFile();
  } catch {
    return false;
  }
}

function firstExisting(base) {
  if (isFile(base)) return base;
  for (const ext of EXTENSIONS) {
    const candidate = new URL(base.href + ext);
    if (isFile(candidate)) return candidate;
  }
  return null;
}

export function resolve(specifier, context, nextResolve) {
  let base = null;
  if (specifier.startsWith("@/")) {
    base = new URL(specifier.slice(2), SRC);
  } else if (specifier.startsWith("./") || specifier.startsWith("../")) {
    if (context.parentURL) base = new URL(specifier, context.parentURL);
  }

  if (base) {
    const hit = firstExisting(base);
    if (hit) return nextResolve(hit.href, context);
  }
  return nextResolve(specifier, context);
}
