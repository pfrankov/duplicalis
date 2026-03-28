import { useMemo, useState, useTransition } from 'react';

export function CheckoutButton({ items = [], onConfirm }) {
  const [expanded, setExpanded] = useState(false);
  const [pending, startTransition] = useTransition();

  const summary = useMemo(() => {
    const preview = items.filter(Boolean).slice(0, 2);
    return preview.length ? preview.join(', ') : 'Ready to charge';
  }, [items]);

  function handleCheckout() {
    startTransition(() => {
      setExpanded(false);
      onConfirm?.({ intent: 'checkout', count: items.length });
    });
  }

  return (
    <button className="ctaButton toneCheckout" disabled={pending} onClick={handleCheckout}>
      <span className="ctaEyebrow">{pending ? 'Preparing invoice…' : 'Checkout flow'}</span>
      <strong className="ctaTitle">Charge {items.length || 1} selected items</strong>
      <span className="ctaMeta">{expanded ? 'Collapse preview' : summary}</span>
      <small className="ctaHint" onClick={() => setExpanded((value) => !value)}>
        {expanded ? 'Hide details' : 'Review details'}
      </small>
    </button>
  );
}
