import { useMemo } from 'react';

export function PricingSummaryCard({ plans = [], currency = 'USD' }) {
  const totals = useMemo(() => {
    return plans.reduce(
      (acc, plan) => {
        acc.seats += plan.seats;
        acc.revenue += plan.monthly * plan.seats;
        return acc;
      },
      { seats: 0, revenue: 0 }
    );
  }, [plans]);

  const topPlan = plans.find((plan) => plan.highlighted) || plans[0];

  return (
    <section className="summaryCard">
      <header className="summaryHeader">
        <span className="summaryEyebrow">Revenue snapshot</span>
        <h3 className="summaryTitle">Pricing summary</h3>
      </header>
      <p className="summaryLead">
        {totals.seats} seats produce {currency} {totals.revenue}/mo across the current portfolio.
      </p>
      <dl className="summaryStats">
        <div>
          <dt>Lead plan</dt>
          <dd>{topPlan?.name || 'Starter'}</dd>
        </div>
        <div>
          <dt>Monthly run rate</dt>
          <dd>{currency + ' ' + totals.revenue}</dd>
        </div>
      </dl>
      <button className="summaryAction">Open pricing workspace</button>
    </section>
  );
}
