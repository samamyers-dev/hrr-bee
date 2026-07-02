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

const DRAG_THRESHOLD_PX = 3;

export function useSeekBar({ duration, onSeek, onSeekEnd }: UseSeekBarOptions): SeekBarHandlers {
  const trackRef = useRef<HTMLElement | null>(null);
  const draggingRef = useRef(false);
  const hasMovedRef = useRef(false);
  const startClientXRef = useRef<number | null>(null);
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

      const startX = startClientXRef.current;
      if (startX !== null && Math.abs(clientX - startX) > DRAG_THRESHOLD_PX) {
        hasMovedRef.current = true;
      }

      onSeek(computeTime(clientX));
    },
    [computeTime, onSeek]
  );

  const endDrag = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;

    if (lastClientXRef.current !== null) {
      const time = computeTime(lastClientXRef.current);
      // During a drag the last mousemove/touchmove already seeked to this
      // position, so only commit the final report. For a simple tap we need
      // to seek now because no move event fired.
      if (!hasMovedRef.current) {
        onSeek(time);
      }
      onSeekEnd?.(time);
    }

    hasMovedRef.current = false;
    startClientXRef.current = null;
    lastClientXRef.current = null;
  }, [computeTime, onSeek, onSeekEnd]);

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
      hasMovedRef.current = false;
      const clientX =
        'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
      startClientXRef.current = clientX;
      lastClientXRef.current = clientX;
    },
    []
  );

  const onClick = useCallback(
    (e: React.MouseEvent) => {
      // Stop the click from bubbling to parent controls (e.g. expanding the
      // minimized player or closing a modal). We do NOT seek here because
      // preventDefault() on mousedown/touchstart can suppress the synthetic
      // click event on some browsers; the actual seek is committed in the
      // global mouseup/touchend handler.
      e.stopPropagation();
      draggingRef.current = false;
      hasMovedRef.current = false;
      startClientXRef.current = null;
      lastClientXRef.current = null;
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
