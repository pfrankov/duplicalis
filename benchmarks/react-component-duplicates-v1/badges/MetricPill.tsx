import './MetricPill.css';

export function MetricPill({ label = 'Expansion', note = '+14%' }) {
  return (
    <span className="pill">
      <span className="pillAccent" />
      <span className="pillLabel">{label}</span>
      <span className="pillMeta">{note}</span>
    </span>
  );
}
