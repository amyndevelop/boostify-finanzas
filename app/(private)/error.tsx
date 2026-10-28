'use client';
import { Button } from '@/components/ui/button';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section className="card empty">
      <h1 className="text-2xl font-semibold">Tus números están a salvo.</h1>
      <p>
        No pudimos consultar los movimientos. Verificá la conexión a PostgreSQL
        y las migraciones del servidor.
      </p>
      <Button className="primary" onClick={reset}>
        Volver a intentar
      </Button>
    </section>
  );
}
