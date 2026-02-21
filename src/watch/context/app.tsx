import {
  type Accessor,
  createContext,
  createSignal,
  type ParentComponent,
  useContext
} from 'solid-js';

export type Session = {
  id: string;
  name: string;
  status: 'running' | 'stopped';
  uptime: string;
};

type AppState = {
  sessions: Accessor<Session[]>;
  setSessions: (sessions: Session[]) => void;
  activeSession: Accessor<string | null>;
  setActiveSession: (id: string | null) => void;
  activePane: Accessor<'sessions' | 'terminal' | 'diff'>;
  setActivePane: (pane: 'sessions' | 'terminal' | 'diff') => void;
  leftPanelOpen: Accessor<boolean>;
  setLeftPanelOpen: (open: boolean) => void;
  rightPanelOpen: Accessor<boolean>;
  setRightPanelOpen: (open: boolean) => void;
};

const AppContext = createContext<AppState>();

export const AppProvider: ParentComponent = (props) => {
  const [sessions, setSessions] = createSignal<Session[]>([]);
  const [activeSession, setActiveSession] = createSignal<string | null>(null);
  const [activePane, setActivePane] = createSignal<'sessions' | 'terminal' | 'diff'>('sessions');
  const [leftPanelOpen, setLeftPanelOpen] = createSignal(true);
  const [rightPanelOpen, setRightPanelOpen] = createSignal(true);

  const state: AppState = {
    activePane,
    activeSession,
    leftPanelOpen,
    rightPanelOpen,
    sessions,
    setActivePane,
    setActiveSession,
    setLeftPanelOpen,
    setRightPanelOpen,
    setSessions
  };

  return <AppContext.Provider value={state}>{props.children}</AppContext.Provider>;
};

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useApp must be used inside <AppProvider>');
  }
  return ctx;
}
