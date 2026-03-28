import { useMemo } from 'react';

export function PlanOverviewCard({ plans = [], currency = 'USD' }) {
  const totals = useMemo(() => {
    return plans.reduce(
      (acc, plan) => {
        acc.seats += plan.members;
        acc.revenue += plan.monthly * plan.members;
        return acc;
      },
      { seats: 0, revenue: 0 }
    );
  }, [plans]);

  const featuredPlan = plans.find((plan) => plan.recommended) || plans[0];

  return (
    <section className="summaryCard">
      <header className="summaryHeader">
        <span className="summaryEyebrow">Portfolio snapshot</span>
        <h3 className="summaryTitle">Plan overview</h3>
      </header>
      <p className="summaryLead">
        {totals.seats} members account for {currency} {totals.revenue}/mo across live plans.
      </p>
      <dl className="summaryStats">
        <div>
          <dt>Featured plan</dt>
          <dd>{featuredPlan?.name || 'Growth'}</dd>
        </div>
        <div>
          <dt>Monthly run rate</dt>
          <dd>{currency + ' ' + totals.revenue}</dd>
        </div>
      </dl>
      <button className="summaryAction">Open plan workspace</button>
    </section>
  );
}
