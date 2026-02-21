/**
 * Returns true when the two file path lists differ (order-independent).
 * Used by useDirtyPoller to detect when the set of changed files has changed.
 */
export function haveFilesChanged(prev: string[], next: string[]): boolean {
  if (prev.length !== next.length) return true;
  const sortedPrev = [...prev].sort();
  const sortedNext = [...next].sort();
  return sortedPrev.some((p, i) => p !== sortedNext[i]);
}
