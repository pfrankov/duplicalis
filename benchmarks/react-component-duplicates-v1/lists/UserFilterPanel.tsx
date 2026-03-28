import { useMemo, useState } from 'react';

export function UserFilterPanel({ users = [] }) {
  const [query, setQuery] = useState('');
  const [activeOnly, setActiveOnly] = useState(false);

  const visibleUsers = useMemo(() => {
    return users
      .filter((user) => user.name.toLowerCase().includes(query.toLowerCase()))
      .filter((user) => (activeOnly ? user.active : true));
  }, [users, query, activeOnly]);

  return (
    <section className="filterPanel">
      <header className="filterHeader">
        <h3>User filter panel</h3>
        <span>{visibleUsers.length} matches</span>
      </header>
      <input
        className="filterInput"
        value={query}
        placeholder="Search users"
        onChange={(event) => setQuery(event.target.value)}
      />
      <label className="filterChip">
        <input
          checked={activeOnly}
          type="checkbox"
          onChange={() => setActiveOnly((value) => !value)}
        />
        Active only
      </label>
      <ul className="filterList">
        {visibleUsers.map((user) => (
          <li key={user.id}>
            <strong>{user.name}</strong>
            <span>{user.role}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
