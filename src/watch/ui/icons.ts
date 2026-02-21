import { basename, extname } from 'node:path';

export const FILE_ICONS: Record<string, string> = {
  '.css': '', // nf-seti-css
  '.go': '', // nf-seti-go
  '.html': '', // nf-seti-html
  '.js': '', // nf-seti-javascript
  '.json': '', // nf-seti-json
  '.jsx': '', // nf-seti-javascript (jsx variant)
  '.lock': '', // nf-fa-lock
  '.md': '', // nf-seti-markdown
  '.py': '', // nf-seti-python
  '.rs': '', // nf-seti-rust
  '.scss': '', // nf-seti-sass
  '.sh': '', // nf-seti-shell
  '.toml': '', // nf-seti-config
  '.ts': '', // nf-seti-typescript
  '.tsx': '', // nf-seti-typescript (tsx variant)
  '.yaml': '', // nf-seti-yaml
  '.yml': '' // nf-seti-yaml
};

export function getFileIcon(filename: string): string {
  if (!filename) return '';
  const base = basename(filename);
  // dotfiles like .gitignore have no real extension — extname returns '' for them
  const ext = extname(base);
  if (!ext) return '';
  return FILE_ICONS[ext] ?? '';
}
