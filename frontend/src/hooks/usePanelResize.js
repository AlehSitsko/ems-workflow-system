import { useState, useRef, useEffect } from "react";

// Left-panel/bottom-panel resize state for the Dispatch Board — extracted
// from DispatchBoardPage.jsx (Phase 2 of its hook/component split, see
// docs/ROADMAP.md Priority 1). Persists sizes to the per-user settings
// (ui.panels.dispatch) via the updateSettings callback passed in.

export const DEFAULT_LEFT_WIDTH = 280;
export const DEFAULT_BOTTOM_HEIGHT = 300;

export function usePanelResize({ settingsLoaded, userSettings, updateSettings }) {
  // Resizable left panel (horizontal)
  const [leftWidth, setLeftWidth] = useState(DEFAULT_LEFT_WIDTH);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartW = useRef(DEFAULT_LEFT_WIDTH);
  const leftWidthRef = useRef(DEFAULT_LEFT_WIDTH);

  // Resizable bottom panel (vertical)
  const [bottomHeight, setBottomHeight] = useState(DEFAULT_BOTTOM_HEIGHT);
  const isRowDragging = useRef(false);
  const rowDragStartY = useRef(0);
  const rowDragStartH = useRef(DEFAULT_BOTTOM_HEIGHT);
  const bottomHeightRef = useRef(DEFAULT_BOTTOM_HEIGHT);

  // Ref so the drag mouseup handler can call updateSettings without stale closure
  const updateSettingsRef = useRef(updateSettings);
  updateSettingsRef.current = updateSettings;

  // Initialize panel sizes from saved user settings (runs once when settings load)
  useEffect(() => {
    if (!settingsLoaded) return;
    const saved = userSettings.ui?.panels?.dispatch;
    if (saved?.leftWidth) {
      setLeftWidth(saved.leftWidth);
      leftWidthRef.current = saved.leftWidth;
      dragStartW.current = saved.leftWidth;
    }
    if (saved?.bottomHeight) {
      setBottomHeight(saved.bottomHeight);
      bottomHeightRef.current = saved.bottomHeight;
      rowDragStartH.current = saved.bottomHeight;
    }
  }, [settingsLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function onMove(e) {
      if (isDragging.current) {
        const delta = e.clientX - dragStartX.current;
        const next = Math.max(180, Math.min(520, dragStartW.current + delta));
        leftWidthRef.current = next;
        setLeftWidth(next);
      }
      if (isRowDragging.current) {
        // Drag up = bigger bottom panel
        const delta = rowDragStartY.current - e.clientY;
        const next = Math.max(120, Math.min(600, rowDragStartH.current + delta));
        bottomHeightRef.current = next;
        setBottomHeight(next);
      }
    }
    function onUp() {
      if (isDragging.current || isRowDragging.current) {
        updateSettingsRef.current?.({ ui: { panels: { dispatch: {
          leftWidth:    leftWidthRef.current,
          bottomHeight: bottomHeightRef.current,
        }}}});
      }
      isDragging.current = false;
      isRowDragging.current = false;
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []);

  function handleDividerMouseDown(e) {
    e.preventDefault();
    isDragging.current = true;
    dragStartX.current = e.clientX;
    dragStartW.current = leftWidthRef.current;
  }

  function handleRowDividerMouseDown(e) {
    e.preventDefault();
    isRowDragging.current = true;
    rowDragStartY.current = e.clientY;
    rowDragStartH.current = bottomHeightRef.current;
  }

  function resetLayout() {
    setLeftWidth(DEFAULT_LEFT_WIDTH); leftWidthRef.current = DEFAULT_LEFT_WIDTH;
    setBottomHeight(DEFAULT_BOTTOM_HEIGHT); bottomHeightRef.current = DEFAULT_BOTTOM_HEIGHT;
    updateSettingsRef.current?.({ ui: { panels: { dispatch: { leftWidth: DEFAULT_LEFT_WIDTH, bottomHeight: DEFAULT_BOTTOM_HEIGHT } } } });
  }

  return { leftWidth, bottomHeight, handleDividerMouseDown, handleRowDividerMouseDown, resetLayout };
}
