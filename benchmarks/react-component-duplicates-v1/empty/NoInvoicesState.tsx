export function NoInvoicesState() {
  return (
    <section className="emptyCard">
      <span className="emptyEyebrow">Billing</span>
      <h3 className="emptyTitle">No invoices yet</h3>
      <p className="emptyBody">
        Connect a pricing plan and create your first invoice bundle for this workspace.
      </p>
      <div className="emptyActions">
        <button className="primaryAction">Create invoice</button>
        <button className="ghostAction">Open pricing docs</button>
      </div>
    </section>
  );
}
