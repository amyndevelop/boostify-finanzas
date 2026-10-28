'use client';
import { useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { money } from '@/lib/finance';
import type { deepStatistics } from '@/lib/deep-statistics';
export function PeriodOverlay({
  data,
}: {
  data: ReturnType<typeof deepStatistics>['overlay'];
}) {
  const [mode, setMode] = useState<'total' | 'daily'>(() =>
    data.some(
      (p) =>
        (p.dailyA !== null && p.totalA === null) ||
        (p.dailyB !== null && p.totalB === null),
    )
      ? 'daily'
      : 'total',
  );
  return (
    <>
      <div className="flex gap-3 mb-5">
        <button
          className={'chip ' + (mode === 'total' ? 'active' : '')}
          onClick={() => setMode('total')}
        >
          Acumulado
        </button>
        <button
          className={'chip ' + (mode === 'daily' ? 'active' : '')}
          onClick={() => setMode('daily')}
        >
          Día a día
        </button>
      </div>
      <div
        className="chart"
        role="img"
        aria-label="Comparación de ingresos entre períodos A y B por número de día"
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid stroke="#343044" vertical={false} />
            <XAxis
              dataKey="index"
              stroke="#a69ab7"
              fontSize={10}
              minTickGap={20}
              tickFormatter={(v) => `Día ${v}`}
            />
            <YAxis
              stroke="#a69ab7"
              width={50}
              fontSize={10}
              tickFormatter={(v) =>
                Math.abs(v) >= 100000
                  ? `${Math.round(v / 100000)}k`
                  : String(v / 100)
              }
            />
            <Tooltip
              contentStyle={{
                background: '#1c1c2b',
                border: '1px solid #49365e',
                borderRadius: 12,
              }}
              formatter={(v) => money(Number(v))}
              labelFormatter={(label, payload) => {
                const point = payload?.[0]?.payload;
                const fmt = (v: string | null) =>
                  v ? v.split('-').reverse().join('/') : 'sin día equivalente';
                return `Día ${label} · A: ${fmt(point?.dateA)} · B: ${fmt(point?.dateB)}`;
              }}
            />
            <Line
              name="Período A"
              dataKey={mode === 'total' ? 'totalA' : 'dailyA'}
              stroke="#b18bff"
              strokeWidth={3}
              dot={false}
              connectNulls={false}
            />
            <Line
              name="Período B"
              dataKey={mode === 'total' ? 'totalB' : 'dailyB'}
              stroke="#4fd5ac"
              strokeWidth={2}
              dot={false}
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="flex gap-5 text-xs mt-4">
        <span className="purple">● Período A</span>
        <span className="green">● Período B</span>
      </div>
    </>
  );
}
