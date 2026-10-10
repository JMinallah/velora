"use client";

import { useEffect } from "react";

/**
 * Marks <html data-hydrated> once React has hydrated. Browser tests wait for
 * it before typing: input into server-rendered fields before hydration is
 * discarded when React takes over. Harmless in production.
 */
export function HydrationMarker() {
  useEffect(() => {
    document.documentElement.dataset.hydrated = "true";
  }, []);
  return null;
}
