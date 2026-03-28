import { useMemo, useState } from 'react';

export function ContributorFilterPanel({ contributors = [] }) {
  const [query, setQuery] = useState('');
  const [coreOnly, setCoreOnly] = useState(false);

  const visibleContributors = useMemo(() => {
    return contributors
      .filter((contributor) => contributor.name.toLowerCase().includes(query.toLowerCase()))
      .filter((contributor) => (coreOnly ? contributor.core : true));
  }, [contributors, query, coreOnly]);

  return (
    <section className="filterPanel">
      <header className="filterHeader">
        <h3>Contributor filter panel</h3>
        <span>{visibleContributors.length} matches</span>
      </header>
      <input
        className="filterInput"
        value={query}
        placeholder="Search contributors"
        onChange={(event) => setQuery(event.target.value)}
      />
      <label className="filterChip">
        <input
          checked={coreOnly}
          type="checkbox"
          onChange={() => setCoreOnly((value) => !value)}
        />
        Core only
      </label>
      <ul className="filterList">
        {visibleContributors.map((contributor) => (
          <li key={contributor.id}>
            <strong>{contributor.name}</strong>
            <span>{contributor.scope}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
