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
      <section className="auth-card">
        <h1>Collaborative Kanban</h1>
        <p>{authMode === 'login' ? 'Sign in to continue' : 'Create your account'}</p>

        {authMode === 'register' ? (
          <input value={authName} onChange={(event) => onAuthNameChange(event.target.value)} placeholder="Name" />
        ) : null}

        <input value={authEmail} onChange={(event) => onAuthEmailChange(event.target.value)} placeholder="Email" type="email" />

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
      </section>
    </main>
  );
}
