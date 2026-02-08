"use client";

import { useEffect, useState } from "react";

/**
 * Breakpoints (consistent across the app):
 *   < 640px  → "mobile-sm" (small phone)
 *   < 768px  → "mobile" (phone, bottom tabs, single view)
 *   < 1024px → "tablet" (collapsible sidebar overlay, editor + chat)
 *   ≥ 1024px → "desktop" (sidebar + editor + chat panel)
 */
type Breakpoint = "mobile-sm" | "mobile" | "tablet" | "desktop";

export const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
} as const;

function getBreakpoint(): Breakpoint {
  if (typeof window === "undefined") return "desktop";
  const w = window.innerWidth;
  if (w < BREAKPOINTS.sm) return "mobile-sm";
  if (w < BREAKPOINTS.md) return "mobile";
  if (w < BREAKPOINTS.lg) return "tablet";
  return "desktop";
}

export function useResponsive() {
  const [breakpoint, setBreakpoint] = useState<Breakpoint>(() => getBreakpoint());

  useEffect(() => {
    const mqlSm = window.matchMedia(`(max-width: ${BREAKPOINTS.sm - 1}px)`);
    const mqlMobile = window.matchMedia(
      `(min-width: ${BREAKPOINTS.sm}px) and (max-width: ${BREAKPOINTS.md - 1}px)`,
    );
    const mqlTablet = window.matchMedia(
      `(min-width: ${BREAKPOINTS.md}px) and (max-width: ${BREAKPOINTS.lg - 1}px)`,
    );

    function onChange() {
      setBreakpoint(getBreakpoint());
    }

    mqlSm.addEventListener("change", onChange);
    mqlMobile.addEventListener("change", onChange);
    mqlTablet.addEventListener("change", onChange);
    return () => {
      mqlSm.removeEventListener("change", onChange);
      mqlMobile.removeEventListener("change", onChange);
      mqlTablet.removeEventListener("change", onChange);
    };
  }, []);

  return {
    breakpoint,
    isMobileSm: breakpoint === "mobile-sm",
    isMobile: breakpoint === "mobile-sm" || breakpoint === "mobile",
    isTablet: breakpoint === "tablet",
    isDesktop: breakpoint === "desktop",
  };
}
