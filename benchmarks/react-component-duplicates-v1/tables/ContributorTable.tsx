import { useMemo, useState } from 'react';

export function ContributorTable({ contributors = [] }) {
  const [query, setQuery] = useState('');
  const [coreOnly, setCoreOnly] = useState(true);

  const rows = useMemo(() => {
    return contributors
      .filter((contributor) => contributor.name.toLowerCase().includes(query.toLowerCase()))
      .filter((contributor) => (coreOnly ? contributor.core : true))
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [contributors, query, coreOnly]);

  return (
    <section className="tableShell">
      <header className="tableHeader">
        <h3>Contributors</h3>
        <input
          value={query}
          placeholder="Search contributor"
          onChange={(e) => setQuery(e.target.value)}
        />
      </header>
      <label className="tableToggle">
        <input checked={coreOnly} type="checkbox" onChange={() => setCoreOnly((value) => !value)} />
        Core only
      </label>
      <table className="tableGrid">
        <tbody>
          {rows.map((contributor) => (
            <tr key={contributor.id}>
              <td>{contributor.name}</td>
              <td>{contributor.scope}</td>
              <td>{contributor.timezone}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
