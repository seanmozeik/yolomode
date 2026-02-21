import type { KeyEvent } from '@opentui/core';
import { render, useKeyboard, useRenderer } from '@opentui/solid';
import { DialogProvider } from '@opentui-ui/dialog/solid';
import { Show } from 'solid-js';
import { AgentTerminal } from './watch/components/AgentTerminal';
import { SessionList } from './watch/components/SessionList';
import { AppProvider, useApp } from './watch/context/app';

const PANE_CYCLE: Array<'sessions' | 'terminal' | 'diff'> = ['sessions', 'terminal', 'diff'];

function WatchLayout() {
  const app = useApp();
  const renderer = useRenderer();

  useKeyboard((event: KeyEvent) => {
    if (event.name === 'q') {
      renderer.destroy();
    } else if (event.name === '[') {
      app.setLeftPanelOpen(!app.leftPanelOpen());
    } else if (event.name === 'tab') {
      const idx = PANE_CYCLE.indexOf(app.activePane());
      app.setActivePane(PANE_CYCLE[(idx + 1) % PANE_CYCLE.length]);
    }
  });

  return (
    <box flexDirection="row" width="100%" height="100%">
      <Show when={app.leftPanelOpen()}>
        <box borderStyle="rounded" width={30} title=" Sessions ">
          <SessionList />
        </box>
      </Show>
      <AgentTerminal />
      <box flexGrow={2} borderStyle="rounded" paddingLeft={1}>
        <text>Diff panel placeholder</text>
      </box>
    </box>
  );
}

function App() {
  return (
    <AppProvider>
      <DialogProvider>
        <WatchLayout />
      </DialogProvider>
    </AppProvider>
  );
}

export async function cmdWatch(_args: string[]): Promise<void> {
  await render(() => <App />, { exitOnCtrlC: true });
}
