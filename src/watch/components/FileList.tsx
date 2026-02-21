import { useKeyboard } from '@opentui/solid';
import { useDialog, useDialogKeyboard } from '@opentui-ui/dialog/solid';
import pc from 'picocolors';
import { type Accessor, createMemo, createSignal, For, Show } from 'solid-js';
import { useApp } from '../context/app';
import { type DiffFile, listChangedFiles } from '../docker';
import { getFileIcon } from '../ui/icons';
import {
  buildInternalTree,
  flattenTree,
  type TreeFileInfo,
  type TreeNode
} from '../utils/directoryTree';

export interface FileListProps {
  showAll?: boolean;
  selectedFile?: Accessor<string | null>;
  onSelectFile?: (path: string) => void;
}

function statusBadge(status: TreeNode['status']): string {
  switch (status) {
    case 'M':
      return pc.yellow('M');
    case 'A':
      return pc.green('A');
    case 'D':
      return pc.red('D');
    case 'R':
      return pc.cyan('R');
    default:
      return ' ';
  }
}

export function FileList(props: FileListProps) {
  const app = useApp();
  const dialog = useDialog();
  const [files, setFiles] = createSignal<DiffFile[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [selectedIndex, setSelectedIndex] = createSignal(0);

  const showAll = () => props.showAll ?? false;

  const loadFiles = async () => {
    const sessionId = app.activeSession();
    if (!sessionId) {
      setFiles([]);
      setLoading(false);
      return;
    }
    try {
      const result = await listChangedFiles(sessionId, showAll());
      setFiles(result);
    } finally {
      setLoading(false);
    }
  };

  loadFiles();

  // Regular files first, noisy files at bottom when showAll=true
  const orderedFiles = createMemo<DiffFile[]>(() => {
    const all = files();
    const regular = all.filter((f) => !f.noisy);
    const noisy = all.filter((f) => f.noisy);
    return [...regular, ...noisy];
  });

  const treeNodes = createMemo(() => {
    const ordered = orderedFiles();
    const infos: TreeFileInfo[] = ordered.map((f, i) => ({
      additions: 0,
      deletions: 0,
      fileIndex: i,
      path: f.path,
      status: f.status
    }));
    return flattenTree(buildInternalTree(infos));
  });

  const selectableNodes = createMemo(() => treeNodes().filter((n) => n.isFile));

  useKeyboard((event) => {
    if (app.activePane() !== 'diff') return;
    const nodes = selectableNodes();
    if (nodes.length === 0) return;

    if (event.name === 'j' || event.name === 'down') {
      setSelectedIndex((i) => Math.min(i + 1, nodes.length - 1));
    } else if (event.name === 'k' || event.name === 'up') {
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (event.name === 'return') {
      const node = nodes[selectedIndex()];
      if (node?.fileIndex !== undefined) {
        const file = orderedFiles()[node.fileIndex];
        if (file) props.onSelectFile?.(file.path);
      }
    } else if (event.ctrl && event.name === 'p') {
      openFuzzyFinder();
    }
  });

  const openFuzzyFinder = async () => {
    // Snapshot current file list so the picker doesn't shift under the user
    const snapshot = orderedFiles();

    const selectedPath = await dialog.prompt<string>({
      content: (ctx) => () => {
        // createSignal/createMemo/useDialogKeyboard are all OK here —
        // this ContentAccessor runs inside a Solid reactive owner (Portal's createMemo).
        const [filter, setFilter] = createSignal('');
        const [pickerIndex, setPickerIndex] = createSignal(0);

        const filteredFiles = createMemo(() =>
          snapshot.filter((f) => f.path.toLowerCase().includes(filter().toLowerCase()))
        );

        useDialogKeyboard((event) => {
          if (event.name === 'return') {
            const match = filteredFiles()[pickerIndex()];
            if (match) ctx.resolve(match.path);
          } else if (event.name === 'escape') {
            ctx.dismiss();
          } else if (event.name === 'j' || event.name === 'down') {
            setPickerIndex((i) => Math.min(i + 1, filteredFiles().length - 1));
          } else if (event.name === 'k' || event.name === 'up') {
            setPickerIndex((i) => Math.max(i - 1, 0));
          } else if (event.name === 'backspace') {
            setFilter((f) => f.slice(0, -1));
            setPickerIndex(0);
          } else if (!event.ctrl && !event.meta && event.sequence.length === 1) {
            setFilter((f) => f + event.sequence);
            setPickerIndex(0);
          }
        }, ctx.dialogId);

        return (
          <box flexDirection="column" width={60} paddingLeft={1} paddingRight={1}>
            <text>{pc.bold('> ') + filter() + pc.dim('_')}</text>
            <Show when={filteredFiles().length > 0} fallback={<text>{pc.gray('No matches')}</text>}>
              <For each={filteredFiles()}>
                {(file, index) => (
                  <text>
                    {index() === pickerIndex()
                      ? pc.green('❯ ') + pc.bold(file.path)
                      : pc.dim('  ') + file.path}
                  </text>
                )}
              </For>
            </Show>
          </box>
        );
      }
    });

    if (selectedPath) {
      props.onSelectFile?.(selectedPath);
    }
  };

  return (
    <Show when={!loading()} fallback={<text>{pc.gray('⠋ Loading...')}</text>}>
      <Show when={files().length > 0} fallback={<text>{pc.gray('No changes yet')}</text>}>
        <For each={treeNodes()}>
          {(node) => {
            const file = () =>
              node.fileIndex !== undefined ? orderedFiles()[node.fileIndex] : undefined;

            const isSelected = () => {
              if (!node.isFile) return false;
              const selectedPath = props.selectedFile?.();
              return selectedPath != null && file()?.path === selectedPath;
            };

            const isNoisy = () => file()?.noisy ?? false;

            const icon = node.isFile ? getFileIcon(node.displayPath) : '';
            const badge = node.isFile ? statusBadge(node.status) : '';
            const line = `${node.prefix}${node.connector}${icon}${badge} ${node.displayPath}`;

            const displayText = () => {
              if (isSelected()) return pc.green(pc.bold(line));
              if (isNoisy()) return pc.dim(line);
              return line;
            };

            return <text>{displayText()}</text>;
          }}
        </For>
      </Show>
    </Show>
  );
}
