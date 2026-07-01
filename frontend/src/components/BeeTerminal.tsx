interface Props {
  visible: boolean;
  onClose: () => void;
}

export function BeeTerminal({ visible, onClose }: Props) {
  if (!visible) return null;
  return (
    <div className="bee-terminal-overlay" onClick={onClose}>
      <div className="bee-terminal" onClick={e => e.stopPropagation()}>
        <pre className="bee-ascii">{`
              _  _
             | )/ )
          \\ |//,' __
          _-"''"-._) \\      [Esoteric Swarm Matrix]
         '-./ | \\.-'  )     Classification: SECURE ARCHIVE
           _\\_//_   /      Directive: Out-of-band Fallback
          /  _|_  \\_/
         ((_(_|_)_))`
}</pre>
        <p className="bee-caption">[BIOLOGICAL ENTITY DETECTED — LAB-SPEC-01]</p>
        <button className="term-btn" onClick={onClose}>[ close terminal ]</button>
      </div>
    </div>
  );
}
