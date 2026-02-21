import type { ScrollBoxRenderable } from '@opentui/core';
import { useKeyboard, useTerminalDimensions } from '@opentui/solid';
import pc from 'picocolors';
import { createSignal, For, Show } from 'solid-js';
import { useApp } from '../context/app';
import { useLogStream } from '../hooks/useLogStream';

export function AgentTerminal() {
  const app = useApp();
  const { lines } = useLogStream(app.activeSession);
  const dims = useTerminalDimensions();
  const [autoscroll, setAutoscroll] = createSignal(true);
  let scrollboxRef: ScrollBoxRenderable | undefined;

  useKeyboard((event) => {
    if (app.activePane() !== 'terminal') return;
    if (event.name === 's') {
      setAutoscroll((prev) => !prev);
    } else if (event.name === 'u') {
      scrollboxRef?.scrollBy(-Math.floor(dims().height / 2));
    } else if (event.name === 'd') {
      scrollboxRef?.scrollBy(Math.floor(dims().height / 2));
    } else if (event.name === 'home') {
      scrollboxRef?.scrollTo(0);
    } else if (event.name === 'end') {
      scrollboxRef?.scrollTo(scrollboxRef.scrollHeight);
    }
  });

  const sessionName = () => {
    const id = app.activeSession();
    if (!id) return '';
    return app.sessions().find((s) => s.id === id)?.name ?? id;
  };

  return (
    <box
      flexGrow={1}
      flexDirection="column"
      borderStyle="rounded"
      title={sessionName() ? ` ${sessionName()} ` : ''}
    >
      <Show
        when={app.activeSession()}
        fallback={<text>{pc.gray('Select a session ↑↓ Enter')}</text>}
      >
        <scrollbox
          ref={(el) => {
            scrollboxRef = el;
          }}
          stickyScroll={autoscroll()}
          stickyStart="bottom"
          flexGrow={1}
          width="100%"
        >
          <For each={lines()}>{(line) => <text>{line}</text>}</For>
        </scrollbox>
        <Show when={!autoscroll()}>
          <text>{pc.dim('[scroll paused — s to resume]')}</text>
        </Show>
      </Show>
    </box>
  );
}
