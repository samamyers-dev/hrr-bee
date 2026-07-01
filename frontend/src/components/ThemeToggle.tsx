interface Props {
  mode: 'light' | 'dark';
  onToggle: () => void;
}

export function ThemeToggle({ mode, onToggle }: Props) {
  return (
    <button
      className="theme-toggle"
      onClick={onToggle}
      title={`Switch to ${mode === 'light' ? 'dark' : 'light'} mode`}
      aria-label={`Switch to ${mode === 'light' ? 'dark' : 'light'} mode`}
    >
      <span className="theme-toggle-icon">{mode === 'light' ? '◐' : '◑'}</span>
      <span className="theme-toggle-label">{mode}</span>
    </button>
  );
}
