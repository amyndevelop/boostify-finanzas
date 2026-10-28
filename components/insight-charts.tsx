'use client';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
} from 'recharts';
import { money } from '@/lib/finance';
import type { insights } from '@/lib/insights';
type Data = ReturnType<typeof insights>;
const style = {
  background: '#1c1c2b',
  border: '1px solid #49365e',
  borderRadius: 12,
};
export function MovingChart({ data }: { data: Data['days'] }) {
  return (
    <div
      className="chart"
      role="img"
      aria-label="Ingresos diarios y promedios móviles de siete y treinta días"
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data.map((d) => ({
            ...d,
            income: !d.observed && d.income === 0 ? null : d.income,
          }))}
        >
          <CartesianGrid stroke="#343044" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={(v) =>
              String(v).slice(8) + '/' + String(v).slice(5, 7)
            }
            stroke="#a69ab7"
            minTickGap={35}
            fontSize={10}
          />
          <YAxis
            tickFormatter={(v) =>
              Math.abs(v) >= 100000
                ? `${(v / 100000).toLocaleString('es-AR', { maximumFractionDigits: 1 })}k`
                : String(v / 100)
            }
            stroke="#a69ab7"
            width={45}
            fontSize={10}
          />
          <Tooltip
            contentStyle={style}
            labelFormatter={(v) => String(v).split('-').reverse().join('/')}
            formatter={(v) => money(Number(v))}
          />
          <Line
            name="Ingreso diario"
            dataKey="income"
            stroke="#716080"
            dot={false}
          />
          <Line
            name="Promedio 7 días"
            dataKey="moving7"
            stroke="#ad8afa"
            dot={false}
            strokeWidth={3}
            connectNulls={false}
          />
          <Line
            name="Promedio 30 días"
            dataKey="moving30"
            stroke="#50d5ac"
            dot={false}
            strokeWidth={2}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
export function HoursChart({ data }: { data: Data['hours'] }) {
  return (
    <div
      className="chart small"
      role="img"
      aria-label="Cantidad de cobros por hora argentina"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid stroke="#343044" vertical={false} />
          <XAxis dataKey="label" stroke="#a69ab7" fontSize={9} interval={3} />
          <YAxis
            allowDecimals={false}
            stroke="#a69ab7"
            width={30}
            fontSize={10}
          />
          <Tooltip contentStyle={style} />
          <Bar
            name="Cobros"
            dataKey="count"
            fill="#9c71f2"
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
