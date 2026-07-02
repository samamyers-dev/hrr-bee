import type { AudioPlayerState } from '../hooks/useAudioPlayer';
import { useSeekBar } from '../hooks/useSeekBar';

interface Props {
  player: AudioPlayerState;
  onExpand: () => void;
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

export function AudioBar({ player, onExpand }: Props) {
  const pct = player.duration > 0 ? (player.currentTime / player.duration) * 100 : 0;
  const seekHandlers = useSeekBar({
    duration: player.duration,
    onSeek: time => player.seek(time, false),
    onSeekEnd: time => player.seek(time, true),
  });

  const cycleSpeed = (e: React.MouseEvent) => {
    e.stopPropagation();
    const idx = SPEEDS.indexOf(player.playbackSpeed);
    player.setSpeed(SPEEDS[(idx + 1) % SPEEDS.length]);
  };

  // Prevent button clicks from triggering expand
  const stopProp = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div className="audio-bar" onClick={onExpand}>
      {/* Info row — tappable to expand */}
      <div className="audio-bar-info">
        <span className="audio-bar-state">
          {player.isPlaying ? '▶' : '⏸'} NOW PLAYING
        </span>
        <span className="audio-bar-title">{player.episodeTitle}</span>
        <span className="audio-expand-hint">[↑]</span>
      </div>

      {/* Controls row */}
      <div className="audio-bar-controls" onClick={stopProp}>
        <button
          className="audio-skip-btn"
          onClick={() => player.skipBackward(15)}
          title="Rewind 15s"
        >
          ⏪
        </button>

        <button
          className="audio-play-btn"
          onClick={player.togglePlay}
          disabled={player.isLoading}
        >
          {player.isLoading ? '...' : player.isPlaying ? '⏸' : '▶'}
        </button>

        <button
          className="audio-skip-btn"
          onClick={() => player.skipForward(15)}
          title="Forward 15s"
        >
          ⏩
        </button>

        <div className="audio-seek-wrap">
          <span className="audio-time">{fmtTime(player.currentTime)}</span>
          <div
            ref={seekHandlers.ref as React.RefObject<HTMLDivElement>}
            className="audio-seek"
            onClick={seekHandlers.onClick}
            onMouseDown={seekHandlers.onMouseDown}
            onTouchStart={seekHandlers.onTouchStart}
          >
            <div className="audio-seek-track" />
            <div className="audio-seek-fill" style={{ width: `${pct}%` }} />
            <div className="audio-seek-knob" style={{ left: `${pct}%` }} />
          </div>
          <span className="audio-time">{fmtTime(player.duration)}</span>
        </div>

        <button className="audio-speed-btn" onClick={cycleSpeed}>
          {player.playbackSpeed}x
        </button>
      </div>
    </div>
  );
}
