import type { AudioPlayerState } from '../hooks/useAudioPlayer';

interface Props {
  player: AudioPlayerState;
}

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];

function fmtTime(s: number): string {
  if (!s || s < 0) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export function AudioBar({ player }: Props) {
  const pct = player.duration > 0 ? (player.currentTime / player.duration) * 100 : 0;

  const handleSeek = (e: React.MouseEvent | React.TouchEvent) => {
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const clientX =
      'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const ratio = (clientX - rect.left) / rect.width;
    player.seek(ratio * player.duration);
  };

  const cycleSpeed = () => {
    const idx = SPEEDS.indexOf(player.playbackSpeed);
    player.setSpeed(SPEEDS[(idx + 1) % SPEEDS.length]);
  };

  return (
    <div className="audio-bar">
      <div className="audio-bar-info">
        <span className="audio-bar-state">
          {player.isPlaying ? '▶' : '⏸'} NOW PLAYING
        </span>
        <span className="audio-bar-title">{player.episodeTitle}</span>
      </div>

      <div className="audio-bar-controls">
        <button
          className="audio-play-btn"
          onClick={player.togglePlay}
          disabled={player.isLoading}
        >
          {player.isLoading ? '...' : player.isPlaying ? '⏸' : '▶'}
        </button>

        <div className="audio-seek-wrap">
          <span className="audio-time">{fmtTime(player.currentTime)}</span>
          <div className="audio-seek" onClick={handleSeek} onTouchStart={handleSeek}>
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
