import type { ScrollBoxRenderable } from '@opentui/core';
import { useKeyboard, useTerminalDimensions } from '@opentui/solid';
import pc from 'picocolors';
import { type Accessor, createRenderEffect, createSignal, Show } from 'solid-js';
import { useApp } from '../context/app';
import { balanceDelimiters } from '../utils/balanceDelimiters';
import { detectFiletype } from '../utils/detectFiletype';

export interface DiffViewProps {
  selectedFile: Accessor<string | null>;
  onToggleFull?: () => void;
}

async function fetchDiff(sessionId: string, filePath: string): Promise<string> {
  const proc = Bun.spawn(
    [
      'docker',
      'exec',
      sessionId,
      'git',
      '-C',
      '/workspace',
      'diff',
      'yolomode-base',
      '--',
      filePath
    ],
    { stderr: 'pipe', stdin: 'pipe', stdout: 'pipe' }
  );
  const text = await new Response(proc.stdout).text();
  await proc.exited;
  return text;
}

export function DiffView(props: DiffViewProps) {
  const app = useApp();
  const dims = useTerminalDimensions();
  const [diff, setDiff] = createSignal('');
  const [loading, setLoading] = createSignal(false);
  const [updated, setUpdated] = createSignal(false);
  let scrollboxRef: ScrollBoxRenderable | undefined;
  let prevDiff = '';

  createRenderEffect(() => {
    const sessionId = app.activeSession();
    const filePath = props.selectedFile();
    if (!sessionId || !filePath) {
      setDiff('');
      setLoading(false);
      setUpdated(false);
      prevDiff = '';
      return;
    }

    setLoading(true);
    setUpdated(false);

    fetchDiff(sessionId, filePath)
      .then((rawDiff) => {
        const filetype = detectFiletype(filePath);
        const balanced = balanceDelimiters(rawDiff, filetype);
        if (prevDiff && balanced !== prevDiff) {
          setUpdated(true);
        }
        prevDiff = balanced;
        setDiff(balanced);
        setLoading(false);
      })
      .catch(() => {
        setDiff('');
        setLoading(false);
      });
  });

  useKeyboard((event) => {
    if (app.activePane() !== 'diff') return;
    if (event.name === 'u') {
      scrollboxRef?.scrollBy(-Math.floor(dims().height / 2));
    } else if (event.name === 'd') {
      scrollboxRef?.scrollBy(Math.floor(dims().height / 2));
    } else if (event.name === 'f') {
      props.onToggleFull?.();
    }
  });

  const filePath = () => props.selectedFile();
  const filetype = () => {
    const p = filePath();
    return p ? detectFiletype(p) : undefined;
  };

  return (
    <Show when={filePath()} fallback={<text>{pc.gray('Select a file')}</text>}>
      <box flexDirection="column" flexGrow={1} width="100%">
        <Show when={loading()}>
          <text>{pc.gray('⠋ Loading diff...')}</text>
        </Show>
        <Show when={updated()}>
          <text>{pc.bold(pc.green('[● updated]'))}</text>
        </Show>
        <Show when={!loading()}>
          <scrollbox
            ref={(el) => {
              scrollboxRef = el;
            }}
            flexGrow={1}
            width="100%"
          >
            <diff diff={diff()} view="unified" filetype={filetype()} wrapMode="word" width="100%" />
          </scrollbox>
        </Show>
      </box>
    </Show>
  );
}
