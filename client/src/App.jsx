/** Phase 0 placeholder. Real routes arrive in Phase 2. */
export default function App() {
  return (
    <main
      className="d-flex flex-column align-items-center justify-content-center text-center p-4"
      style={{ minHeight: '100dvh' }}
    >
      <img src="/logo.svg" alt="" width="120" height="120" />
      <h1 className="mt-3">Fast Four</h1>
      <p style={{ color: 'var(--ff-muted)' }}>Name, place, animal, thing.</p>
    </main>
  );
}
