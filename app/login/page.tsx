import { session } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { LoginForm } from './form';
export default async function Login() {
  if (await session()) redirect('/');
  return (
    <main className="login-shell">
      <div className="login-art">
        <div className="brand">
          <span className="brand-symbol">B</span> BOOSTIFY
          <span className="muted font-normal">/ CONTROL</span>
        </div>
        <div>
          <p className="eyebrow">TU NEGOCIO. TUS NÚMEROS.</p>
          <h1>
            Claridad para
            <br />
            el próximo <span>nivel.</span>
          </h1>
          <p className="muted mt-6 max-w-sm">
            Cada ingreso, cada inversión y cada decisión. Todo bajo tu control.
          </p>
        </div>
        <p className="muted text-sm">
          Un espacio privado para hacer crecer BOOSTIFY.
        </p>
      </div>
      <section className="login-panel">
        <div className="w-full max-w-sm">
          <p className="eyebrow">ACCESO PRIVADO</p>
          <h2 className="text-3xl font-semibold mt-3 mb-3">
            Bienvenido de nuevo.
          </h2>
          <p className="muted mb-8">Entrá a tu centro de control financiero.</p>
          <LoginForm />
          <p className="muted text-xs mt-8">
            Solo para el administrador de BOOSTIFY. No hay registro público.
          </p>
        </div>
      </section>
    </main>
  );
}
