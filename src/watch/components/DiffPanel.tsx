import { useKeyboard, useTerminalDimensions } from '@opentui/solid';
import pc from 'picocolors';
import { createSignal, Show } from 'solid-js';
import { useApp } from '../context/app';
import type { DiffFile } from '../docker';
import { useDirtyPoller } from '../hooks/useDirtyPoller';
import { DiffView } from './DiffView';
import { FileList } from './FileList';

export function DiffPanel() {
  const app = useApp();
  const dims = useTerminalDimensions();
  const [selectedFile, setSelectedFile] = createSignal<string | null>(null);
  const [refreshCount, setRefreshCount] = createSignal(0);
  const [fullDiffMode, setFullDiffMode] = createSignal(false);

  const { dirty, clearDirty } = useDirtyPoller(app.activeSession, app.rightPanelOpen);

  const panelWidth = () => Math.floor(dims().width * 0.4);

  useKeyboard((event) => {
    if (app.activePane() !== 'diff') return;
    if (event.name === 'r') {
      setRefreshCount((c) => c + 1);
      clearDirty();
    } else if (event.name === 'f') {
      setFullDiffMode((m) => !m);
    }
  });

  const onFilesLoaded = (files: DiffFile[]) => {
    const current = selectedFile();
    if (!current || !files.some((f) => f.path === current)) {
      setSelectedFile(files.length > 0 ? (files[0].path ?? null) : null);
    }
  };

  const headerTitle = () => {
    const base = ' Changed Files';
    return dirty() ? `${base} [● new changes — r] ` : `${base} `;
  };

  return (
    <box flexDirection="column" width={panelWidth()} borderStyle="rounded" title={headerTitle()}>
      <Show when={!fullDiffMode()}>
        <box flexGrow={1} flexDirection="column" overflow="hidden">
          <FileList
            showAll={false}
            selectedFile={selectedFile}
            onSelectFile={setSelectedFile}
            refreshTrigger={refreshCount}
            onFilesLoaded={onFilesLoaded}
          />
        </box>
        <text>{pc.dim('─'.repeat(Math.max(0, panelWidth() - 2)))}</text>
      </Show>
      <box flexGrow={2} flexDirection="column" overflow="hidden">
        <DiffView selectedFile={selectedFile} onToggleFull={() => setFullDiffMode((m) => !m)} />
      </box>
    </box>
  );
}
