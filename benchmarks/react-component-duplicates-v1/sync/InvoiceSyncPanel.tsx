import { useEffect, useMemo, useState } from 'react';

export function InvoiceSyncPanel({ jobs = [] }) {
  const [showStalledOnly, setShowStalledOnly] = useState(false);

  const visibleJobs = useMemo(() => {
    const base = showStalledOnly ? jobs.filter((job) => job.status === 'stalled') : jobs;
    return [...base].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }, [jobs, showStalledOnly]);

  const stalledCount = visibleJobs.filter((job) => job.status === 'stalled').length;

  useEffect(() => {
    if (stalledCount > 0) console.warn('invoice sync stalled', stalledCount);
  }, [stalledCount]);

  return (
    <section className="syncPanel">
      <header className="syncHeader">
        <div>
          <span className="syncEyebrow">Billing sync</span>
          <h3>Invoice sync panel</h3>
        </div>
        <label className="syncToggle">
          <input
            checked={showStalledOnly}
            type="checkbox"
            onChange={() => setShowStalledOnly((value) => !value)}
          />
          Stalled only
        </label>
      </header>
      <ul className="syncList">
        {visibleJobs.map((job) => (
          <li key={job.id}>
            <strong>{job.name}</strong>
            <span>{job.status}</span>
            <small>{job.updatedAt}</small>
          </li>
        ))}
      </ul>
      <footer className="syncFooter">
        <span>{stalledCount} stalled runs</span>
        <button className="primaryAction">Retry invoice sync</button>
      </footer>
    </section>
  );
}
