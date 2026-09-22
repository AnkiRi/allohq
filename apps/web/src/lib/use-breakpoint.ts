"use client";

import * as React from "react";

/**
 * Whether the viewport is at least Tailwind's `xl` (1280px).
 *
 * The Studio's side panes need this in JavaScript, not only in CSS. Collapsing
 * a pane by toggling `xl:hidden` against `xl:flex` left two display utilities
 * of equal specificity fighting, and which one won depended on the order
 * Tailwind happened to emit them — so the panel stayed visible while its grid
 * column disappeared, and it wrapped into a strip underneath the outline.
 *
 * Deciding in JS means one rendered layout per breakpoint instead of two
 * overlapping sets of classes.
 */
export function useIsDesktop(): boolean {
  const subscribe = React.useCallback((onChange: () => void) => {
    const query = window.matchMedia("(min-width: 1280px)");
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia("(min-width: 1280px)").matches,
    // Server render assumes desktop: the Studio is a desktop-first surface, and
    // assuming mobile would flash the drawer layout on every desktop load.
    () => true,
  );
}
