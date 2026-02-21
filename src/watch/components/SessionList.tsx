import { useKeyboard } from '@opentui/solid';
import pc from 'picocolors';
import { createSignal, For, onCleanup, Show } from 'solid-js';
import { useApp } from '../context/app';
import { listSessions } from '../docker';

export function SessionList() {
  const app = useApp();
  const [loading, setLoading] = createSignal(true);
  const [selectedIndex, setSelectedIndex] = createSignal(0);

  const refresh = async () => {
    try {
      const result = await listSessions();
      app.setSessions(result);
      const active = app.activeSession();
      if (active && !result.some((s) => s.id === active)) {
        app.setActiveSession(result.length > 0 ? result[0].id : null);
      }
    } finally {
      setLoading(false);
    }
  };

  refresh();
  const intervalId = setInterval(refresh, 1000);
  onCleanup(() => clearInterval(intervalId));

  useKeyboard((event) => {
    if (app.activePane() !== 'sessions') return;
    const sessions = app.sessions();
    if (sessions.length === 0) return;

    if (event.name === 'j' || event.name === 'down') {
      setSelectedIndex((i) => Math.min(i + 1, sessions.length - 1));
    } else if (event.name === 'k' || event.name === 'up') {
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (event.name === 'return') {
      const session = sessions[selectedIndex()];
      if (session) {
        app.setActiveSession(session.id);
      }
    }
  });

  return (
    <Show when={!loading()} fallback={<text>{pc.gray('⠋ Loading...')}</text>}>
      <Show when={app.sessions().length > 0} fallback={<text>{pc.gray('No sessions found')}</text>}>
        <For each={app.sessions()}>
          {(session, index) => {
            const icon = session.status === 'running' ? '●' : '○';
            return (
              <text>
                {index() === selectedIndex()
                  ? pc.green(pc.bold(`  ${icon}  ${session.name}  ${session.uptime}`))
                  : `  ${session.status === 'running' ? pc.green(icon) : pc.gray(icon)}  ${session.name}  ${pc.gray(session.uptime)}`}
              </text>
            );
          }}
        </For>
      </Show>
    </Show>
  );
}
