interface Props {
  tab: 'backlog' | 'admin';
  setTab: (t: 'backlog' | 'admin') => void;
  onLogout: () => void;
}

export function BottomNav({ tab, setTab, onLogout }: Props) {
  return (
    <nav className="bottom-nav">
      <button
        className={`nav-btn ${tab === 'backlog' ? 'active' : ''}`}
        onClick={() => setTab('backlog')}
      >
        <span className="nav-icon">▤</span>
        <span className="nav-label">backlog</span>
      </button>
      <button
        className={`nav-btn ${tab === 'admin' ? 'active' : ''}`}
        onClick={() => setTab('admin')}
      >
        <span className="nav-icon">⚙</span>
        <span className="nav-label">admin</span>
      </button>
      <button className="nav-btn" onClick={onLogout}>
        <span className="nav-icon">⏻</span>
        <span className="nav-label">logout</span>
      </button>
    </nav>
  );
}
