export default function Loading() {
  return (
    <div role="status" aria-live="polite">
      <p className="eyebrow mb-6">CARGANDO TUS NÚMEROS…</p>
      <div className="metrics">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="card h-36 animate-pulse" />
        ))}
      </div>
      <div className="card h-80 animate-pulse" />
    </div>
  );
}
