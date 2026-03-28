export function ActivityDrawerSummary({ activity = [] }) {
  return (
    <aside className="drawerCard">
      <header className="drawerHeader">
        <span className="drawerEyebrow">Workspace activity</span>
        <h3>Recent activity</h3>
      </header>
      <ul className="drawerList">
        {activity.map((item) => (
          <li key={item.id}>
            <strong>{item.actor}</strong>
            <span>{item.action}</span>
          </li>
        ))}
      </ul>
      <footer className="drawerFooter">
        <strong>{activity.length} events</strong>
        <button className="primaryAction">Open activity feed</button>
      </footer>
    </aside>
  );
}
