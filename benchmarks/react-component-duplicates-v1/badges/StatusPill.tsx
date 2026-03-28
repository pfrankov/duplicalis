import './StatusPill.css';

export function StatusPill({ label = 'Live', note = 'Healthy' }) {
  return (
    <span className="pill">
      <span className="pillAccent" />
      <span className="pillLabel">{label}</span>
      <span className="pillMeta">{note}</span>
    </span>
  );
}
