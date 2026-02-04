"use client";

import { useEffect, useState } from "react";

type Breakpoint = "mobile" | "tablet" | "desktop";

export function useResponsive() {
  const [breakpoint, setBreakpoint] = useState<Breakpoint>("desktop");

  useEffect(() => {
    function getBreakpoint(): Breakpoint {
      const w = window.innerWidth;
      if (w < 768) return "mobile";
      if (w < 1024) return "tablet";
      return "desktop";
    }

    setBreakpoint(getBreakpoint());

    const mqlMobile = window.matchMedia("(max-width: 767px)");
    const mqlTablet = window.matchMedia(
      "(min-width: 768px) and (max-width: 1023px)",
    );

    function onChange() {
      setBreakpoint(getBreakpoint());
    }

    mqlMobile.addEventListener("change", onChange);
    mqlTablet.addEventListener("change", onChange);
    return () => {
      mqlMobile.removeEventListener("change", onChange);
      mqlTablet.removeEventListener("change", onChange);
    };
  }, []);

  return {
    breakpoint,
    isMobile: breakpoint === "mobile",
    isTablet: breakpoint === "tablet",
    isDesktop: breakpoint === "desktop",
  };
}
