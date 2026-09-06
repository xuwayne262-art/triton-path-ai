"use client";

import { useEffect, useState } from "react";

/**
 * The UCSDPlans mark. This renders the real logo file rather than a drawn copy:
 * earlier revisions hand-authored the trident as SVG paths and never matched the
 * artwork — the real mark's heads are swept-back barbed spearpoints, not the
 * three-prong forks a path redraw kept producing.
 *
 * Save the logo as any ONE of the paths below, under `public/`. The component
 * probes them in order and uses the first that loads, so the exact filename and
 * extension do not have to be guessed. When none load it renders nothing,
 * leaving the wordmark alone rather than a broken-image icon.
 */
export const LOGO_CANDIDATES = [
  "/brand/ucsdplans-logo.png",
  "/brand/ucsdplans-logo.svg",
  "/brand/ucsdplans-logo.jpg",
  "/brand/ucsdplans-logo.jpeg",
  "/brand/ucsdplans-logo.webp",
  "/brand/logo.png",
  "/logo.png",
] as const;

export default function TridentMark({ className = "h-8 w-8" }: { className?: string }) {
  const [src, setSrc] = useState<string | null>(null);

  // Probed with Image() rather than rendering an <img> and leaning on onError.
  // Server-rendering the first candidate means the browser requests it while the
  // HTML is still parsing, so a 404 lands BEFORE React hydrates and attaches
  // onError — the event is lost and the chain stalls on candidate one forever.
  // (It looks fine under hot reload, where the component mounts client-side and
  // the handler beats the request, which is what made this easy to miss.)
  // Resolving here also keeps setState out of the effect body, so there are no
  // cascading re-renders per candidate.
  useEffect(() => {
    let cancelled = false;

    const probe = (url: string) =>
      new Promise<boolean>((resolve) => {
        const img = new window.Image();
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
        img.src = url;
      });

    (async () => {
      for (const candidate of LOGO_CANDIDATES) {
        if (await probe(candidate)) {
          if (!cancelled) setSrc(candidate);
          return;
        }
        if (cancelled) return;
      }
    })();

    return () => { cancelled = true; };
  }, []);

  if (!src) return null;

  return (
    // Sat on a white tile rather than straight on the header. The artwork is a
    // flat RGB PNG with no alpha, so its own white background renders as a bright
    // square against the dark theme; giving it a rounded white plate makes that
    // deliberate instead of broken, and leaves the image itself untouched. In
    // light mode the plate is invisible against the white header.
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-white ${className}`}
    >
      {/* The wordmark sits next to it, so the image is decorative — labelling it
          would make a screen reader announce "UCSDPlans" twice. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" aria-hidden className="h-full w-full object-contain" />
    </span>
  );
}
