import Link from 'next/link';
import { Sparkles, ArrowUpRight } from 'lucide-react';
import type { Finding } from '@/lib/findings';
export function Findings({ items }: { items: Finding[] }) {
  return (
    <section
      id="statistics"
      className="card findings-card"
      aria-label="Resumen de hallazgos"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">UNA LECTURA DE TUS DATOS</p>
          <h2 className="flex items-center gap-2">
            <Sparkles size={20} /> Lo que muestran tus números
          </h2>
        </div>
        <Link href="/reports/monthly" className="button">
          Informe mensual <ArrowUpRight size={15} />
        </Link>
      </div>
      <div className="findings-list">
        {items.length ? (
          items.map((item) => (
            <article key={item.id} className={'finding finding-' + item.tone}>
              <h3>{item.title}</h3>
              <p>{item.detail}</p>
              <Link href={item.href}>Ver detalle →</Link>
            </article>
          ))
        ) : (
          <p className="muted">
            Todavía no hay una base suficiente para destacar hallazgos. Elegí
            otro período o reuní más días completos.
          </p>
        )}
      </div>
      <p className="muted text-xs mt-5">
        Hallazgos generados con reglas y cálculos verificables. No predicen
        resultados ni atribuyen causas comerciales. Se actualizan con los datos
        del panel.
      </p>
    </section>
  );
}
