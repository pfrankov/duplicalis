import { useMemo } from 'react';

export function DeleteWorkspaceDialog({ workspaceName = 'Northwind', admins = [], onDelete }) {
  const blockers = useMemo(() => {
    return admins.filter((admin) => admin.role === 'owner' && !admin.approvedDelete);
  }, [admins]);

  const deleteDisabled = blockers.length > 0;

  return (
    <section className="dialogCard">
      <header className="dialogHeader">
        <span className="dialogEyebrow">Workspace settings</span>
        <h3 className="dialogTitle">Delete workspace</h3>
      </header>
      <p className="dialogBody">
        Deleting <strong>{workspaceName}</strong> removes boards, automation history, and connected
        environments for everyone in the tenant.
      </p>
      <ul className="dialogChecklist">
        <li>Invoices and exports stay readable for auditors.</li>
        <li>Scheduled jobs stop after the final deletion snapshot.</li>
        <li>Owners can download one last backup before removal.</li>
      </ul>
      <div className="dialogBlockers">
        {blockers.length ? (
          blockers.map((admin) => (
            <p key={admin.id}>
              Waiting for delete approval from <strong>{admin.name}</strong>.
            </p>
          ))
        ) : (
          <p>No deletion blockers remain.</p>
        )}
      </div>
      <footer className="dialogActions">
        <button className="ghostAction">Keep workspace</button>
        <button disabled={deleteDisabled} className="dangerAction" onClick={() => onDelete?.()}>
          Delete workspace
        </button>
      </footer>
    </section>
  );
}
