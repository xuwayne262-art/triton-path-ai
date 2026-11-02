"use client";

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

/**
 * The mark as the bar shows it: a 96px copy of the logo (3x a 32px slot),
 * about 12KB, rendered straight into the HTML at a fixed size. It used to fetch
 * the 177KB, 474px original on every page, and only after JavaScript had
 * probed which filename existed, so the header drew late and then shifted.
 * The candidates above stay for anyone replacing the artwork.
 */
export const LOGO_SMALL = "/brand/ucsdplans-logo-96.png";

export default function TridentMark({ className = "h-8 w-8" }: { className?: string }) {
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
      <img src={LOGO_SMALL} alt="" aria-hidden width={96} height={96} decoding="async" className="h-full w-full object-contain" />
    </span>
  );
}
