import { useMemo } from 'react';

export function IncidentTimeline({ events = [] }) {
  const ordered = useMemo(() => {
    return [...events].sort((left, right) => right.date.localeCompare(left.date));
  }, [events]);

  const latest = ordered[0];

  return (
    <section className="timelineCard">
      <header className="timelineHeader">
        <span className="timelineEyebrow">Operations</span>
        <h3>Incident timeline</h3>
        <p>Latest step: {latest?.title || 'No active incident'}</p>
      </header>
      <ol className="timelineList">
        {ordered.map((event) => (
          <li key={event.id}>
            <strong>{event.title}</strong>
            <span>{event.date}</span>
            <small>{event.owner}</small>
          </li>
        ))}
      </ol>
      <footer className="timelineFooter">
        <button className="ghostAction">Export incident log</button>
      </footer>
    </section>
  );
}
