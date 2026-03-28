import './HealthStrip.css';

export function HealthStrip({ title = 'System health', items = [] }) {
  return (
    <section className="strip">
      <header className="stripHeader">
        <strong className="stripTitle">{title}</strong>
        <span className="stripMeta">{items.length} signals</span>
      </header>
      <ul className="stripList">
        {items.map((item) => (
          <li key={item.id} className="stripRow">
            <span>{item.label}</span>
            <span className="stripValue">{item.value}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
