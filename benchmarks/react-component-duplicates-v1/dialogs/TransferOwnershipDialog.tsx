import { useState } from 'react';

export function TransferOwnershipDialog({ candidates = [], onTransfer }) {
  const [selected, setSelected] = useState(candidates[0]?.id || '');
  const [confirmed, setConfirmed] = useState(false);

  return (
    <section className="dialogCard">
      <header className="dialogHeader">
        <span className="dialogEyebrow">Workspace settings</span>
        <h3 className="dialogTitle">Transfer ownership</h3>
      </header>
      <p className="dialogBody">
        Choose a new owner before removing your access. Billing and security approvals will follow
        the selected person immediately.
      </p>
      <label className="dialogField">
        New owner
        <select value={selected} onChange={(event) => setSelected(event.target.value)}>
          {candidates.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.name}
            </option>
          ))}
        </select>
      </label>
      <label className="dialogField">
        <input checked={confirmed} type="checkbox" onChange={() => setConfirmed((value) => !value)} />
        I understand that all billing and security responsibilities move immediately.
      </label>
      <footer className="dialogActions">
        <button className="ghostAction">Cancel</button>
        <button disabled={!selected || !confirmed} className="primaryAction" onClick={() => onTransfer?.(selected)}>
          Transfer ownership
        </button>
      </footer>
    </section>
  );
}
