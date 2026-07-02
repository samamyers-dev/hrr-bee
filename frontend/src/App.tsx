import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { api } from './api/client';
import type { Episode, SortOption, FilterOption, FormatOption } from './api/client';
import { useAudioPlayer } from './hooks/useAudioPlayer';
import { EpisodeList } from './components/EpisodeList';
import { EpisodeDetail } from './components/EpisodeDetail';
import { AudioBar } from './components/AudioBar';
import { BottomNav } from './components/BottomNav';
import { AdminPanel } from './components/AdminPanel';
import { SettingsSheet } from './components/SettingsSheet';
import { NowPlayingCard } from './components/NowPlayingCard';
import { BlueprintSvg } from './components/BlueprintSvg';
import { ScribbleInk } from './components/ScribbleInk';
import { ThemeToggle } from './components/ThemeToggle';
import { BeeTerminal } from './components/BeeTerminal';

type Tab = 'backlog' | 'admin';
type ThemeMode = 'light' | 'dark';

const THEME_KEY = 'hrr-bee-theme';

function getInitialTheme(): ThemeMode {
  try {
    const saved = localStorage.getItem(THEME_KEY) as ThemeMode | null;
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {}
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
    return 'light';
  }
  return 'dark';
}

export default function App() {
  const [theme, setTheme] = useState<ThemeMode>(() => getInitialTheme());
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [pw, setPw] = useState('');
  const [authError, setAuthError] = useState('');
  const [tab, setTab] = useState<Tab>('backlog');
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Episode | null>(null);
  const [sort, setSort] = useState<SortOption>('unplayed-first');
  const [filter, setFilter] = useState<FilterOption>('all');
  const [format, setFormat] = useState<FormatOption>('all');
  const [search, setSearch] = useState('');
  const [notif, setNotif] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [nowPlayingOpen, setNowPlayingOpen] = useState(false);
  const [nowPlayingEp, setNowPlayingEp] = useState<Episode | null>(null);
  const [beeOpen, setBeeOpen] = useState(false);
  const notifTimer = useRef<number>(0);

  // Theme sync
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {}
  }, [theme]);

  // Auth check on mount
  useEffect(() => {
    api.auth
      .check()
      .then(r => {
        setAuthenticated(r.authenticated);
        setPasswordRequired(r.passwordRequired);
      })
      .catch(() => setAuthenticated(false));
  }, []);

  const notify = useCallback((m: string) => {
    setNotif(m);
    clearTimeout(notifTimer.current);
    notifTimer.current = window.setTimeout(() => setNotif(''), 3000);
  }, []);

  // Fetch episodes whenever sort/filter/search changes
  const fetchEps = useCallback(async () => {
    const p: Record<string, string> = { sort, filter };
    if (format !== 'all') p.format = format;
    if (search) p.search = search;
    try {
      const list = await api.episodes.list(p);
      setEpisodes(list);
      // Keep the expanded now-playing card in sync with server state.
      setNowPlayingEp(np => {
        if (!np) return np;
        const updated = list.find(e => e.id === np.id);
        return updated ? updated : np;
      });
    } catch {
      // ignore
    }
  }, [sort, filter, format, search]);

  const playerOptions = useMemo(() => ({ onEpisodeEnd: fetchEps }), [fetchEps]);
  const player = useAudioPlayer(playerOptions);

  useEffect(() => {
    if (authenticated) fetchEps();
  }, [authenticated, fetchEps]);

  // Fetch detail when an episode is selected
  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    api.episodes
      .get(selectedId)
      .then(setDetail)
      .catch(() => {
        notify('Failed to load episode');
        setSelectedId(null);
      });
  }, [selectedId, notify]);

  const doLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.auth.login(pw);
      setAuthenticated(true);
    } catch {
      setAuthError('Invalid password');
    }
  };

  const handlePlay = useCallback(
    (ep: Episode) => {
      player.load(ep.id, ep.title, ep.audio_url);
      setNowPlayingEp(ep);
    },
    [player]
  );

  const handleMarkPlayed = useCallback(
    async (ep: Episode) => {
      try {
        await api.episodes.updateProgress(ep.id, 'played');
        const newPos = ep.duration ?? 0;
        setDetail(d => (d && d.id === ep.id ? { ...d, play_state: 'played', last_position: newPos } : d));
        setEpisodes(eps => eps.map(e => (e.id === ep.id ? { ...e, play_state: 'played', last_position: newPos } : e)));
        setNowPlayingEp(np => (np && np.id === ep.id ? { ...np, play_state: 'played', last_position: newPos } : np));
        notify(`#${ep.episode_number ?? '?'} marked as played`);
        fetchEps();
      } catch {
        notify('Failed to mark as played');
      }
    },
    [notify, fetchEps]
  );

  const handleMarkUnplayed = useCallback(
    async (ep: Episode) => {
      try {
        await api.episodes.updateProgress(ep.id, 'unplayed', 0);
        setDetail(d => (d && d.id === ep.id ? { ...d, play_state: 'unplayed', last_position: 0 } : d));
        setEpisodes(eps => eps.map(e => (e.id === ep.id ? { ...e, play_state: 'unplayed', last_position: 0 } : e)));
        setNowPlayingEp(np => (np && np.id === ep.id ? { ...np, play_state: 'unplayed', last_position: 0 } : np));
        notify(`#${ep.episode_number ?? '?'} marked as unplayed`);
        fetchEps();
      } catch {
        notify('Failed to mark as unplayed');
      }
    },
    [notify, fetchEps]
  );

  const handleMarkPreviousPlayed = useCallback(
    async (ep: Episode) => {
      try {
        const r = await api.episodes.markPreviousPlayed(ep.id);
        notify(`${r.updatedCount} earlier episodes marked as played`);
        fetchEps();
      } catch {
        notify('Failed to mark previous as played');
      }
    },
    [notify, fetchEps]
  );

  const toggleTheme = () => setTheme(t => (t === 'light' ? 'dark' : 'light'));

  // ---- Loading state ----
  if (authenticated === null) {
    return (
      <div className="boot-screen" data-theme={theme}>
        <div className="boot-text">
          <p>FREE THEM. // HRR-BEE ARCHIVE</p>
          <p>LAB-SPEC-01 // STABLE</p>
          <p className="blink">_</p>
        </div>
      </div>
    );
  }

  // ---- Auth screen ----
  if (!authenticated) {
    return (
      <div className="boot-screen">
        <div className="auth-box">
          <ScribbleInk variant="corner" />
          <pre className="ascii-logo">{`
  ╔═══════════════════════════╗
  ║    F R E E   T H E M .    ║
  ║    hrr-bee archive        ║
  ╚═══════════════════════════╝`}</pre>
          <p className="auth-sub">{'>>'} podcast archive terminal</p>
          <div className="crt-shell">
            <BlueprintSvg />
          </div>
          {passwordRequired ? (
            <form onSubmit={doLogin} className="auth-form">
              <input
                type="password"
                value={pw}
                onChange={e => setPw(e.target.value)}
                placeholder="enter password..."
                autoFocus
                className="term-input"
              />
              {authError && <p className="term-error">{authError}</p>}
              <button type="submit" className="term-btn">
                [ execute ]
              </button>
            </form>
          ) : (
            <button
              className="term-btn"
              onClick={() =>
                api.auth.login('').then(() => setAuthenticated(true))
              }
            >
              [ enter archive ]
            </button>
          )}
        </div>
      </div>
    );
  }

  // ---- Main app ----
  return (
    <div className="app-shell">
      {/* Scanline overlay */}
      <div className="scanlines" />

      {/* Toast */}
      {notif && <div className="toast">{notif}</div>}

      {/* Header */}
      <header className="app-header">
        <div
          className="brand-lockup"
          onClick={() => setBeeOpen(true)}
          title="FREE THEM. // HRR-BEE ARCHIVE"
        >
          <span className="brand-logo">FREE THEM.</span>
          <span className="brand-classification">LAB-SPEC-01</span>
        </div>
        <div className="header-actions">
          <ThemeToggle mode={theme} onToggle={toggleTheme} />
          <button className="header-btn" onClick={() => setSettingsOpen(true)}>
            [settings]
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="app-main">
        {tab === 'backlog' && !selectedId && (
          <EpisodeList
            episodes={episodes}
            sort={sort}
            setSort={setSort}
            filter={filter}
            setFilter={setFilter}
            format={format}
            setFormat={setFormat}
            search={search}
            setSearch={setSearch}
            onRefresh={fetchEps}
            onOpen={setSelectedId}
            onPlay={handlePlay}
            onTogglePlay={player.togglePlay}
            currentPlayingId={player.episodeId}
            isPlaying={player.isPlaying}
          />
        )}
        {tab === 'backlog' && selectedId && detail && (
          <EpisodeDetail
            ep={detail}
            onBack={() => setSelectedId(null)}
            onPlay={() => handlePlay(detail)}
            onTogglePlay={player.togglePlay}
            isPlaying={player.episodeId === detail.id && player.isPlaying}
            onMarkPlayed={() => handleMarkPlayed(detail)}
            onMarkUnplayed={() => handleMarkUnplayed(detail)}
            onMarkPreviousPlayed={() => handleMarkPreviousPlayed(detail)}
          />
        )}
        {tab === 'backlog' && selectedId && !detail && (
          <div className="loading-detail">
            <p className="blink">loading...</p>
          </div>
        )}
        {tab === 'admin' && <AdminPanel notify={notify} onRefresh={fetchEps} />}
      </main>

      {/* Audio bar (fixed at bottom, above nav) */}
      {player.episodeId && (
        <AudioBar player={player} onExpand={() => setNowPlayingOpen(true)} />
      )}

      {/* Now playing expanded card */}
      {nowPlayingOpen && nowPlayingEp && (
        <NowPlayingCard
          player={player}
          episode={nowPlayingEp}
          onClose={() => setNowPlayingOpen(false)}
          onMarkPlayed={() => handleMarkPlayed(nowPlayingEp)}
          onMarkUnplayed={() => handleMarkUnplayed(nowPlayingEp)}
        />
      )}

      {/* Bottom navigation */}
      <BottomNav
        tab={tab}
        setTab={t => {
          setTab(t);
          setSelectedId(null);
        }}
        onLogout={() =>
          api.auth.logout().then(() => setAuthenticated(false))
        }
      />

      {/* Settings sheet */}
      {settingsOpen && (
        <SettingsSheet
          sort={sort}
          setSort={setSort}
          filter={filter}
          setFilter={setFilter}
          onClose={() => setSettingsOpen(false)}
          playbackSpeed={player.playbackSpeed}
          setPlaybackSpeed={player.setSpeed}
        />
      )}

      {/* Bee easter egg terminal */}
      <BeeTerminal visible={beeOpen} onClose={() => setBeeOpen(false)} />
    </div>
  );
}
