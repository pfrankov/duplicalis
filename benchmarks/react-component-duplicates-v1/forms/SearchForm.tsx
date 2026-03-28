import { useState } from 'react';

export function SearchForm({ onSubmit }) {
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState('all');

  function handleSubmit(event) {
    event.preventDefault();
    onSubmit?.({ query, scope });
  }

  return (
    <form className="searchForm" onSubmit={handleSubmit}>
      <label className="searchField">
        Search
        <input value={query} placeholder="Search records" onChange={(e) => setQuery(e.target.value)} />
      </label>
      <div className="searchChips">
        {['all', 'people', 'billing'].map((value) => (
          <button
            key={value}
            className={scope === value ? 'chipActive' : 'chipOption'}
            type="button"
            onClick={() => setScope(value)}
          >
            {value}
          </button>
        ))}
      </div>
      <button className="submitAction" type="submit">
        Run search
      </button>
    </form>
  );
}
