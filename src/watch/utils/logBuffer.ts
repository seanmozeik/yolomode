/**
 * Pure buffer management for log streaming.
 * Splits newChunk into lines, appends to existing lines, and trims
 * oldest entries when the buffer exceeds 5500 (down to cap).
 */
export function manageBuffer(lines: string[], newChunk: string, cap: number): string[] {
  if (newChunk === '') return [...lines];

  const appended = [...lines, ...newChunk.split('\n')];

  // Hysteresis: only trim when clearly over threshold to avoid per-line O(n) cost
  const trimThreshold = cap + 500;
  if (appended.length > trimThreshold) {
    return appended.slice(appended.length - cap);
  }

  return appended;
}
