/**
 * Map a file path's extension to a tree-sitter parser name.
 * Ported from critique's src/diff-utils.ts.
 */
export function detectFiletype(filePath: string): string | undefined {
  const ext = filePath.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'ts':
    case 'tsx':
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs':
    case 'mts':
    case 'cts':
      return 'typescript';
    case 'json':
      return 'json';
    case 'md':
    case 'mdx':
      return 'markdown';
    case 'zig':
      return 'zig';
    case 'py':
    case 'pyw':
    case 'pyi':
      return 'python';
    case 'rs':
      return 'rust';
    case 'go':
      return 'go';
    case 'cpp':
    case 'cc':
    case 'cxx':
    case 'hpp':
    case 'hxx':
    case 'h':
      return 'cpp';
    case 'cs':
      return 'csharp';
    case 'sh':
    case 'bash':
    case 'zsh':
      return 'bash';
    case 'c':
      return 'c';
    case 'java':
      return 'java';
    case 'rb':
    case 'rake':
    case 'gemspec':
      return 'ruby';
    case 'php':
      return 'php';
    case 'scala':
    case 'sc':
      return 'scala';
    case 'html':
    case 'htm':
      return 'html';
    case 'yaml':
    case 'yml':
      return 'yaml';
    case 'hs':
    case 'lhs':
      return 'haskell';
    case 'css':
      return 'css';
    case 'jl':
      return 'julia';
    case 'ml':
    case 'mli':
      return 'ocaml';
    case 'clj':
    case 'cljs':
    case 'cljc':
    case 'edn':
      return 'clojure';
    case 'swift':
      return 'swift';
    case 'nix':
      return 'nix';
    default:
      return undefined;
  }
}
