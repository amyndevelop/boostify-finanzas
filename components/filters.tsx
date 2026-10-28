'use client';
import Link from 'next/link';
import { useState } from 'react';
import { categories } from '@/lib/finance';
import { Params } from '@/lib/query';
import { Button } from './ui/button';
export function Filters({ params }: { params: Params }) {
  const [period, setPeriod] = useState(params.period ?? 'month');
  return (
    <form className="filters">
      <label>
        <span className="sr-only">Período</span>
        <select
          name="period"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
        >
          <option value="today">Hoy</option>
          <option value="week">Últimos 7 días</option>
          <option value="month">Mes actual</option>
          <option value="previous">Mes anterior</option>
          <option value="custom">Rango personalizado</option>
        </select>
      </label>
      {period === 'custom' && (
        <>
          <label>
            Desde
            <input
              type="date"
              name="start"
              required
              defaultValue={params.start}
            />
          </label>
          <label>
            Hasta
            <input type="date" name="end" required defaultValue={params.end} />
          </label>
        </>
      )}
      <label>
        <span className="sr-only">Tipo</span>
        <select name="type" defaultValue={params.type ?? ''}>
          <option value="">Todos los tipos</option>
          <option value="INCOME">Ingresos</option>
          <option value="EXPENSE">Gastos</option>
        </select>
      </label>
      <label>
        <span className="sr-only">Categoría</span>
        <select name="category" defaultValue={params.category ?? ''}>
          <option value="">Todas las categorías</option>
          {[...new Set(Object.values(categories).flat())].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      <Button type="submit">Aplicar filtros</Button>
      <Link href="/" className="muted text-sm">
        Limpiar
      </Link>
    </form>
  );
}
