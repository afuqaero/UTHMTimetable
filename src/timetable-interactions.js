export const TOUCH_TAP_THRESHOLD = 10;

export const isTapGesture = (start, end, threshold = TOUCH_TAP_THRESHOLD) => (
  Math.hypot(end.clientX - start.startX, end.clientY - start.startY) < threshold
);
