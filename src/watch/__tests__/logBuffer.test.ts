import { describe, expect, it } from 'bun:test';
import { manageBuffer } from '../utils/logBuffer';

// ── manageBuffer — pure log buffer management ────────────────────

describe('manageBuffer', () => {
  // ── newline splitting ──────────────────────────────────────────

  it('splits a multi-line chunk into separate lines', () => {
    const result = manageBuffer([], 'line1\nline2\nline3', 5000);
    expect(result).toEqual(['line1', 'line2', 'line3']);
  });

  it('appends a single-line chunk to existing lines', () => {
    const result = manageBuffer(['existing'], 'new\n', 5000);
    expect(result).toEqual(['existing', 'new', '']);
  });

  // ── empty / no-op cases ───────────────────────────────────────

  it('returns lines unchanged when chunk is empty string', () => {
    const lines = ['a', 'b', 'c'];
    const result = manageBuffer(lines, '', 5000);
    expect(result).toEqual(['a', 'b', 'c']);
  });

  it('returns new empty array when both lines and chunk are empty', () => {
    const result = manageBuffer([], '', 5000);
    expect(result).toEqual([]);
  });

  // ── no trailing newline ───────────────────────────────────────

  it('handles chunk with no trailing newline', () => {
    const result = manageBuffer([], 'hello world', 5000);
    expect(result).toEqual(['hello world']);
  });

  it('appends partial chunk (no trailing newline) to existing lines', () => {
    const result = manageBuffer(['a', 'b'], 'c', 5000);
    expect(result).toEqual(['a', 'b', 'c']);
  });

  // ── buffer cap: under threshold is NOT trimmed ────────────────

  it('does not trim when buffer length is under 5500 (at 5000)', () => {
    const lines = Array.from({ length: 5000 }, (_, i) => `line-${i}`);
    const result = manageBuffer(lines, 'extra\n', 5000);
    expect(result.length).toBe(5002); // 5000 + 'extra' + ''
  });

  it('does not trim when buffer length is exactly 5499', () => {
    const lines = Array.from({ length: 5499 }, (_, i) => `line-${i}`);
    const result = manageBuffer(lines, 'x', 5000);
    expect(result.length).toBe(5500);
  });

  // ── buffer cap: over 5500 trims to cap (5000) ─────────────────

  it('trims to cap when buffer exceeds 5500 (oldest lines dropped)', () => {
    const lines = Array.from({ length: 5500 }, (_, i) => `old-${i}`);
    const result = manageBuffer(lines, 'new-line', 5000);
    expect(result.length).toBe(5000);
  });

  it('keeps newest lines when trimming (drops oldest)', () => {
    const lines = Array.from({ length: 5500 }, (_, i) => `line-${i}`);
    // After appending 'new', total = 5501 → trim to 5000
    // Oldest dropped, newest kept
    const result = manageBuffer(lines, 'newest', 5000);
    expect(result[result.length - 1]).toBe('newest');
    expect(result[0]).not.toBe('line-0'); // oldest was dropped
  });

  it('returns a new array (pure — does not mutate input)', () => {
    const lines = ['a', 'b'];
    const result = manageBuffer(lines, 'c', 5000);
    expect(result).not.toBe(lines);
    expect(lines).toEqual(['a', 'b']); // original unchanged
  });
});
