import { formatDateTime } from '../lib/api';
import type { AdminUser } from '../types';

type AdminUsersPanelProps = {
  users: AdminUser[];
  loading: boolean;
};

export function AdminUsersPanel(props: AdminUsersPanelProps) {
  const { users, loading } = props;

  return (
    <main className="main">
      <div className="board-header">
        <div>
          <h2>Registered Users</h2>
          <p className="board-role">Admin-only view</p>
        </div>
      </div>

      <section className="admin-users-panel">
        {loading ? <p>Loading users...</p> : null}
        {!loading && users.length === 0 ? <p>No users found.</p> : null}
        {!loading ? (
          <div className="admin-users-table-wrap">
            <table className="admin-users-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>{user.id}</td>
                    <td>{user.name}</td>
                    <td>{user.email}</td>
                    <td>{user.is_admin ? 'admin' : 'user'}</td>
                    <td>{formatDateTime(user.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </main>
  );
}
