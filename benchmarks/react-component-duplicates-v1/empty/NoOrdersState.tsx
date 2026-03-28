export function NoOrdersState() {
  return (
    <section className="emptyCard">
      <span className="emptyEyebrow">Commerce</span>
      <h3 className="emptyTitle">No orders yet</h3>
      <p className="emptyBody">
        Connect your catalog and create the first order flow for this workspace.
      </p>
      <div className="emptyActions">
        <button className="primaryAction">Create order</button>
        <button className="ghostAction">Open catalog docs</button>
      </div>
    </section>
  );
}
