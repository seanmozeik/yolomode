// Directory tree builder for displaying file changes in a tree structure.
//
// Ported from critique's src/directory-tree.ts (pure TypeScript, no React).
// Builds a collapsible tree from file paths with status, additions/deletions
// counts, and Unicode tree connectors (├── / └──) for rendering in FileList.

export type FileStatus = 'M' | 'A' | 'D' | 'R';

export interface TreeFileInfo {
  path: string;
  status: FileStatus;
  additions: number;
  deletions: number;
  fileIndex?: number;
}

export interface TreeNode {
  displayPath: string;
  isFile: boolean;
  fileIndex?: number;
  status?: FileStatus;
  additions?: number;
  deletions?: number;
  connector: string;
  prefix: string;
}

export interface InternalTreeNode {
  path: string;
  title?: string;
  fileIndex?: number;
  status?: FileStatus;
  additions?: number;
  deletions?: number;
  children: InternalTreeNode[];
}

/**
 * Build internal tree structure from file paths.
 * Splits each path on `/`, creates intermediate directory nodes,
 * and assigns file metadata to leaf nodes.
 */
export function buildInternalTree(files: TreeFileInfo[]): InternalTreeNode[] {
  const root: InternalTreeNode[] = [];
  const nodeMap = new Map<string, InternalTreeNode>();

  for (const file of files) {
    const parts = file.path.split('/').filter((part) => part !== '');
    let currentPath = '';
    let currentLevel = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i] as string;
      currentPath = currentPath ? `${currentPath}/${part}` : part;

      let node = nodeMap.get(currentPath);
      if (!node) {
        node = {
          children: [],
          path: currentPath
        };
        nodeMap.set(currentPath, node);
        currentLevel.push(node);
      }

      if (i === parts.length - 1) {
        node.title = part;
        node.fileIndex = file.fileIndex;
        node.status = file.status;
        node.additions = file.additions;
        node.deletions = file.deletions;
      }

      currentLevel = node.children;
    }
  }

  return root;
}

function getName(node: InternalTreeNode): string {
  const parts = node.path.split('/');
  return parts[parts.length - 1] || node.path;
}

/**
 * Collapse directories that only contain a single subdirectory (no files).
 * e.g. src/ -> utils/ with only one child dir becomes src/utils/.
 */
export function collapseNode(node: InternalTreeNode): {
  path: string;
  collapsed: boolean;
  children: InternalTreeNode[];
  originalNode: InternalTreeNode;
} {
  let currentNode = node;
  let collapsedPath = getName(currentNode);

  while (
    currentNode.children.length === 1 &&
    currentNode.status === undefined &&
    currentNode.children[0]?.status === undefined &&
    currentNode.children[0]?.children.length > 0
  ) {
    currentNode = currentNode.children[0] as InternalTreeNode;
    collapsedPath = `${collapsedPath}/${getName(currentNode)}`;
  }

  return {
    children: currentNode.children,
    collapsed: collapsedPath !== getName(node),
    originalNode: currentNode,
    path: collapsedPath
  };
}

/**
 * Flatten the tree into a linear array of TreeNode objects with
 * Unicode tree connectors (├── for non-last, └── for last siblings).
 */
export function flattenTree(tree: InternalTreeNode[]): TreeNode[] {
  const result: TreeNode[] = [];

  function processNode(node: InternalTreeNode, prefix: string, isLast: boolean): void {
    const collapsed = collapseNode(node);
    const displayPath = collapsed.path;
    const connector = isLast ? '└── ' : '├── ';
    const isFile = collapsed.originalNode.status !== undefined;

    result.push({
      additions: collapsed.originalNode.additions,
      connector,
      deletions: collapsed.originalNode.deletions,
      displayPath,
      fileIndex: collapsed.originalNode.fileIndex,
      isFile,
      prefix,
      status: collapsed.originalNode.status
    });

    if (collapsed.children.length > 0) {
      const childPrefix = prefix + (isLast ? '    ' : '│   ');

      collapsed.children.forEach((child, idx) => {
        const childIsLast = idx === collapsed.children.length - 1;
        processNode(child, childPrefix, childIsLast);
      });
    }
  }

  tree.forEach((node, idx) => {
    const isLast = idx === tree.length - 1;
    processNode(node, '', isLast);
  });

  return result;
}
