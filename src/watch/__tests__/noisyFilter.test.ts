import { describe, expect, it } from 'bun:test';
import { isNoisyFile } from '../utils/noisyFilter';

// ── isNoisyFile — noisy-file blocklist from PRD FR-5 ────────────

describe('isNoisyFile', () => {
  // ── Exact-name lockfiles ──────────────────────────────────────
  it('matches bun.lock', () => {
    expect(isNoisyFile('bun.lock')).toBe(true);
  });

  it('matches package-lock.json', () => {
    expect(isNoisyFile('package-lock.json')).toBe(true);
  });

  it('matches yarn.lock', () => {
    expect(isNoisyFile('yarn.lock')).toBe(true);
  });

  it('matches pnpm-lock.yaml', () => {
    expect(isNoisyFile('pnpm-lock.yaml')).toBe(true);
  });

  it('matches Cargo.lock', () => {
    expect(isNoisyFile('Cargo.lock')).toBe(true);
  });

  it('matches go.sum', () => {
    expect(isNoisyFile('go.sum')).toBe(true);
  });

  it('matches poetry.lock', () => {
    expect(isNoisyFile('poetry.lock')).toBe(true);
  });

  it('matches Pipfile.lock', () => {
    expect(isNoisyFile('Pipfile.lock')).toBe(true);
  });

  it('matches composer.lock', () => {
    expect(isNoisyFile('composer.lock')).toBe(true);
  });

  // ── Glob extension patterns ───────────────────────────────────
  it('matches *.min.js', () => {
    expect(isNoisyFile('vendor/jquery.min.js')).toBe(true);
  });

  it('matches *.min.css', () => {
    expect(isNoisyFile('styles/app.min.css')).toBe(true);
  });

  it('matches *.map', () => {
    expect(isNoisyFile('dist/bundle.js.map')).toBe(true);
  });

  it('matches *.pyc', () => {
    expect(isNoisyFile('module.pyc')).toBe(true);
  });

  it('matches .DS_Store', () => {
    expect(isNoisyFile('.DS_Store')).toBe(true);
  });

  it('matches *.snap', () => {
    expect(isNoisyFile('__tests__/component.test.snap')).toBe(true);
  });

  // ── Directory glob patterns ───────────────────────────────────
  it('matches dist/**', () => {
    expect(isNoisyFile('dist/bundle.js')).toBe(true);
  });

  it('matches dist/** nested', () => {
    expect(isNoisyFile('dist/assets/styles.css')).toBe(true);
  });

  it('matches build/**', () => {
    expect(isNoisyFile('build/output.js')).toBe(true);
  });

  it('matches build/** nested', () => {
    expect(isNoisyFile('build/static/main.js')).toBe(true);
  });

  it('matches __pycache__/**', () => {
    expect(isNoisyFile('__pycache__/module.cpython-39.pyc')).toBe(true);
  });

  it('matches .next/**', () => {
    expect(isNoisyFile('.next/static/chunks/app.js')).toBe(true);
  });

  // ── NOT noisy — regular source files ──────────────────────────
  it('does NOT match src/cmd-watch.ts', () => {
    expect(isNoisyFile('src/cmd-watch.ts')).toBe(false);
  });

  it('does NOT match README.md', () => {
    expect(isNoisyFile('README.md')).toBe(false);
  });

  it('does NOT match src/watch/components/Foo.tsx', () => {
    expect(isNoisyFile('src/watch/components/Foo.tsx')).toBe(false);
  });

  it('does NOT match package.json', () => {
    expect(isNoisyFile('package.json')).toBe(false);
  });

  it('does NOT match tsconfig.json', () => {
    expect(isNoisyFile('tsconfig.json')).toBe(false);
  });

  it('does NOT match src/utils.ts', () => {
    expect(isNoisyFile('src/utils.ts')).toBe(false);
  });
});
