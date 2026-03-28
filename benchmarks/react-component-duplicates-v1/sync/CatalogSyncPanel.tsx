import { useEffect, useMemo, useState } from 'react';

export function CatalogSyncPanel({ jobs = [] }) {
  const [showBlockedOnly, setShowBlockedOnly] = useState(false);

  const visibleJobs = useMemo(() => {
    const base = showBlockedOnly ? jobs.filter((job) => job.status === 'blocked') : jobs;
    return [...base].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }, [jobs, showBlockedOnly]);

  const blockedCount = visibleJobs.filter((job) => job.status === 'blocked').length;

  useEffect(() => {
    if (blockedCount > 0) console.warn('catalog sync blocked', blockedCount);
  }, [blockedCount]);

  return (
    <section className="syncPanel">
      <header className="syncHeader">
        <div>
          <span className="syncEyebrow">Catalog sync</span>
          <h3>Catalog sync panel</h3>
        </div>
        <label className="syncToggle">
          <input
            checked={showBlockedOnly}
            type="checkbox"
            onChange={() => setShowBlockedOnly((value) => !value)}
          />
          Blocked only
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
        <span>{blockedCount} blocked runs</span>
        <button className="primaryAction">Retry catalog sync</button>
      </footer>
    </section>
  );
}
