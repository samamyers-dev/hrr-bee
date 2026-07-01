interface Props {
  className?: string;
  variant?: 'corner' | 'inline' | 'annotation';
}

export function ScribbleInk({ className = '', variant = 'inline' }: Props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 200 80"
      fill="none"
      className={`scribble-ink ${className} scribble-${variant}`}
      aria-hidden="true"
      shapeRendering="crispEdges"
    >
      <path
        d="M12 18c8-4 22-6 34-2s18 14 10 22c-10 10-28 8-38 4"
        className="scribble-stroke"
        strokeWidth="2"
        strokeLinecap="butt"
        strokeLinejoin="bevel"
      />
      <path
        d="M62 24l14-8 8 16 18-12"
        className="scribble-stroke"
        strokeWidth="2"
        strokeLinecap="butt"
        strokeLinejoin="bevel"
      />
      <path
        d="M118 34c-6 10-4 22 8 26s26-4 30-16c2-8-2-16-10-18"
        className="scribble-stroke"
        strokeWidth="2"
        strokeLinecap="butt"
        strokeLinejoin="bevel"
      />
      <path
        d="M28 52l-6 8M42 58l4 6M156 20l10-6M170 28l8 6"
        className="scribble-stroke"
        strokeWidth="2"
        strokeLinecap="butt"
      />
      <text x="70" y="62" className="scribble-text" fontSize="10" fontFamily="monospace">
        ?
      </text>
    </svg>
  );
}
