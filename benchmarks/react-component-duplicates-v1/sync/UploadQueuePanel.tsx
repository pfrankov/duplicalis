import { useMemo, useState } from 'react';

export function UploadQueuePanel({ uploads = [] }) {
  const [mode, setMode] = useState('active');

  const visibleUploads = useMemo(() => {
    return uploads
      .filter((upload) => (mode === 'all' ? true : upload.state === mode))
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt));
  }, [uploads, mode]);

  return (
    <section className="syncPanel">
      <header className="syncHeader">
        <div>
          <span className="syncEyebrow">Upload queue</span>
          <h3>Asset upload panel</h3>
        </div>
        <div className="syncTabs">
          {['active', 'paused', 'all'].map((value) => (
            <button key={value} className={mode === value ? 'tabActive' : 'tabOption'} onClick={() => setMode(value)}>
              {value}
            </button>
          ))}
        </div>
      </header>
      <ul className="syncList">
        {visibleUploads.map((upload) => (
          <li key={upload.id}>
            <strong>{upload.fileName}</strong>
            <span>{upload.state}</span>
            <small>{upload.startedAt}</small>
          </li>
        ))}
      </ul>
      <footer className="syncFooter">
        <span>{visibleUploads.length} uploads shown</span>
        <button className="primaryAction">Resume queue</button>
      </footer>
    </section>
  );
}
