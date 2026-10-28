import Link from 'next/link';
export default function NotFound() {
  return (
    <main className="empty min-h-screen">
      <p className="eyebrow">BOOSTIFY CONTROL · 404</p>
      <h1 className="text-2xl">Esta página no existe.</h1>
      <Link className="button primary" href="/">
        Volver al panel
      </Link>
    </main>
  );
}
