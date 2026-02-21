import { minimatch } from 'minimatch';

/**
 * Noisy-file blocklist from PRD FR-5.
 * Lockfiles, minified assets, sourcemaps, build artifacts, caches.
 */
const NOISY_PATTERNS: string[] = [
  // Lockfiles (exact basenames)
  'bun.lock',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'Cargo.lock',
  'go.sum',
  'poetry.lock',
  'Pipfile.lock',
  'composer.lock',
  // Glob extension patterns
  '**/*.min.js',
  '**/*.min.css',
  '**/*.map',
  '**/*.pyc',
  '**/.DS_Store',
  '**/*.snap',
  // Directory patterns
  'dist/**',
  'build/**',
  '__pycache__/**',
  '.next/**'
];

export function isNoisyFile(path: string): boolean {
  const basename = path.split('/').pop() ?? path;
  for (const pattern of NOISY_PATTERNS) {
    if (minimatch(path, pattern, { dot: true }) || minimatch(basename, pattern, { dot: true })) {
      return true;
    }
  }
  return false;
}
