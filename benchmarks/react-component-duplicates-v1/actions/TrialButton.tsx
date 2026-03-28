import { useMemo, useState, useTransition } from 'react';

export function TrialButton({ accounts = [], onConfirm }) {
  const [expanded, setExpanded] = useState(false);
  const [pending, startTransition] = useTransition();

  const summary = useMemo(() => {
    const preview = accounts.filter(Boolean).slice(0, 2);
    return preview.length ? preview.join(', ') : 'Ready to invite';
  }, [accounts]);

  function handleTrial() {
    startTransition(() => {
      setExpanded(false);
      onConfirm?.({ intent: 'trial', count: accounts.length });
    });
  }

  return (
    <button className="ctaButton toneTrial" disabled={pending} onClick={handleTrial}>
      <span className="ctaEyebrow">{pending ? 'Preparing invite…' : 'Trial flow'}</span>
      <strong className="ctaTitle">Invite {accounts.length || 1} trial accounts</strong>
      <span className="ctaMeta">{expanded ? 'Collapse preview' : summary}</span>
      <small className="ctaHint" onClick={() => setExpanded((value) => !value)}>
        {expanded ? 'Hide details' : 'Review details'}
      </small>
    </button>
  );
}
