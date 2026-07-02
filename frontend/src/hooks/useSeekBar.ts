import { useRef, useCallback, useEffect } from 'react';

export interface SeekBarHandlers {
  ref: React.RefObject<HTMLElement | null>;
  onMouseDown: (e: React.MouseEvent) => void;
  onTouchStart: (e: React.TouchEvent) => void;
  onClick: (e: React.MouseEvent) => void;
}

export interface UseSeekBarOptions {
  duration: number;
  onSeek: (time: number) => void;
  onSeekEnd?: (time: number) => void;
}

export function useSeekBar({ duration, onSeek, onSeekEnd }: UseSeekBarOptions): SeekBarHandlers {
  const trackRef = useRef<HTMLElement | null>(null);
  const draggingRef = useRef(false);
  const lastClientXRef = useRef<number | null>(null);

  const computeTime = useCallback(
    (clientX: number) => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect) return 0;
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return ratio * duration;
    },
    [duration]
  );

  const handleMove = useCallback(
    (clientX: number) => {
      lastClientXRef.current = clientX;
      if (!draggingRef.current) return;
      onSeek(computeTime(clientX));
    },
    [computeTime, onSeek]
  );

  const endDrag = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    if (onSeekEnd && lastClientXRef.current !== null) {
      onSeekEnd(computeTime(lastClientXRef.current));
    }
    lastClientXRef.current = null;
  }, [computeTime, onSeekEnd]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => handleMove(e.clientX);
    const onTouchMove = (e: TouchEvent) => {
      if (draggingRef.current) {
        // Prevent page scroll while scrubbing on touch devices.
        e.preventDefault();
      }
      if (e.touches.length > 0) handleMove(e.touches[0].clientX);
    };
    const onUp = () => endDrag();

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onUp);
    window.addEventListener('touchcancel', onUp);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onUp);
      window.removeEventListener('touchcancel', onUp);
    };
  }, [handleMove, endDrag]);

  const startDrag = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      // Prevent default to stop text selection on desktop and unwanted
      // scrolling/click behavior on touch devices.
      e.preventDefault();
      draggingRef.current = true;
      const clientX =
        'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
      lastClientXRef.current = clientX;
      onSeek(computeTime(clientX));
    },
    [computeTime, onSeek]
  );

  const onClick = useCallback(
    (e: React.MouseEvent) => {
      // Stop the click from bubbling to parent controls (e.g. expanding the
      // minimized player or closing a modal). The actual seek is handled by
      // onMouseDown/onTouchStart, so we do NOT seek again here; otherwise a
      // single tap would seek twice (once on down, once on click).
      e.stopPropagation();
      draggingRef.current = false;
    },
    []
  );

  return {
    ref: trackRef,
    onMouseDown: startDrag as (e: React.MouseEvent) => void,
    onTouchStart: startDrag as (e: React.TouchEvent) => void,
    onClick,
  };
}
