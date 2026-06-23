import { useState } from 'react';
import type { Episode } from '../api/client';

interface Props {
  ep: Episode;
  onBack: () => void;
  onPlay: () => void;
  isPlaying: boolean;
  onMarkPlayed: () => void;
  onMarkUnplayed: () => void;
  onMarkPreviousPlayed: () => void;
}

function fmtDuration(secs: number | null): string {
  if (!secs) return 'unknown';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function fmtDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function EpisodeDetail({
  ep,
  onBack,
  onPlay,
  isPlaying,
  onMarkPlayed,
  onMarkUnplayed,
  onMarkPreviousPlayed,
}: Props) {
  const [confirmPrev, setConfirmPrev] = useState(false);

  return (
    <div className="episode-detail">
      <button className="back-btn" onClick={onBack}>
        ← back
      </button>

      <div className="detail-header">
        {ep.episode_number && (
          <span className="detail-ep-num">EPISODE #{ep.episode_number}</span>
        )}
        <h1 className="detail-title">{ep.title}</h1>
        <div className="detail-meta">
          <span>{fmtDate(ep.pub_date)}</span>
          <span className="sep">·</span>
          <span>{fmtDuration(ep.duration)}</span>
          <span className="sep">·</span>
          <span className={`detail-state ${ep.play_state}`}>{ep.play_state}</span>
        </div>
      </div>

      <div className="detail-actions">
        <button className="term-btn primary" onClick={onPlay}>
          {isPlaying ? '[ pause ]' : '[ play ]'}
        </button>
        {ep.play_state !== 'played' ? (
          <button className="term-btn" onClick={onMarkPlayed}>
            [ mark played ]
          </button>
        ) : (
          <button className="term-btn" onClick={onMarkUnplayed}>
            [ mark unplayed ]
          </button>
        )}
        {!confirmPrev ? (
          <button className="term-btn" onClick={() => setConfirmPrev(true)}>
            [ mark all previous played ]
          </button>
        ) : (
          <div className="confirm-inline">
            <span className="confirm-text">mark all earlier eps as played?</span>
            <button
              className="term-btn primary"
              onClick={() => {
                setConfirmPrev(false);
                onMarkPreviousPlayed();
              }}
            >
              [ confirm ]
            </button>
            <button className="term-btn" onClick={() => setConfirmPrev(false)}>
              [ cancel ]
            </button>
          </div>
        )}
      </div>

      {ep.description && (
        <div className="detail-desc">
          <h3 className="detail-section-title">{'>>'} description</h3>
          <div
            className="detail-desc-text"
            dangerouslySetInnerHTML={{ __html: ep.description }}
          />
        </div>
      )}
    </div>
  );
}
