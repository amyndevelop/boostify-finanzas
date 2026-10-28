import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { logout } from '@/app/actions';
import {
  LayoutDashboard,
  ArrowLeftRight,
  ChartNoAxesCombined,
  LogOut,
  ShieldCheck,
  Zap,
} from 'lucide-react';
export const dynamic = 'force-dynamic';
export default async function PrivateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();
  return (
    <div className="app-shell">
      <Link className="skip-link" href="#main">
        Saltar al contenido
      </Link>
      <aside className="sidebar">
        <Link className="brand" href="/">
          <span className="brand-symbol">
            <Zap size={22} fill="currentColor" />
          </span>
          <span>
            BOOSTIFY<small>CONTROL</small>
          </span>
        </Link>
        <p className="nav-label">WORKSPACE</p>
        <nav aria-label="Navegación principal">
          <Link href="/#overview">
            <LayoutDashboard size={18} />
            <span>Vista general</span>
          </Link>
          <Link href="/#movements">
            <ArrowLeftRight size={18} />
            <span>Movimientos</span>
          </Link>
          <Link href="/#statistics">
            <ChartNoAxesCombined size={18} />
            <span>Estadísticas</span>
          </Link>
        </nav>
        <div className="sidebar-bottom">
          <div className="private-note">
            <ShieldCheck size={18} />
            <span>
              Espacio privado
              <br />
              <small>Solo vos y tus números.</small>
            </span>
          </div>
          <form action={logout}>
            <button className="logout">
              <LogOut size={17} />
              <span>Cerrar sesión</span>
            </button>
          </form>
        </div>
      </aside>
      <div className="main-wrap">
        <header className="topbar">
          <span className="muted text-sm">Tu negocio, en perspectiva.</span>
          <span className="admin">
            <i /> Administrador <span className="avatar">B</span>
          </span>
        </header>
        <main id="main">{children}</main>
        <footer>
          BOOSTIFY CONTROL <span>Hecho para crecer con claridad.</span>
        </footer>
      </div>
    </div>
  );
}
