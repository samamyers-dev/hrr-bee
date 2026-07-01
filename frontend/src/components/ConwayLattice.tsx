import { useEffect, useRef } from 'react';

interface Props {
  className?: string;
  mode: 'light' | 'dark';
}

const CELL = 6; // px
const FPS = 8;

function makeGrid(cols: number, rows: number): boolean[][] {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => Math.random() > 0.82)
  );
}

function step(prev: boolean[][]): boolean[][] {
  const rows = prev.length;
  const cols = prev[0]?.length ?? 0;
  const next: boolean[][] = Array.from({ length: rows }, () => Array(cols).fill(false));
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      let neighbors = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const ny = (y + dy + rows) % rows;
          const nx = (x + dx + cols) % cols;
          if (prev[ny][nx]) neighbors++;
        }
      }
      next[y][x] = prev[y][x] ? neighbors === 2 || neighbors === 3 : neighbors === 3;
    }
  }
  return next;
}

export function ConwayLattice({ className = '', mode }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gridRef = useRef<boolean[][]>([]);
  const lastRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const cols = Math.ceil(rect.width / CELL);
      const rows = Math.ceil(rect.height / CELL);
      gridRef.current = makeGrid(cols, rows);
    };

    resize();
    window.addEventListener('resize', resize);

    const colors = {
      light: { live: '#C99653', born: '#AD563E', bg: '#F2EDE4' },
      dark: { live: '#5D7B66', born: '#C99653', bg: '#181614' },
    }[mode];

    let raf = 0;
    const draw = (t: number) => {
      raf = requestAnimationFrame(draw);
      if (t - lastRef.current < 1000 / FPS) return;
      lastRef.current = t;

      const grid = gridRef.current;
      if (!grid.length) return;
      const rows = grid.length;
      const cols = grid[0].length;

      ctx.fillStyle = colors.bg;
      ctx.fillRect(0, 0, canvas.width / (window.devicePixelRatio || 1), canvas.height / (window.devicePixelRatio || 1));

      // faint dot-matrix underlay
      ctx.fillStyle = mode === 'dark' ? 'rgba(242,237,228,0.04)' : 'rgba(46,40,36,0.06)';
      for (let y = 0; y < rows; y += 2) {
        for (let x = 0; x < cols; x += 2) {
          ctx.fillRect(x * CELL + CELL / 2 - 0.5, y * CELL + CELL / 2 - 0.5, 1, 1);
        }
      }

      const prev = grid.map(r => [...r]);
      const next = step(prev);
      gridRef.current = next;

      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          if (next[y][x]) {
            const born = !prev[y][x];
            ctx.fillStyle = born ? colors.born : colors.live;
            // Dithered frame look: draw cell as smaller block with slight offset
            ctx.fillRect(x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2);
            if (born) {
              ctx.strokeStyle = colors.born;
              ctx.lineWidth = 1;
              ctx.strokeRect(x * CELL + 0.5, y * CELL + 0.5, CELL - 1, CELL - 1);
            }
          }
        }
      }
    };

    raf = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(raf);
    };
  }, [mode]);

  return <canvas ref={canvasRef} className={`conway-lattice ${className}`} aria-hidden="true" />;
}
