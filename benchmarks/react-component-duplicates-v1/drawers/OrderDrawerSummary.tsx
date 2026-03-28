import { useMemo } from 'react';

export function OrderDrawerSummary({ order }) {
  const totals = useMemo(() => {
    return order.lines.reduce(
      (acc, line) => {
        acc.subtotal += line.price * line.quantity;
        acc.tax += line.tax;
        return acc;
      },
      { subtotal: 0, tax: 0 }
    );
  }, [order]);

  return (
    <aside className="drawerCard">
      <header className="drawerHeader">
        <span className="drawerEyebrow">Commerce drawer</span>
        <h3>Order summary</h3>
      </header>
      <dl className="drawerMeta">
        <div>
          <dt>Order</dt>
          <dd>{order.number}</dd>
        </div>
        <div>
          <dt>Owner</dt>
          <dd>{order.owner}</dd>
        </div>
      </dl>
      <ul className="drawerList">
        {order.lines.map((line) => (
          <li key={line.id}>
            <strong>{line.label}</strong>
            <span>{line.quantity} units</span>
          </li>
        ))}
      </ul>
      <footer className="drawerFooter">
        <strong>Total {totals.subtotal + totals.tax}</strong>
        <button className="primaryAction">Submit order</button>
      </footer>
    </aside>
  );
}
