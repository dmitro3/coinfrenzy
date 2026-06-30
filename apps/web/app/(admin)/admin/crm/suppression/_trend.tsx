'use client'

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

interface Props {
  trend: Array<{ day: string; count: number }>
}

export function SuppressionTrend({ trend }: Props) {
  if (trend.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-md border border-dashed border-line-subtle bg-surface text-sm text-ink-tertiary">
        No suppression activity in the last 30 days.
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={180}>
      <AreaChart data={trend} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid stroke="hsl(var(--line-subtle))" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="day"
          tick={{ fill: 'hsl(var(--ink-tertiary))', fontSize: 11 }}
          tickFormatter={(d) => String(d).slice(5)}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: 'hsl(var(--ink-tertiary))', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={28}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(var(--surface))',
            border: '1px solid hsl(var(--line-subtle))',
            borderRadius: 8,
            fontSize: 12,
          }}
          labelStyle={{ color: 'hsl(var(--ink-secondary))' }}
        />
        <Area
          type="monotone"
          dataKey="count"
          stroke="hsl(var(--amber-400, 38 92% 50%))"
          fill="hsl(var(--amber-400, 38 92% 50%))"
          fillOpacity={0.15}
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
