import { useEffect, useState } from "react";

/**
 * Subscribe to a CSS media query.
 *
 * Layout is CSS-driven wherever possible; this exists for the cases where
 * behaviour (not just styling) differs — e.g. the sidebar is an off-canvas
 * dialog that needs a focus trap on mobile, and a permanent landmark on desktop.
 */
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(
    () => typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia(query).matches
      : false,
  );

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const mql = window.matchMedia(query);
    const onChange = (e) => setMatches(e.matches);
    setMatches(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

// Below this width the sidebar becomes an off-canvas overlay and the header
// gains a hamburger. Kept here so JS behaviour and the CSS breakpoint cannot
// drift apart.
export const MOBILE_NAV_BREAKPOINT = "(max-width: 991.98px)";

export function useIsMobileNav() {
  return useMediaQuery(MOBILE_NAV_BREAKPOINT);
}
