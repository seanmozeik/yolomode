import { describe, expect, it } from 'bun:test';
import {
  buildInternalTree,
  collapseNode,
  flattenTree,
  type InternalTreeNode,
  type TreeFileInfo
} from '../utils/directoryTree';

// ── buildInternalTree ───────────────────────────────────────────

describe('buildInternalTree', () => {
  it('returns empty array for empty input', () => {
    expect(buildInternalTree([])).toEqual([]);
  });

  it('creates a single root-level file node', () => {
    const files: TreeFileInfo[] = [{ additions: 3, deletions: 1, path: 'README.md', status: 'M' }];
    const tree = buildInternalTree(files);
    expect(tree).toHaveLength(1);
    expect(tree[0].path).toBe('README.md');
    expect(tree[0].status).toBe('M');
    expect(tree[0].additions).toBe(3);
    expect(tree[0].deletions).toBe(1);
    expect(tree[0].children).toEqual([]);
  });

  it('builds nested hierarchy from paths', () => {
    const files: TreeFileInfo[] = [
      { additions: 10, deletions: 0, path: 'src/utils/foo.ts', status: 'A' },
      { additions: 5, deletions: 2, path: 'src/utils/bar.ts', status: 'M' }
    ];
    const tree = buildInternalTree(files);
    // root: src/
    expect(tree).toHaveLength(1);
    expect(tree[0].path).toBe('src');
    expect(tree[0].status).toBeUndefined(); // directory, not file
    // src/utils/
    expect(tree[0].children).toHaveLength(1);
    const utils = tree[0].children[0];
    expect(utils.path).toBe('src/utils');
    expect(utils.status).toBeUndefined();
    // src/utils/foo.ts, src/utils/bar.ts
    expect(utils.children).toHaveLength(2);
    expect(utils.children[0].path).toBe('src/utils/foo.ts');
    expect(utils.children[0].status).toBe('A');
    expect(utils.children[1].path).toBe('src/utils/bar.ts');
    expect(utils.children[1].status).toBe('M');
  });

  it('preserves fileIndex on file nodes', () => {
    const files: TreeFileInfo[] = [
      { additions: 1, deletions: 0, fileIndex: 0, path: 'a.ts', status: 'A' },
      { additions: 2, deletions: 1, fileIndex: 1, path: 'b.ts', status: 'M' }
    ];
    const tree = buildInternalTree(files);
    expect(tree[0].fileIndex).toBe(0);
    expect(tree[1].fileIndex).toBe(1);
  });

  it('shares intermediate directory nodes for common prefixes', () => {
    const files: TreeFileInfo[] = [
      { additions: 1, deletions: 0, path: 'src/a.ts', status: 'A' },
      { additions: 2, deletions: 1, path: 'src/b.ts', status: 'M' },
      { additions: 0, deletions: 5, path: 'lib/c.ts', status: 'D' }
    ];
    const tree = buildInternalTree(files);
    expect(tree).toHaveLength(2); // src and lib
    expect(tree[0].path).toBe('src');
    expect(tree[0].children).toHaveLength(2);
    expect(tree[1].path).toBe('lib');
    expect(tree[1].children).toHaveLength(1);
  });
});

// ── collapseNode ────────────────────────────────────────────────

describe('collapseNode', () => {
  it('does not collapse a file node', () => {
    const node: InternalTreeNode = {
      additions: 1,
      children: [],
      deletions: 0,
      path: 'README.md',
      status: 'M'
    };
    const result = collapseNode(node);
    expect(result.path).toBe('README.md');
    expect(result.collapsed).toBe(false);
  });

  it('collapses single-child directory chain', () => {
    // src/ -> utils/ -> foo.ts
    const node: InternalTreeNode = {
      children: [
        {
          children: [
            {
              additions: 5,
              children: [],
              deletions: 2,
              path: 'src/utils/foo.ts',
              status: 'M'
            }
          ],
          path: 'src/utils'
        }
      ],
      path: 'src'
    };
    const result = collapseNode(node);
    expect(result.path).toBe('src/utils');
    expect(result.collapsed).toBe(true);
    // Children should be the file
    expect(result.children).toHaveLength(1);
    expect(result.children[0].status).toBe('M');
  });

  it('does not collapse when directory has multiple children', () => {
    const node: InternalTreeNode = {
      children: [
        { additions: 1, children: [], deletions: 0, path: 'src/a.ts', status: 'A' },
        { additions: 2, children: [], deletions: 1, path: 'src/b.ts', status: 'M' }
      ],
      path: 'src'
    };
    const result = collapseNode(node);
    expect(result.path).toBe('src');
    expect(result.collapsed).toBe(false);
    expect(result.children).toHaveLength(2);
  });

  it('collapses deeply nested single-child chains', () => {
    // a/ -> b/ -> c/ -> file.ts
    const node: InternalTreeNode = {
      children: [
        {
          children: [
            {
              children: [
                {
                  additions: 10,
                  children: [],
                  deletions: 0,
                  path: 'a/b/c/file.ts',
                  status: 'A'
                }
              ],
              path: 'a/b/c'
            }
          ],
          path: 'a/b'
        }
      ],
      path: 'a'
    };
    const result = collapseNode(node);
    expect(result.path).toBe('a/b/c');
    expect(result.collapsed).toBe(true);
    expect(result.children).toHaveLength(1);
    expect(result.children[0].status).toBe('A');
  });

  it('stops collapsing when single child is a file', () => {
    // dir/ -> file.ts (single child is a file, not a directory)
    const node: InternalTreeNode = {
      children: [
        {
          additions: 1,
          children: [],
          deletions: 0,
          path: 'dir/file.ts',
          status: 'M'
        }
      ],
      path: 'dir'
    };
    const result = collapseNode(node);
    // Should not collapse because single child has status (is a file)
    expect(result.path).toBe('dir');
    expect(result.collapsed).toBe(false);
    expect(result.children).toHaveLength(1);
  });
});

