import { useState } from 'react';
import type { Episode, SortOption, FilterOption, FormatOption } from '../api/client';
import { ScribbleInk } from './ScribbleInk';

interface Props {
  episodes: Episode[];
  sort: SortOption;
  setSort: (s: SortOption) => void;
  filter: FilterOption;
  setFilter: (f: FilterOption) => void;
  format: FormatOption;
  setFormat: (f: FormatOption) => void;
  search: string;
  setSearch: (s: string) => void;
  onRefresh: () => void;
  onOpen: (id: string) => void;
  onPlay: (ep: Episode) => void;
  onTogglePlay: () => void;
  currentPlayingId: string | null;
  isPlaying: boolean;
}

function fmtDuration(secs: number | null): string {
  if (!secs) return '--:--';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h}h${m}m`;
  return `${m}m`;
}

function fmtDate(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const STATE_ICON: Record<string, string> = {
  unplayed: '○',
  'in-progress': '◐',
  played: '●',
};

export function EpisodeList({
  episodes,
  sort,
  setSort,
  filter,
  setFilter,
  format,
  setFormat,
  search,
  setSearch,
  onRefresh,
  onOpen,
  onPlay,
  onTogglePlay,
  currentPlayingId,
  isPlaying,
}: Props) {
  const [showFilters, setShowFilters] = useState(false);

  const unplayedCount = episodes.filter(e => e.play_state === 'unplayed').length;
  const inProgressCount = episodes.filter(e => e.play_state === 'in-progress').length;

  return (
    <div className="episode-list-container">
      {/* Search bar */}
      <div className="search-bar">
        <span className="search-prompt">&gt;</span>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search episodes..."
          className="search-input"
        />
        <button className="icon-btn" onClick={() => setShowFilters(!showFilters)}>
          [filter]
        </button>
      </div>

      {/* Filter / sort panel (collapsible) */}
      {showFilters && (
        <div className="filter-panel">
          <div className="filter-group">
            <label className="filter-label">SORT</label>
            <div className="filter-chips">
              {(
                [
                  ['unplayed-first', 'UNPLAYED'],
                  ['unplayed-first-newest', 'UNPLAYED↓'],
                  ['oldest', 'OLDEST'],
                  ['newest', 'NEWEST'],
                ] as [SortOption, string][]
              ).map(([val, label]) => (
                <button
                  key={val}
                  className={`chip ${sort === val ? 'active' : ''}`}
                  onClick={() => setSort(val)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="filter-group">
            <label className="filter-label">FILTER</label>
            <div className="filter-chips">
              {(
                [
                  ['all', 'ALL'],
                  ['unplayed', 'UNPLAYED'],
                  ['in-progress', 'PROGRESS'],
                  ['played', 'PLAYED'],
                ] as [FilterOption, string][]
              ).map(([val, label]) => (
                <button
                  key={val}
                  className={`chip ${filter === val ? 'active' : ''}`}
                  onClick={() => setFilter(val)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="filter-group">
            <label className="filter-label">FORMAT</label>
            <div className="filter-chips">
              {(
                [
                  ['all', 'ALL'],
                  ['main', 'MAIN'],
                  ['ad-free', 'AD-FREE'],
                  ['bonus', 'BONUS'],
                  ['live', 'LIVE'],
                  ['patreon-exclusive', 'PATREON'],
                ] as [FormatOption, string][]
              ).map(([val, label]) => (
                <button
                  key={val}
                  className={`chip ${format === val ? 'active' : ''}`}
                  onClick={() => setFormat(val)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <button className="icon-btn refresh-btn" onClick={onRefresh}>
            [ refresh feed data ]
          </button>
        </div>
      )}

      {/* Stats line */}
      <div className="stats-line">
        <span className="stats-prompt">&gt;</span>
        <span>{episodes.length} eps</span>
        <span className="sep">|</span>
        <span className="stat-unplayed">{unplayedCount} unplayed</span>
        {inProgressCount > 0 && (
          <>
            <span className="sep">|</span>
            <span className="stat-progress">{inProgressCount} in progress</span>
          </>
        )}
      </div>

      {/* Episode list */}
      <div className="episode-scroll">
        {episodes.map(ep => {
          const isCurrent = currentPlayingId === ep.id;
          const playing = isCurrent && isPlaying;
          return (
            <div
              key={ep.id}
              className={`ep-card ${ep.play_state} ${isCurrent ? 'playing' : ''}`}
              onClick={() => onOpen(ep.id)}
            >
              <div className="ep-card-left">
                <span className={`ep-state-icon ${ep.play_state}`}>
                  {STATE_ICON[ep.play_state] || '○'}
                </span>
                <div className="ep-card-info">
                  <div className="ep-card-top">
                    {ep.episode_number && (
                      <span className="ep-num">#{ep.episode_number}</span>
                    )}
                    <span className="ep-card-title">{ep.title}</span>
                  </div>
                  {ep.parsed_title && (
                    <div className="ep-card-parsed">
                      {ep.parsed_title.riddle_theme && (
                        <span className="ep-theme">{ep.parsed_title.riddle_theme}</span>
                      )}
                      {Array.isArray(ep.parsed_title.guest_names) &&
                        ep.parsed_title.guest_names.length > 0 && (
                          <span className="ep-guests">
                            w/ {ep.parsed_title.guest_names.join(', ')}
                          </span>
                        )}
                    </div>
                  )}
                  <div className="ep-card-meta">
                    <span>{fmtDate(ep.pub_date)}</span>
                    <span className="sep">·</span>
                    <span>{fmtDuration(ep.duration)}</span>
                    {ep.play_state === 'in-progress' && ep.duration && (
                      <>
                        <span className="sep">·</span>
                        <span className="progress-pct">
                          {Math.round((ep.last_position / ep.duration) * 100)}%
                        </span>
                      </>
                    )}
                  </div>
                  {ep.play_state === 'in-progress' && ep.duration && (
                    <div className="progress-bar">
                      <div
                        className="progress-fill"
                        style={{
                          width: `${Math.round((ep.last_position / ep.duration) * 100)}%`,
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
              <button
                className="ep-play-btn"
                onClick={e => {
                  e.stopPropagation();
                  if (isCurrent && isPlaying) {
                    onTogglePlay();
                  } else {
                    onPlay(ep);
                  }
                }}
              >
                {playing ? '⏸' : '▶'}
              </button>
            </div>
          );
        })}
        {episodes.length === 0 && (
          <div className="empty-state">
            <ScribbleInk variant="inline" />
            <pre className="empty-ascii">{`
   ┌─────────────────┐
   │  NO EPISODES    │
   │  FOUND          │
   └─────────────────┘`}</pre>
            <p>Go to Admin tab and sync RSS feed</p>
          </div>
        )}
      </div>
    </div>
  );
}
