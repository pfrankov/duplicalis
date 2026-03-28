import { useMemo, useState } from 'react';

export function FeatureFlagToggle({ flags = [] }) {
  const [selected, setSelected] = useState(flags[0]?.id || 'beta-dashboard');

  const activeFlag = useMemo(() => {
    return flags.find((flag) => flag.id === selected) || flags[0];
  }, [flags, selected]);

  return (
    <section className="toggleShell">
      <h3>Feature flag access</h3>
      <div className="toggleRail">
        {flags.map((flag) => (
          <button
            key={flag.id}
            className={flag.id === selected ? 'toggleActive' : 'toggleOption'}
            onClick={() => setSelected(flag.id)}
          >
            {flag.label}
          </button>
        ))}
      </div>
      <p className="toggleSummary">
        {activeFlag?.label || 'Unknown'} is {activeFlag?.enabled ? 'enabled' : 'disabled'} for
        this workspace.
      </p>
    </section>
  );
}
