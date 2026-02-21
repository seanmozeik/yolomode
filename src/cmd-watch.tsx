import type { KeyEvent } from '@opentui/core';
import { render, useKeyboard, useRenderer } from '@opentui/solid';
import { AppProvider } from './watch/context/app';

function App() {
  const renderer = useRenderer();

  useKeyboard((event: KeyEvent) => {
    if (event.name === 'q') {
      renderer.destroy();
    }
  });

  return (
    <AppProvider>
      <box borderStyle="rounded" paddingLeft={1} paddingRight={1}>
        <text>yolomode watch</text>
      </box>
    </AppProvider>
  );
}

export async function cmdWatch(_args: string[]): Promise<void> {
  await render(() => <App />, { exitOnCtrlC: true });
}
