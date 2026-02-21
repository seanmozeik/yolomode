import { extname, basename } from 'node:path';

export const FILE_ICONS: Record<string, string> = {
  '.ts': '', // nf-seti-typescript
  '.tsx': '', // nf-seti-typescript (tsx variant)
  '.js': '', // nf-seti-javascript
  '.jsx': '', // nf-seti-javascript (jsx variant)
  '.json': '', // nf-seti-json
  '.md': '', // nf-seti-markdown
  '.sh': '', // nf-seti-shell
  '.toml': '', // nf-seti-config
  '.yaml': '', // nf-seti-yaml
  '.yml': '', // nf-seti-yaml
  '.css': '', // nf-seti-css
  '.scss': '', // nf-seti-sass
  '.html': '', // nf-seti-html
  '.py': '', // nf-seti-python
  '.rs': '', // nf-seti-rust
  '.go': '', // nf-seti-go
  '.lock': '' // nf-fa-lock
};

export function getFileIcon(filename: string): string {
  if (!filename) return '';
  const base = basename(filename);
  // dotfiles like .gitignore have no real extension — extname returns '' for them
  const ext = extname(base);
  if (!ext) return '';
  return FILE_ICONS[ext] ?? '';
}
