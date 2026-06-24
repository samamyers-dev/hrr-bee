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
  skipForward: (seconds?: number) => void;
  skipBackward: (seconds?: number) => void;
  setSpeed: (speed: number) => void;
}

export function useAudioPlayer(): AudioPlayerState {
  const howlRef = useRef<Howl | null>(null);
  const rafRef = useRef<number>(0);
  const reportRef = useRef<number>(0);
  const episodeIdRef = useRef<string | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const speedRef = useRef<number>(1);
  const savedPosRef = useRef<number>(0);
  const loadTokenRef = useRef<number>(0);

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

  const stopReporting = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    clearInterval(reportRef.current);
    rafRef.current = 0;
    reportRef.current = 0;
  }, []);

  const load = useCallback(
    (episodeId: string, title: string, audioUrl: string) => {
      // Token guards against overlapping load() calls (e.g. double taps).
      const token = ++loadTokenRef.current;

      // Unload previous instance synchronously.
      howlRef.current?.unload();
      howlRef.current = null;
      stopReporting();

      setState(s => ({
        ...s,
        isPlaying: false,
        isLoading: true,
        episodeId,
        episodeTitle: title,
        currentTime: 0,
        duration: 0,
      }));

      episodeIdRef.current = episodeId;
      audioUrlRef.current = audioUrl;
      savedPosRef.current = 0;

      // Fetch saved position in the background — do NOT await before
      // constructing the Howl, since awaiting would break the user-gesture
      // chain required by browser autoplay policies (the original cause of
      // unreliable playback).
      api.playback
        .position(episodeId)
        .then(r => {
          if (token !== loadTokenRef.current) return; // superseded
          savedPosRef.current = r.position_seconds || 0;
          const h = howlRef.current;
          // If the howl already loaded before position arrived, seek now.
          if (h && savedPosRef.current > 5) {
            h.seek(savedPosRef.current);
          }
        })
        .catch(() => {});

      // Create the Howl synchronously within the user gesture so that
      // howl.play() below is allowed by autoplay policies.
      const howl = new Howl({
        src: [audioUrl],
        html5: true,
        preload: true,
        rate: speedRef.current,
        onload: () => {
          if (token !== loadTokenRef.current) return;
          setState(s => ({ ...s, duration: howl.duration(), isLoading: false }));
          const pos = savedPosRef.current;
          if (pos > 5) howl.seek(pos);
        },
        onplay: () => {
          if (token !== loadTokenRef.current) return;
          setState(s => ({ ...s, isPlaying: true, isLoading: false }));
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
          if (token !== loadTokenRef.current) return;
          setState(s => ({ ...s, isPlaying: false }));
          cancelAnimationFrame(rafRef.current);
        },
        onstop: () => {
          if (token !== loadTokenRef.current) return;
          setState(s => ({ ...s, isPlaying: false }));
          cancelAnimationFrame(rafRef.current);
        },
        onend: () => {
          if (token !== loadTokenRef.current) return;
          setState(s => ({ ...s, isPlaying: false }));
          cancelAnimationFrame(rafRef.current);
          clearInterval(reportRef.current);
          const eid = episodeIdRef.current;
          if (eid) {
            api.episodes.updateProgress(eid, 'played').catch(() => {});
          }
        },
        onloaderror: (_id: number, err: unknown) => {
          if (token !== loadTokenRef.current) return;
          setState(s => ({ ...s, isLoading: false, isPlaying: false }));
          console.error('Audio load error:', err);
        },
        onplayerror: (_id: number, err: unknown) => {
          // Autoplay was blocked (commonly because the user-gesture chain
          // was broken earlier in the session). Surface a stopped state so
          // the user can press play, which IS a gesture and will succeed.
          if (token !== loadTokenRef.current) return;
          console.warn('Audio play blocked:', err);
          setState(s => ({ ...s, isLoading: false, isPlaying: false }));
        },
      });

      howlRef.current = howl;
      howl.play();
    },
    [stopReporting, updateTime]
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

  const skipForward = useCallback((seconds: number = 15) => {
    const h = howlRef.current;
    if (!h) return;
    const current = h.seek() as number;
    const newTime = current + seconds;
    h.seek(newTime);
    setState(s => ({ ...s, currentTime: newTime }));
  }, []);

  const skipBackward = useCallback((seconds: number = 15) => {
    const h = howlRef.current;
    if (!h) return;
    const current = h.seek() as number;
    const newTime = Math.max(0, current - seconds);
    h.seek(newTime);
    setState(s => ({ ...s, currentTime: newTime }));
  }, []);

  const setSpeed = useCallback((speed: number) => {
    speedRef.current = speed;
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
    skipForward,
    skipBackward,
    setSpeed,
  };
}
