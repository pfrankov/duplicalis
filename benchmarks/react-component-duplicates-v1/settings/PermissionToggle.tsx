import { useMemo, useState } from 'react';

export function PermissionToggle({ permissions = [] }) {
  const [selected, setSelected] = useState(permissions[0]?.id || 'edit');

  const activePermission = useMemo(() => {
    return permissions.find((permission) => permission.id === selected) || permissions[0];
  }, [permissions, selected]);

  return (
    <section className="toggleShell">
      <h3>Permission access</h3>
      <div className="toggleRail">
        {permissions.map((permission) => (
          <button
            key={permission.id}
            className={permission.id === selected ? 'toggleActive' : 'toggleOption'}
            onClick={() => setSelected(permission.id)}
          >
            {permission.label}
          </button>
        ))}
      </div>
      <p className="toggleSummary">
        {activePermission?.label || 'Unknown'} is {activePermission?.granted ? 'granted' : 'locked'}
        {' '}for this workspace.
      </p>
    </section>
  );
}
