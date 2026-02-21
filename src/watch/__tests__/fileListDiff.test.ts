import { describe, expect, it } from 'bun:test';
import { haveFilesChanged } from '../utils/fileListDiff';

describe('haveFilesChanged', () => {
  it('returns false for identical lists', () => {
    expect(haveFilesChanged(['a.ts', 'b.ts'], ['a.ts', 'b.ts'])).toBe(false);
  });

  it('returns true when a file is added', () => {
    expect(haveFilesChanged(['a.ts'], ['a.ts', 'b.ts'])).toBe(true);
  });

  it('returns true when a file is removed', () => {
    expect(haveFilesChanged(['a.ts', 'b.ts'], ['a.ts'])).toBe(true);
  });

  it('returns false for same files in different order', () => {
    expect(haveFilesChanged(['b.ts', 'a.ts'], ['a.ts', 'b.ts'])).toBe(false);
  });

  it('returns true when going from empty to non-empty', () => {
    expect(haveFilesChanged([], ['a.ts'])).toBe(true);
  });

  it('returns true when going from non-empty to empty', () => {
    expect(haveFilesChanged(['a.ts'], [])).toBe(true);
  });

  it('returns false when both lists are empty', () => {
    expect(haveFilesChanged([], [])).toBe(false);
  });
});
