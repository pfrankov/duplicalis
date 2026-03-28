import { useMemo } from 'react';

export function InvoiceDrawerSummary({ invoice }) {
  const totals = useMemo(() => {
    return invoice.lines.reduce(
      (acc, line) => {
        acc.subtotal += line.price * line.quantity;
        acc.tax += line.tax;
        return acc;
      },
      { subtotal: 0, tax: 0 }
    );
  }, [invoice]);

  return (
    <aside className="drawerCard">
      <header className="drawerHeader">
        <span className="drawerEyebrow">Billing drawer</span>
        <h3>Invoice summary</h3>
      </header>
      <dl className="drawerMeta">
        <div>
          <dt>Invoice</dt>
          <dd>{invoice.number}</dd>
        </div>
        <div>
          <dt>Owner</dt>
          <dd>{invoice.owner}</dd>
        </div>
      </dl>
      <ul className="drawerList">
        {invoice.lines.map((line) => (
          <li key={line.id}>
            <strong>{line.label}</strong>
            <span>{line.quantity} seats</span>
          </li>
        ))}
      </ul>
      <footer className="drawerFooter">
        <strong>Total {totals.subtotal + totals.tax}</strong>
        <button className="primaryAction">Send invoice</button>
      </footer>
    </aside>
  );
}
