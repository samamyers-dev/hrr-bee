import type { SortOption, FilterOption } from '../api/client';

interface Props {
  sort: SortOption;
  setSort: (s: SortOption) => void;
  filter: FilterOption;
  setFilter: (f: FilterOption) => void;
  playbackSpeed: number;
  setPlaybackSpeed: (s: number) => void;
  onClose: () => void;
}

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];

export function SettingsSheet({
  sort,
  setSort,
  filter,
  setFilter,
  playbackSpeed,
  setPlaybackSpeed,
  onClose,
}: Props) {
  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-sheet" onClick={e => e.stopPropagation()}>
        <div className="settings-header">
          <h2>&gt; settings</h2>
          <button className="close-btn" onClick={onClose}>
            [x]
          </button>
        </div>

        <div className="settings-body">
          <div className="settings-group">
            <label className="settings-label">SORT ORDER</label>
            <div className="settings-chips">
              {(
                [
                  ['unplayed-first', 'UNPLAYED FIRST'],
                  ['unplayed-first-newest', 'UNPLAYED (NEW)'],
                  ['oldest', 'OLDEST FIRST'],
                  ['newest', 'NEWEST FIRST'],
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

          <div className="settings-group">
            <label className="settings-label">FILTER</label>
            <div className="settings-chips">
              {(
                [
                  ['all', 'ALL'],
                  ['unplayed', 'UNPLAYED'],
                  ['in-progress', 'IN PROGRESS'],
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

          <div className="settings-group">
            <label className="settings-label">PLAYBACK SPEED</label>
            <div className="settings-chips">
              {SPEEDS.map(s => (
                <button
                  key={s}
                  className={`chip ${playbackSpeed === s ? 'active' : ''}`}
                  onClick={() => setPlaybackSpeed(s)}
                >
                  {s}x
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
