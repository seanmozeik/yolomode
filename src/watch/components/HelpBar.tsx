import pc from 'picocolors';

const HELP_TEXT = '[ left  ] right  Tab focus  j/k nav  r refresh  s scroll  p ports  q quit';

export function HelpBar() {
  return (
    <box height={1} width="100%" paddingX={1}>
      <text>{pc.dim(HELP_TEXT)}</text>
    </box>
  );
}
