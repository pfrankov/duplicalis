import { useMemo, useState, useTransition } from 'react';

export function BillingButton({ subscriptions = [], onConfirm }) {
  const [expanded, setExpanded] = useState(false);
  const [pending, startTransition] = useTransition();

  const summary = useMemo(() => {
    const preview = subscriptions.filter(Boolean).slice(0, 2);
    return preview.length ? preview.join(', ') : 'Ready to bill';
  }, [subscriptions]);

  function handleBilling() {
    startTransition(() => {
      setExpanded(false);
      onConfirm?.({ intent: 'billing', count: subscriptions.length });
    });
  }

  return (
    <button className="ctaButton toneBilling" disabled={pending} onClick={handleBilling}>
      <span className="ctaEyebrow">{pending ? 'Building invoice…' : 'Billing flow'}</span>
      <strong className="ctaTitle">Bill {subscriptions.length || 1} active subscriptions</strong>
      <span className="ctaMeta">{expanded ? 'Collapse preview' : summary}</span>
      <small className="ctaHint" onClick={() => setExpanded((value) => !value)}>
        {expanded ? 'Hide details' : 'Review details'}
      </small>
    </button>
  );
}
