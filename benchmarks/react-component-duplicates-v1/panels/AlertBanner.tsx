export function AlertBanner({ title = 'Sync failed', body = 'Retry in a few minutes.' }) {
  return (
    <section className="alertBanner">
      <div className="alertIcon">!</div>
      <div className="alertCopy">
        <h3>{title}</h3>
        <p>{body}</p>
      </div>
      <div className="alertActions">
        <button className="primaryAction">Retry sync</button>
        <button className="ghostAction">Inspect logs</button>
      </div>
    </section>
  );
}
