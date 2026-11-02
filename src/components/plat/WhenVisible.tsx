"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Renders its children once their place comes within `margin` of the
 * viewport, and a same-sized placeholder until then. For heavy, below-the-fold
 * parts (the course page's map pulls in MapLibre, ~270KB compressed): they
 * used to load with the page and compete with what the student came to read.
 */
export default function WhenVisible({
  children, placeholder, margin = "400px",
}: { children: React.ReactNode; placeholder: React.ReactNode; margin?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    // Without IntersectionObserver (very old browsers) the observer below is
    // skipped and the callback-less path shows the content straight away.
    if (!el || seen || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect(); }
    }, { rootMargin: margin });
    io.observe(el);
    return () => io.disconnect();
  }, [seen, margin]);
  const show = seen || (typeof window !== "undefined" && typeof IntersectionObserver === "undefined");
  return <div ref={ref}>{show ? children : placeholder}</div>;
}
