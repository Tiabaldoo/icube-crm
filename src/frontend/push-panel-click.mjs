export function isPushPanelInteraction(event, panel, anchor) {
  const path = typeof event?.composedPath === 'function' ? event.composedPath() : null;
  if (path?.includes(panel) || (anchor && path?.includes(anchor))) return true;
  return Boolean(panel?.contains?.(event?.target) || anchor?.contains?.(event?.target));
}
