// Delimiter balancing for syntax highlighting in diff hunks.
//
// When a diff hunk starts inside a paired delimiter (template literal,
// triple-quoted string, fenced code block, etc.), tree-sitter sees an
// odd number of that delimiter and misparses everything after the first
// occurrence.
//
// Two-pass fix:
//   1. Tokenizer: count delimiter occurrences in each hunk's content,
//      skipping escaped characters.
//   2. Fix: if a hunk has an odd count, prepend a balancing delimiter to
//      the first content line so tree-sitter sees balanced pairs.

const LANGUAGE_DELIMITERS: Record<string, string[]> = {
  go: ['`'],
  julia: ['"""'],
  markdown: ['```'],
  python: ['"""', "'''"],
  scala: ['"""'],
  swift: ['"""'],
  typescript: ['`']
};

/**
 * Count unescaped occurrences of a delimiter in a code string.
 *
 * Walks character by character. Backslash skips the next character,
 * otherwise checks for the delimiter at the current position.
 */
export function countDelimiter(code: string, delimiter: string): number {
  let count = 0;
  const len = delimiter.length;

  for (let i = 0; i < code.length; i++) {
    if (code[i] === '\\') {
      i++;
    } else if (code.startsWith(delimiter, i)) {
      count++;
      i += len - 1;
    }
  }

  return count;
}

interface DiffHunk {
  header: string;
  lines: string[];
}

/**
 * Balance paired delimiters in a unified diff patch for correct syntax
 * highlighting.
 */
export function balanceDelimiters(rawDiff: string, filetype?: string): string {
  if (!filetype) return rawDiff;
  const delimiters = LANGUAGE_DELIMITERS[filetype];
  if (!delimiters) return rawDiff;

  const lines = rawDiff.split('\n');
  const fileHeader: string[] = [];
  const hunks: DiffHunk[] = [];

  for (const line of lines) {
    if (line.startsWith('@@')) {
      hunks.push({ header: line, lines: [] });
    } else if (hunks.length > 0) {
      hunks[hunks.length - 1]?.lines.push(line);
    } else {
      fileHeader.push(line);
    }
  }

  if (hunks.length === 0) return rawDiff;

  const result = [...fileHeader];

  for (const hunk of hunks) {
    const content = hunk.lines
      .filter((l) => l[0] === ' ' || l[0] === '+' || l[0] === '-')
      .map((l) => l.slice(1))
      .join('\n');

    let unbalanced: string | undefined;
    for (const delim of delimiters) {
      if (countDelimiter(content, delim) % 2 !== 0) {
        unbalanced = delim;
        break;
      }
    }

    result.push(hunk.header);

    if (unbalanced) {
      let fixed = false;
      for (const line of hunk.lines) {
        if (!fixed && (line[0] === ' ' || line[0] === '+' || line[0] === '-')) {
          result.push(line[0] + unbalanced + line.slice(1));
          fixed = true;
        } else {
          result.push(line);
        }
      }
    } else {
      result.push(...hunk.lines);
    }
  }

  return result.join('\n');
}
