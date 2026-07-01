interface Props {
  className?: string;
}

export function BlueprintSvg({ className = '' }: Props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 400 280"
      fill="none"
      className={`blueprint-svg ${className}`}
      aria-hidden="true"
    >
      <defs>
        <pattern id="dot-matrix" width="8" height="8" patternUnits="userSpaceOnUse">
          <circle cx="4" cy="4" r="1" className="bp-dot" />
        </pattern>
      </defs>
      <rect width="400" height="280" fill="url(#dot-matrix)" />

      <path
        d="M 10 10 L 390 10 M 10 10 L 10 270"
        className="bp-ruler"
        strokeDasharray="2,4"
        strokeWidth="1.5"
      />

      <circle cx="200" cy="140" r="80" className="bp-coord" strokeDasharray="6,4" strokeWidth="1.5" />
      <circle cx="200" cy="140" r="105" className="bp-accent" strokeWidth="1" strokeDasharray="2,8" />
      <line x1="200" y1="20" x2="200" y2="260" className="bp-coord" strokeWidth="1" strokeDasharray="4,6" />
      <line x1="50" y1="140" x2="350" y2="140" className="bp-coord" strokeWidth="1" strokeDasharray="4,6" />

      <path d="M 80,70 L 200,140 L 320,70 L 200,140 L 200,220" className="bp-vector" strokeWidth="2" />
      <path
        d="M 80,70 Q 200,30 320,70"
        className="bp-accent"
        strokeWidth="2"
        strokeDasharray="4,4"
        fill="none"
      />

      <circle cx="80" cy="70" r="14" className="bp-terminal-ring" strokeWidth="3" />
      <circle cx="80" cy="70" r="8" className="bp-terminal-fill sage" />

      <circle cx="320" cy="70" r="14" className="bp-terminal-ring" strokeWidth="3" />
      <circle cx="320" cy="70" r="8" className="bp-terminal-fill ochre" />

      <circle cx="200" cy="220" r="14" className="bp-terminal-ring" strokeWidth="3" />
      <circle cx="200" cy="220" r="8" className="bp-terminal-fill indigo" />

      <circle cx="200" cy="140" r="20" className="bp-hub" strokeWidth="3" />
      <polygon points="200,128 210,146 190,146" className="bp-hub-triangle" />
    </svg>
  );
}
