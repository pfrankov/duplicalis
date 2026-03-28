import { useMemo } from 'react';

export function NotificationsTimeline({ notifications = [] }) {
  const ordered = useMemo(() => {
    return [...notifications].sort((left, right) => right.sentAt.localeCompare(left.sentAt));
  }, [notifications]);

  return (
    <section className="timelineCard">
      <header className="timelineHeader">
        <span className="timelineEyebrow">Inbox</span>
        <h3>Notification timeline</h3>
        <p>{ordered.length} recent sends</p>
      </header>
      <ol className="timelineList">
        {ordered.map((notification) => (
          <li key={notification.id}>
            <strong>{notification.channel}</strong>
            <span>{notification.sentAt}</span>
            <small>{notification.subject}</small>
          </li>
        ))}
      </ol>
      <footer className="timelineFooter">
        <button className="ghostAction">Open notification center</button>
      </footer>
    </section>
  );
}
