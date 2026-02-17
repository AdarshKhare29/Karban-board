type AuthPageProps = {
  authMode: 'login' | 'register';
  authName: string;
  authEmail: string;
  authPassword: string;
  error: string | null;
  onAuthNameChange: (value: string) => void;
  onAuthEmailChange: (value: string) => void;
  onAuthPasswordChange: (value: string) => void;
  onSubmit: () => void;
  onToggleMode: () => void;
};

export function AuthPage(props: AuthPageProps) {
  const {
    authMode,
    authName,
    authEmail,
    authPassword,
    error,
    onAuthNameChange,
    onAuthEmailChange,
    onAuthPasswordChange,
    onSubmit,
    onToggleMode
  } = props;

  return (
    <main className="auth-page">
      <section className="auth-shell">
        <div className="auth-brand">
          <p className="auth-badge">Realtime Workspace</p>
          <h1>Collaborative Kanban</h1>
          <p className="auth-copy">Ship faster with shared boards, live task updates, comments, and activity history in one place.</p>
          <div className="auth-points">
            <span>Live board sync</span>
            <span>Role-based access</span>
            <span>Activity timeline</span>
          </div>
        </div>

        <div className="auth-card">
          <h2>{authMode === 'login' ? 'Welcome Back' : 'Create Account'}</h2>
          <p>{authMode === 'login' ? 'Sign in to continue' : 'Set up your account to get started'}</p>

          <div className={authMode === 'register' ? 'auth-name-field' : 'auth-name-field hidden'}>
            <input value={authName} onChange={(event) => onAuthNameChange(event.target.value)} placeholder="Full name" />
          </div>

          <input value={authEmail} onChange={(event) => onAuthEmailChange(event.target.value)} placeholder="Email address" type="email" />

          <input
            value={authPassword}
            onChange={(event) => onAuthPasswordChange(event.target.value)}
            placeholder="Password"
            type="password"
          />

          <button onClick={onSubmit}>{authMode === 'login' ? 'Login' : 'Register'}</button>

          <button className="link-button" onClick={onToggleMode}>
            {authMode === 'login' ? 'Need an account? Register' : 'Already have an account? Login'}
          </button>

          {error ? <p className="error">{error}</p> : null}
        </div>
      </section>
    </main>
  );
}
