'use client';
import { useActionState } from 'react';
import { login } from '@/app/actions';
import { Button } from '@/components/ui/button';
export function LoginForm() {
  const [state, action, pending] = useActionState(login, {});
  return (
    <form action={action} className="flex flex-col gap-5">
      <label>
        Correo electrónico
        <input
          type="email"
          name="email"
          autoComplete="username"
          required
          placeholder="tu@boostify.com"
        />
      </label>
      <label>
        Contraseña
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          required
          maxLength={200}
          placeholder="Tu contraseña"
        />
      </label>
      {state.error && (
        <p className="error" role="alert">
          {state.error}
        </p>
      )}
      <Button className="primary" disabled={pending}>
        {pending ? 'Ingresando…' : 'Entrar a BOOSTIFY →'}
      </Button>
    </form>
  );
}
