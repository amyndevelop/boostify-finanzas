'use client';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
} from 'recharts';
import { money } from '@/lib/finance';
export function Evolution({
  data,
}: {
  data: { date: string; income: number; expense: number; profit: number }[];
}) {
  const [mode, setMode] = useState<'flow' | 'profit'>('flow');
  return (
    <>
      <div className="flex gap-2 mb-5">
        <button
          className={'chip ' + (mode === 'flow' ? 'active' : '')}
          onClick={() => setMode('flow')}
        >
          Ingresos y gastos
        </button>
        <button
          className={'chip ' + (mode === 'profit' ? 'active' : '')}
          onClick={() => setMode('profit')}
        >
          Ganancia diaria
        </button>
      </div>
      <div
        className="chart"
        role="img"
        aria-label="Gráfico de evolución diaria; importes detallados en el historial"
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="income" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#7C3AED" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#7C3AED" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="#2b2b3e" />
            <XAxis
              dataKey="date"
              tickFormatter={(v) =>
                String(v).slice(8) + '/' + String(v).slice(5, 7)
              }
              stroke="#9494ac"
              fontSize={11}
              minTickGap={35}
            />
            <YAxis
              tickFormatter={(v) =>
                Math.abs(v) >= 100000
                  ? `${Math.round(v / 100000)}k`
                  : String(v / 100)
              }
              stroke="#9494ac"
              fontSize={11}
              width={55}
            />
            <Tooltip
              contentStyle={{
                background: '#1C1C2B',
                border: '1px solid #38384d',
                borderRadius: 12,
              }}
              formatter={(v) => money(Number(v))}
            />
            {mode === 'flow' ? (
              <>
                <Area
                  name="Ingresos"
                  type="monotone"
                  dataKey="income"
                  stroke="#a78bfa"
                  fill="url(#income)"
                  strokeWidth={3}
                />
                <Area
                  name="Gastos"
                  type="monotone"
                  dataKey="expense"
                  stroke="#fb8f9b"
                  fill="transparent"
                  strokeWidth={2}
                />
              </>
            ) : (
              <Area
                name="Ganancia"
                dataKey="profit"
                stroke="#49dbac"
                fill="#49dbac22"
                strokeWidth={3}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}
import { useState } from 'react';
export function MonthlyChart({
  data,
}: {
  data: { month: string; income: number; expense: number }[];
}) {
  return (
    <div
      className="chart small"
      role="img"
      aria-label="Comparación mensual de ingresos y gastos"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid vertical={false} stroke="#2b2b3e" />
          <XAxis dataKey="month" stroke="#9494ac" fontSize={11} />
          <Tooltip
            contentStyle={{
              background: '#1C1C2B',
              border: '1px solid #38384d',
              borderRadius: 12,
            }}
            formatter={(v) => money(Number(v))}
          />
          <Bar
            name="Ingresos"
            dataKey="income"
            fill="#8b5cf6"
            radius={[4, 4, 0, 0]}
          />
          <Bar
            name="Gastos"
            dataKey="expense"
            fill="#fb8f9b"
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
