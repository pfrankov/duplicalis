import { useState } from 'react';

export function TabSwitcher({ tabs = [] }) {
  const [selected, setSelected] = useState(tabs[0]?.id || 'overview');
  const activeTab = tabs.find((tab) => tab.id === selected) || tabs[0];

  return (
    <section className="tabShell">
      <nav className="tabRail">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={tab.id === selected ? 'tabActive' : 'tabOption'}
            onClick={() => setSelected(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      <article className="tabPanel">
        <h3>{activeTab?.label}</h3>
        <p>{activeTab?.body || 'Pick a tab to continue.'}</p>
      </article>
    </section>
  );
}
