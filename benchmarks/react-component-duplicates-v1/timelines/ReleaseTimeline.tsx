import { useMemo } from 'react';

export function ReleaseTimeline({ events = [] }) {
  const ordered = useMemo(() => {
    return [...events].sort((left, right) => right.date.localeCompare(left.date));
  }, [events]);

  const latest = ordered[0];

  return (
    <section className="timelineCard">
      <header className="timelineHeader">
        <span className="timelineEyebrow">Delivery</span>
        <h3>Release timeline</h3>
        <p>Latest step: {latest?.title || 'Not scheduled'}</p>
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
        <button className="ghostAction">Export timeline</button>
      </footer>
    </section>
  );
}
