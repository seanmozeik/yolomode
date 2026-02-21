import { describe, expect, it } from 'bun:test';
import { balanceDelimiters, countDelimiter } from '../utils/balanceDelimiters';
import { detectFiletype } from '../utils/detectFiletype';

// ── balanceDelimiters ───────────────────────────────────────────

describe('countDelimiter', () => {
  it('counts unescaped backticks', () => {
    expect(countDelimiter('`hello` `world`', '`')).toBe(4);
  });

  it('skips escaped backticks', () => {
    expect(countDelimiter('\\`hello`', '`')).toBe(1);
  });

  it('counts multi-char delimiters', () => {
    expect(countDelimiter('"""hello"""', '"""')).toBe(2);
  });

  it('returns 0 for empty string', () => {
    expect(countDelimiter('', '`')).toBe(0);
  });
});

describe('balanceDelimiters', () => {
  it('returns unchanged when delimiters are balanced', () => {
    const diff = [
      'diff --git a/foo.ts b/foo.ts',
      '--- a/foo.ts',
      '+++ b/foo.ts',
      '@@ -1,3 +1,3 @@',
      ' const a = `hello`;',
      '-const b = `old`;',
      '+const b = `new`;'
    ].join('\n');

    expect(balanceDelimiters(diff, 'typescript')).toBe(diff);
  });

  it('prepends balancing backtick when hunk has odd count', () => {
    // Content has 1 backtick (odd) — needs balancing
    const diff = [
      'diff --git a/foo.ts b/foo.ts',
      '--- a/foo.ts',
      '+++ b/foo.ts',
      '@@ -1,2 +1,2 @@',
      ' const a = `hello',
      '+world'
    ].join('\n');

    const result = balanceDelimiters(diff, 'typescript');
    const lines = result.split('\n');

    // The first content line should have backtick prepended after the prefix
    expect(lines[4]).toBe(' `const a = `hello');
  });

  it('returns unchanged for unknown filetype', () => {
    const diff = '@@ -1,1 +1,1 @@\n const a = `unbalanced';
    expect(balanceDelimiters(diff, 'unknown_lang')).toBe(diff);
  });

  it('returns unchanged when no filetype provided', () => {
    const diff = '@@ -1,1 +1,1 @@\n const a = `unbalanced';
    expect(balanceDelimiters(diff)).toBe(diff);
  });

  it('returns empty string unchanged', () => {
    expect(balanceDelimiters('', 'typescript')).toBe('');
  });

  it('handles python triple-quote delimiters', () => {
    const diff = [
      'diff --git a/foo.py b/foo.py',
      '--- a/foo.py',
      '+++ b/foo.py',
      '@@ -1,2 +1,2 @@',
      '+doc = """hello',
      '+world'
    ].join('\n');

    const result = balanceDelimiters(diff, 'python');
    const lines = result.split('\n');

    // First content line should have """ prepended after +
    expect(lines[4]).toBe('+"""doc = """hello');
  });
});

// ── detectFiletype ──────────────────────────────────────────────

describe('detectFiletype', () => {
  it('maps .ts to typescript', () => {
    expect(detectFiletype('src/foo.ts')).toBe('typescript');
  });

  it('maps .tsx to typescript', () => {
    expect(detectFiletype('src/foo.tsx')).toBe('typescript');
  });

  it('maps .js to typescript', () => {
    expect(detectFiletype('src/foo.js')).toBe('typescript');
  });

  it('maps .json to json', () => {
    expect(detectFiletype('config.json')).toBe('json');
  });

  it('maps .md to markdown', () => {
    expect(detectFiletype('README.md')).toBe('markdown');
  });

  it('maps .py to python', () => {
    expect(detectFiletype('main.py')).toBe('python');
  });

  it('returns undefined for unknown extension', () => {
    expect(detectFiletype('file.xyz')).toBeUndefined();
  });

  it('maps .rs to rust', () => {
    expect(detectFiletype('lib.rs')).toBe('rust');
  });

  it('maps .go to go', () => {
    expect(detectFiletype('main.go')).toBe('go');
  });

  it('maps .css to css', () => {
    expect(detectFiletype('styles.css')).toBe('css');
  });

  it('maps .yaml to yaml', () => {
    expect(detectFiletype('config.yaml')).toBe('yaml');
  });

  it('maps .yml to yaml', () => {
    expect(detectFiletype('config.yml')).toBe('yaml');
  });

  it('maps .html to html', () => {
    expect(detectFiletype('index.html')).toBe('html');
  });

  it('maps .sh to bash', () => {
    expect(detectFiletype('run.sh')).toBe('bash');
  });

  it('handles uppercase extensions', () => {
    expect(detectFiletype('file.TS')).toBe('typescript');
  });
});
