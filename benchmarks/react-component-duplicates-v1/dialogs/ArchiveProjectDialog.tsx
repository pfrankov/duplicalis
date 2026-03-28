import { useMemo } from 'react';

export function ArchiveProjectDialog({ projectName = 'Apollo', members = [], onArchive }) {
  const blockers = useMemo(() => {
    return members.filter((member) => member.role === 'owner' && !member.approvedArchive);
  }, [members]);

  const archiveDisabled = blockers.length > 0;

  return (
    <section className="dialogCard">
      <header className="dialogHeader">
        <span className="dialogEyebrow">Project settings</span>
        <h3 className="dialogTitle">Archive project</h3>
      </header>
      <p className="dialogBody">
        Archiving <strong>{projectName}</strong> hides boards, schedules, and task entry points for
        the rest of the workspace.
      </p>
      <ul className="dialogChecklist">
        <li>Existing reports stay readable for auditors.</li>
        <li>Automations stop after the final archive snapshot.</li>
        <li>Owners can still restore the project later.</li>
      </ul>
      <div className="dialogBlockers">
        {blockers.length ? (
          blockers.map((member) => (
            <p key={member.id}>
              Waiting for archive approval from <strong>{member.name}</strong>.
            </p>
          ))
        ) : (
          <p>No archive blockers remain.</p>
        )}
      </div>
      <footer className="dialogActions">
        <button className="ghostAction">Keep active</button>
        <button disabled={archiveDisabled} className="dangerAction" onClick={() => onArchive?.()}>
          Archive project
        </button>
      </footer>
    </section>
  );
}
