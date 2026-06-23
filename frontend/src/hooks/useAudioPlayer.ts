import { useRef, useState, useCallback, useEffect } from 'react';
import { Howl } from 'howler';
import { api } from '../api/client';

export interface AudioPlayerState {
  isPlaying: boolean;
  isLoading: boolean;
  currentTime: number;
  duration: number;
  playbackSpeed: number;
  episodeId: string | null;
  episodeTitle: string | null;
  load: (episodeId: string, title: string, audioUrl: string) => void;
  togglePlay: () => void;
  seek: (time: number) => void;
  setSpeed: (speed: number) => void;
}

export function useAudioPlayer(): AudioPlayerState {
  const howlRef = useRef<Howl | null>(null);
  const rafRef = useRef<number>(0);
  const reportRef = useRef<number>(0);
  const episodeIdRef = useRef<string | null>(null);
  const audioUrlRef = useRef<string | null>(null);

  const [state, setState] = useState({
    isPlaying: false,
    isLoading: false,
    currentTime: 0,
    duration: 0,
    playbackSpeed: 1,
    episodeId: null as string | null,
    episodeTitle: null as string | null,
  });

  const updateTime = useCallback(() => {
    const h = howlRef.current;
    if (h && h.playing()) {
      setState(s => ({ ...s, currentTime: h.seek() as number }));
      rafRef.current = requestAnimationFrame(updateTime);
    }
  }, []);

  const load = useCallback(
    async (episodeId: string, title: string, audioUrl: string) => {
      // Unload previous
      howlRef.current?.unload();
      cancelAnimationFrame(rafRef.current);
      clearInterval(reportRef.current);

      setState(s => ({
        ...s,
        isLoading: true,
        episodeId,
        episodeTitle: title,
        currentTime: 0,
        duration: 0,
      }));

      episodeIdRef.current = episodeId;
      audioUrlRef.current = audioUrl;

      try {
        // Fetch saved position
        let savedPosition = 0;
        try {
          const posR = await api.playback.position(episodeId);
          savedPosition = posR.position_seconds;
        } catch {
          // ignore
        }

        const howl = new Howl({
          src: [audioUrl],
          html5: true,
          preload: true,
          rate: state.playbackSpeed,
          onload: () => {
            setState(s => ({ ...s, duration: howl.duration(), isLoading: false }));
            if (savedPosition > 5) howl.seek(savedPosition);
          },
          onplay: () => {
            setState(s => ({ ...s, isPlaying: true }));
            rafRef.current = requestAnimationFrame(updateTime);
            reportRef.current = window.setInterval(() => {
              const eid = episodeIdRef.current;
              if (eid && howl.playing()) {
                api.playback
                  .report(eid, Math.floor(howl.seek() as number), howl.rate())
                  .catch(() => {});
              }
            }, 10000);
          },
          onpause: () => {
            setState(s => ({ ...s, isPlaying: false }));
            cancelAnimationFrame(rafRef.current);
          },
          onstop: () => {
            setState(s => ({ ...s, isPlaying: false }));
            cancelAnimationFrame(rafRef.current);
          },
          onend: () => {
            setState(s => ({ ...s, isPlaying: false }));
            cancelAnimationFrame(rafRef.current);
            // Mark as played
            const eid = episodeIdRef.current;
            if (eid) {
              api.episodes.updateProgress(eid, 'played').catch(() => {});
            }
          },
          onloaderror: (_id: number, err: unknown) => {
            setState(s => ({ ...s, isLoading: false, isPlaying: false }));
            console.error('Audio load error:', err);
          },
        });

        howlRef.current = howl;
        howl.play();
      } catch (err) {
        setState(s => ({ ...s, isLoading: false }));
        console.error('Audio failed:', err);
      }
    },
    [state.playbackSpeed, updateTime]
  );

  const togglePlay = useCallback(() => {
    const h = howlRef.current;
    if (!h) return;
    if (h.playing()) {
      h.pause();
    } else {
      h.play();
    }
  }, []);

  const seek = useCallback((time: number) => {
    howlRef.current?.seek(time);
    setState(s => ({ ...s, currentTime: time }));
  }, []);

  const setSpeed = useCallback((speed: number) => {
    howlRef.current?.rate(speed);
    setState(s => ({ ...s, playbackSpeed: speed }));
  }, []);

  useEffect(
    () => () => {
      cancelAnimationFrame(rafRef.current);
      clearInterval(reportRef.current);
      howlRef.current?.unload();
    },
    []
  );

  return {
    ...state,
    load,
    togglePlay,
    seek,
    setSpeed,
  };
}
