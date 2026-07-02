import type { AudioPlayerState } from '../hooks/useAudioPlayer';
import { useSeekBar } from '../hooks/useSeekBar';
import type { Episode } from '../api/client';
import { sanitizeHtml } from '../utils/sanitizeHtml';
import { ScribbleInk } from './ScribbleInk';

interface Props {
  player: AudioPlayerState;
  episode: Episode | null;
  onClose: () => void;
  onMarkPlayed: () => void;
  onMarkUnplayed: () => void;
}

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];

function fmtTime(s: number): string {
  if (!s || s < 0 || !isFinite(s)) return '0:00';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function fmtDuration(secs: number | null): string {
  if (!secs) return 'unknown';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function fmtDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function NowPlayingCard({
  player,
  episode,
  onClose,
  onMarkPlayed,
  onMarkUnplayed,
}: Props) {
  if (!episode) return null;

  const pct = player.duration > 0 ? (player.currentTime / player.duration) * 100 : 0;
  const seekHandlers = useSeekBar({
    duration: player.duration,
    onSeek: time => player.seek(time, false),
    onSeekEnd: time => player.seek(time, true),
  });

  return (
    <div className="now-playing-overlay" onClick={onClose}>
      <div className="now-playing-card" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="np-header">
          <span className="np-header-title">{'>>'} NOW PLAYING</span>
          <button className="np-close-btn" onClick={onClose}>
            [x]
          </button>
        </div>

        {/* Body */}
        <div className="np-body">
          <ScribbleInk variant="corner" />
          {/* Episode info */}
          <div className="np-episode-num">
            {episode.episode_number ? `EPISODE #${episode.episode_number}` : 'EPISODE'}
          </div>
          <h2 className="np-title">{episode.title}</h2>
          <div className="np-meta">
            <span>{fmtDate(episode.pub_date)}</span>
            <span className="sep">·</span>
            <span>{fmtDuration(episode.duration)}</span>
            <span className="sep">·</span>
            <span className={`detail-state ${episode.play_state}`}>
              {episode.play_state}
            </span>
          </div>

          <hr className="np-divider" />

          {/* Progress bar (large, tappable) */}
          <div className="np-progress-section">
            <div
              ref={seekHandlers.ref as React.RefObject<HTMLDivElement>}
              className="np-progress-bar"
              onClick={seekHandlers.onClick}
              onMouseDown={seekHandlers.onMouseDown}
              onTouchStart={seekHandlers.onTouchStart}
            >
              <div className="np-progress-fill" style={{ width: `${pct}%` }} />
            </div>
            <div className="np-time-row">
              <span>{fmtTime(player.currentTime)}</span>
              <span>{fmtTime(player.duration)}</span>
            </div>
          </div>

          {/* Main controls — skip back, play, skip forward */}
          <div className="np-controls">
            <div className="np-ctrl-group">
              <button
                className="np-ctrl-btn"
                onClick={() => player.skipBackward(15)}
              >
                ⏪
              </button>
              <span className="np-ctrl-label">-15s</span>
            </div>

            <div className="np-ctrl-group">
              <button
                className="np-ctrl-btn play"
                onClick={player.togglePlay}
                disabled={player.isLoading}
              >
                {player.isLoading ? '...' : player.isPlaying ? '⏸' : '▶'}
              </button>
              <span className="np-ctrl-label">
                {player.isPlaying ? 'PAUSE' : 'PLAY'}
              </span>
            </div>

            <div className="np-ctrl-group">
              <button
                className="np-ctrl-btn"
                onClick={() => player.skipForward(15)}
              >
                ⏩
              </button>
              <span className="np-ctrl-label">+15s</span>
            </div>
          </div>

          {/* Speed selector */}
          <div className="np-speed-row">
            {SPEEDS.map(s => (
              <button
                key={s}
                className={`np-speed-chip ${player.playbackSpeed === s ? 'active' : ''}`}
                onClick={() => player.setSpeed(s)}
              >
                {s}x
              </button>
            ))}
          </div>

          <hr className="np-divider" />

          {/* Actions */}
          <div className="np-actions">
            {episode.play_state !== 'played' ? (
              <button className="term-btn" onClick={onMarkPlayed}>
                [ mark played ]
              </button>
            ) : (
              <button className="term-btn" onClick={onMarkUnplayed}>
                [ mark unplayed ]
              </button>
            )}
          </div>

          {/* Description */}
          {episode.description && (
            <div style={{ marginTop: '16px' }}>
              <h3 className="detail-section-title">{'>>'} DESCRIPTION</h3>
              <div
                className="detail-desc-text"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(episode.description) }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