// ── flattenTree ─────────────────────────────────────────────────

describe('flattenTree', () => {
  it('returns empty array for empty input', () => {
    expect(flattenTree([])).toEqual([]);
  });

  it('uses └── for last sibling and ├── for non-last', () => {
    const tree: InternalTreeNode[] = [
      { additions: 1, children: [], deletions: 0, path: 'a.ts', status: 'A' },
      { additions: 2, children: [], deletions: 1, path: 'b.ts', status: 'M' }
    ];
    const result = flattenTree(tree);
    expect(result).toHaveLength(2);
    expect(result[0].connector).toBe('├── ');
    expect(result[0].displayPath).toBe('a.ts');
    expect(result[1].connector).toBe('└── ');
    expect(result[1].displayPath).toBe('b.ts');
  });

  it('single root item uses └──', () => {
    const tree: InternalTreeNode[] = [
      { additions: 1, children: [], deletions: 0, path: 'only.ts', status: 'M' }
    ];
    const result = flattenTree(tree);
    expect(result).toHaveLength(1);
    expect(result[0].connector).toBe('└── ');
  });

  it('nests children with correct prefix indentation', () => {
    const tree: InternalTreeNode[] = [
      {
        children: [
          { additions: 1, children: [], deletions: 0, path: 'src/a.ts', status: 'A' },
          { additions: 2, children: [], deletions: 1, path: 'src/b.ts', status: 'M' }
        ],
        path: 'src'
      }
    ];
    const result = flattenTree(tree);
    // src (└── since only root), then a.ts (├──), b.ts (└──)
    expect(result).toHaveLength(3);
    expect(result[0].displayPath).toBe('src');
    expect(result[0].prefix).toBe('');
    expect(result[0].connector).toBe('└── ');
    expect(result[0].isFile).toBe(false);

    expect(result[1].displayPath).toBe('a.ts');
    expect(result[1].prefix).toBe('    '); // last root child → 4 spaces
    expect(result[1].connector).toBe('├── ');
    expect(result[1].isFile).toBe(true);

    expect(result[2].displayPath).toBe('b.ts');
    expect(result[2].prefix).toBe('    ');
    expect(result[2].connector).toBe('└── ');
    expect(result[2].isFile).toBe(true);
  });

  it('collapses single-child directories in the output', () => {
    // src/ -> watch/ -> a.ts + b.ts
    const tree: InternalTreeNode[] = [
      {
        children: [
          {
            children: [
              { additions: 1, children: [], deletions: 0, path: 'src/watch/a.ts', status: 'A' },
              { additions: 2, children: [], deletions: 1, path: 'src/watch/b.ts', status: 'M' }
            ],
            path: 'src/watch'
          }
        ],
        path: 'src'
      }
    ];
    const result = flattenTree(tree);
    // Should collapse src/watch into one directory entry
    expect(result).toHaveLength(3);
    expect(result[0].displayPath).toBe('src/watch');
    expect(result[0].isFile).toBe(false);
    expect(result[1].displayPath).toBe('a.ts');
    expect(result[2].displayPath).toBe('b.ts');
  });

  it('preserves file metadata through flattening', () => {
    const tree: InternalTreeNode[] = [
      {
        additions: 0,
        children: [],
        deletions: 15,
        fileIndex: 3,
        path: 'file.ts',
        status: 'D'
      }
    ];
    const result = flattenTree(tree);
    expect(result[0].status).toBe('D');
    expect(result[0].additions).toBe(0);
    expect(result[0].deletions).toBe(15);
    expect(result[0].fileIndex).toBe(3);
    expect(result[0].isFile).toBe(true);
  });

  it('uses │   prefix for non-last parent and spaces for last parent', () => {
    const tree: InternalTreeNode[] = [
      {
        children: [{ additions: 1, children: [], deletions: 0, path: 'src/a.ts', status: 'A' }],
        path: 'src'
      },
      {
        children: [{ additions: 2, children: [], deletions: 1, path: 'lib/b.ts', status: 'M' }],
        path: 'lib'
      }
    ];
    const result = flattenTree(tree);
    // src (├──), src/a.ts, lib (└──), lib/b.ts
    expect(result).toHaveLength(4);
    expect(result[0].connector).toBe('├── '); // src is not last root
    expect(result[1].prefix).toBe('│   '); // child of non-last root
    expect(result[2].connector).toBe('└── '); // lib is last root
    expect(result[3].prefix).toBe('    '); // child of last root
  });
});
