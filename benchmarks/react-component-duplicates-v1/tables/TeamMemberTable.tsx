import { useMemo, useState } from 'react';

export function TeamMemberTable({ members = [] }) {
  const [query, setQuery] = useState('');
  const [activeOnly, setActiveOnly] = useState(true);

  const rows = useMemo(() => {
    return members
      .filter((member) => member.name.toLowerCase().includes(query.toLowerCase()))
      .filter((member) => (activeOnly ? member.active : true))
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [members, query, activeOnly]);

  return (
    <section className="tableShell">
      <header className="tableHeader">
        <h3>Team members</h3>
        <input value={query} placeholder="Search member" onChange={(e) => setQuery(e.target.value)} />
      </header>
      <label className="tableToggle">
        <input
          checked={activeOnly}
          type="checkbox"
          onChange={() => setActiveOnly((value) => !value)}
        />
        Active only
      </label>
      <table className="tableGrid">
        <tbody>
          {rows.map((member) => (
            <tr key={member.id}>
              <td>{member.name}</td>
              <td>{member.role}</td>
              <td>{member.location}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
