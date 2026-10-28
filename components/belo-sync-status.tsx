'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
export function BeloSyncStatus({
  time,
  label,
  tone,
}: {
  time: string | null;
  label: string;
  tone: string;
}) {
  const router = useRouter();
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') router.refresh();
    };
    const timer = setInterval(refresh, 60000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [router]);
  return (
    <section
      className="belo-sync-status"
      aria-label="Estado de revisión del correo Belo"
    >
      <RefreshCw size={17} aria-hidden="true" />
      <div>
        <p>
          Última revisión de correos Belo:{' '}
          <strong>
            {time ? <>{time} · Argentina</> : 'sin registro todavía'}
          </strong>
        </p>
        <p className={tone} role="status">
          {label} · revisión programada cada 5 minutos
        </p>
      </div>
    </section>
  );
}
