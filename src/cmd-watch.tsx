import type { KeyEvent } from '@opentui/core';
import { render, useKeyboard, useRenderer } from '@opentui/solid';

function App() {
  const renderer = useRenderer();

  useKeyboard((event: KeyEvent) => {
    if (event.name === 'q') {
      renderer.destroy();
    }
  });

  return (
    <box borderStyle="rounded" paddingLeft={1} paddingRight={1}>
      <text>yolomode watch</text>
    </box>
  );
}

export async function cmdWatch(_args: string[]): Promise<void> {
  await render(() => <App />, { exitOnCtrlC: true });
}
