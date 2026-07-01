interface Props {
  className?: string;
}

export function NotebookSpine({ className = '' }: Props) {
  return (
    <div className={`notebook-spine ${className}`} aria-hidden="true">
      <div className="spine-wire" />
      <div className="spine-rings">
        <span />
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}
