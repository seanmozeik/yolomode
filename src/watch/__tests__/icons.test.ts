import { describe, expect, it } from 'bun:test';
import { FILE_ICONS, getFileIcon } from '../ui/icons';

describe('FILE_ICONS', () => {
  it('has entry for .ts', () => {
    expect(FILE_ICONS['.ts']).toBeDefined();
    expect(typeof FILE_ICONS['.ts']).toBe('string');
  });

  it('has entry for .tsx', () => {
    expect(FILE_ICONS['.tsx']).toBeDefined();
  });

  it('has entry for .js', () => {
    expect(FILE_ICONS['.js']).toBeDefined();
  });

  it('has entry for .jsx', () => {
    expect(FILE_ICONS['.jsx']).toBeDefined();
  });

  it('has entry for .json', () => {
    expect(FILE_ICONS['.json']).toBeDefined();
  });

  it('has entry for .md', () => {
    expect(FILE_ICONS['.md']).toBeDefined();
  });

  it('has entry for .sh', () => {
    expect(FILE_ICONS['.sh']).toBeDefined();
  });

  it('has entry for .toml', () => {
    expect(FILE_ICONS['.toml']).toBeDefined();
  });

  it('has entry for .yaml', () => {
    expect(FILE_ICONS['.yaml']).toBeDefined();
  });

  it('has entry for .yml', () => {
    expect(FILE_ICONS['.yml']).toBeDefined();
  });

  it('has entry for .css', () => {
    expect(FILE_ICONS['.css']).toBeDefined();
  });

  it('has entry for .scss', () => {
    expect(FILE_ICONS['.scss']).toBeDefined();
  });

  it('has entry for .html', () => {
    expect(FILE_ICONS['.html']).toBeDefined();
  });

  it('has entry for .py', () => {
    expect(FILE_ICONS['.py']).toBeDefined();
  });

  it('has entry for .rs', () => {
    expect(FILE_ICONS['.rs']).toBeDefined();
  });

  it('has entry for .go', () => {
    expect(FILE_ICONS['.go']).toBeDefined();
  });

  it('has entry for .lock', () => {
    expect(FILE_ICONS['.lock']).toBeDefined();
  });
});

describe('getFileIcon', () => {
  it('returns icon for .ts extension', () => {
    expect(getFileIcon('src/foo.ts')).toBe(FILE_ICONS['.ts']);
  });

  it('returns icon for .tsx extension', () => {
    expect(getFileIcon('src/watch/components/Foo.tsx')).toBe(FILE_ICONS['.tsx']);
  });

  it('returns icon for bare filename with extension', () => {
    expect(getFileIcon('index.js')).toBe(FILE_ICONS['.js']);
  });

  it('strips path and uses only the filename extension', () => {
    expect(getFileIcon('a/b/c/config.json')).toBe(FILE_ICONS['.json']);
  });

  it('returns empty string for unknown extension', () => {
    expect(getFileIcon('file.unknownext123')).toBe('');
  });

  it('returns empty string for no extension', () => {
    expect(getFileIcon('Makefile')).toBe('');
  });

  it('returns empty string for empty string input', () => {
    expect(getFileIcon('')).toBe('');
  });

  it('handles dotfiles with no extension (e.g. .gitignore)', () => {
    // A dotfile like .gitignore has no real extension — fallback to ''
    expect(getFileIcon('.gitignore')).toBe('');
  });

  it('returns icon for .yaml extension', () => {
    expect(getFileIcon('docker-compose.yaml')).toBe(FILE_ICONS['.yaml']);
  });

  it('returns icon for .yml extension', () => {
    expect(getFileIcon('.github/workflows/ci.yml')).toBe(FILE_ICONS['.yml']);
  });
});
