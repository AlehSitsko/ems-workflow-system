import { useCallback, useEffect, useRef } from "react";
import { useBlocker } from "react-router-dom";

import { useConfirm } from "../components/ui/useConfirm";

/**
 * Guard against losing unsaved edits on ANY in-app navigation — sidebar links,
 * the command palette, a back button — not just a page's own controls.
 *
 * Needs the data router (createHashRouter); with the old <HashRouter> component
 * useBlocker is unavailable, which is why the app migrated. Same-path changes
 * (e.g. a workspace's `?tab=` switch) are intentionally not blocked here — the
 * workspace guards those itself.
 *
 * Returns `allowNext()`: call it synchronously right before a programmatic
 * navigate that should NOT prompt (e.g. navigating away after a successful
 * save), since React state that clears `dirty` hasn't committed yet at that
 * point. The block decision reads a live ref, so allowNext takes effect at once.
 *
 * Pair with a full-page-unload handler for browser close/refresh, which a
 * router blocker cannot intercept.
 */
export function useUnsavedGuard(dirty) {
  const confirm = useConfirm();
  const activeRef = useRef(dirty);
  activeRef.current = dirty;

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      activeRef.current && currentLocation.pathname !== nextLocation.pathname,
  );

  // Depend on blocker.state, not the blocker object: React Router can return a
  // stable blocker reference and only mutate .state, so keying on the object
  // would miss the transition into "blocked".
  useEffect(() => {
    if (blocker.state !== "blocked") return undefined;
    let live = true;
    confirm({
      title: "Discard unsaved changes?",
      message: "You have unsaved edits on this page. Leave without saving?",
      variant: "warning",
      confirmLabel: "Discard",
    }).then((ok) => {
      if (!live) return;
      if (ok) blocker.proceed();
      else blocker.reset();
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocker.state, confirm]);

  // Suppress the guard for the very next navigation (post-save redirect).
  const allowNext = useCallback(() => { activeRef.current = false; }, []);
  return { allowNext };
}
