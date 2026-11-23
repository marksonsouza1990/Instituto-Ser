import { useState } from 'react';
import { formatBRL } from '../lib/format';

interface LinePoint {
  label: string;
  value: number;
  secondary?: string;
}

export function LineAreaChart({
  data,
  color = '#0E5A75',
  isCurrency = false,
  height = 200,
}: {
  data: LinePoint[];
  color?: string;
  isCurrency?: boolean;
  height?: number;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const width = 520;
  const padL = 48;
  const padR = 16;
  const padT = 18;
  const padB = 28;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;

  if (data.length === 0) {
    return <div className="h-48 flex items-center justify-center text-sm text-slate-400">Sem dados no período.</div>;
  }

  const maxVal = Math.max(...data.map((d) => d.value), 1);
  const niceMax = maxVal * 1.15;

  const coords = data.map((d, i) => {
    const x = padL + (data.length === 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);
    const y = padT + innerH - (d.value / niceMax) * innerH;
    return { x, y, ...d };
  });

  const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x} ${c.y}`).join(' ');
  const areaPath = `${linePath} L ${coords[coords.length - 1].x} ${padT + innerH} L ${coords[0].x} ${padT + innerH} Z`;

  const gridTicks = [0, 0.5, 1].map((t) => {
    const val = niceMax * (1 - t);
    const y = padT + innerH * t;
    const label = isCurrency
      ? val >= 1000
        ? `R$${(val / 1000).toFixed(0)}k`
        : `R$${val.toFixed(0)}`
      : Math.round(val).toString();
    return { y, label };
  });

  const active = hoverIdx !== null ? coords[hoverIdx] : null;

  return (
    <div className="relative w-full">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto overflow-visible">
        <defs>
          <linearGradient id={`grad-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.18" />
            <stop offset="100%" stopColor={color} stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {gridTicks.map((g, i) => (
          <g key={i}>
            <line
              x1={padL}
              y1={g.y}
              x2={width - padR}
              y2={g.y}
              stroke="#E5E1D8"
              strokeDasharray="3 3"
            />
            <text
              x={padL - 8}
              y={g.y + 4}
              textAnchor="end"
              className="fill-slate-400 text-[10px] font-mono tabular-nums"
            >
              {g.label}
            </text>
          </g>
        ))}

        <path d={areaPath} fill={`url(#grad-${color.replace('#', '')})`} />
        <path d={linePath} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" />

        {coords.map((c, i) => (
          <g key={c.label}>
            <text
              x={c.x}
              y={height - 6}
              textAnchor="middle"
              className="fill-slate-500 text-[10px]"
            >
              {c.label}
            </text>
            <circle
              cx={c.x}
              cy={c.y}
              r={hoverIdx === i ? 5 : 3.5}
              fill="#FFFFFF"
              stroke={color}
              strokeWidth="2.2"
            />
            <rect
              x={c.x - 18}
              y={padT}
              width={36}
              height={innerH}
              fill="transparent"
              className="cursor-pointer"
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(null)}
            />
          </g>
        ))}
      </svg>

      {active && (
        <div
          className="pointer-events-none absolute top-2 right-3 bg-[#144A47] text-white text-xs px-2.5 py-1.5 rounded-md shadow-sm tabular-nums"
        >
          <span className="font-medium">{active.label}: </span>
          <span className="font-mono font-semibold">
            {isCurrency ? formatBRL(active.value) : active.value}
          </span>
          {active.secondary && <span className="text-slate-300 ml-1.5">({active.secondary})</span>}
        </div>
      )}
    </div>
  );
}

export function HorizontalBarChart({
  data,
  color = '#0E5A75',
}: {
  data: { label: string; value: number }[];
  color?: string;
}) {
  const maxVal = Math.max(...data.map((d) => d.value), 1);

  if (data.length === 0) {
    return <div className="h-48 flex items-center justify-center text-sm text-slate-400">Sem dados no período.</div>;
  }

  return (
    <div className="space-y-3 pt-1">
      {data.map((item) => {
        const pct = Math.max(4, Math.round((item.value / maxVal) * 100));
        return (
          <div key={item.label} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-700 font-medium truncate pr-2">{item.label}</span>
              <span className="font-mono font-semibold text-slate-900 tabular-nums shrink-0">
                {item.value}
              </span>
            </div>
            <div className="w-full h-2.5 bg-[#EFECE4] rounded-sm overflow-hidden">
              <div
                className="h-full rounded-sm transition-all duration-300"
                style={{ width: `${pct}%`, backgroundColor: color }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function GroupedBarChart({
  data,
  seriesA,
  seriesB,
  isCurrency = false,
  height = 200,
}: {
  data: { label: string; a: number; b: number }[];
  seriesA: { name: string; color: string };
  seriesB: { name: string; color: string };
  isCurrency?: boolean;
  height?: number;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const width = 520;
  const padL = 48;
  const padR = 16;
  const padT = 18;
  const padB = 28;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;

  const maxVal = Math.max(...data.flatMap((d) => [d.a, d.b]), 1) * 1.15;
  const groupW = data.length > 0 ? innerW / data.length : innerW;
  const barW = Math.min(18, Math.max(8, groupW * 0.28));

  const gridTicks = [0, 0.5, 1].map((t) => {
    const val = maxVal * (1 - t);
    const y = padT + innerH * t;
    const label = isCurrency
      ? val >= 1000
        ? `R$${(val / 1000).toFixed(0)}k`
        : `R$${val.toFixed(0)}`
      : Math.round(val).toString();
    return { y, label };
  });

  const active = hoverIdx !== null ? data[hoverIdx] : null;

  return (
    <div className="relative w-full">
      <div className="flex items-center gap-4 mb-2 text-xs text-slate-600">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-xs inline-block" style={{ backgroundColor: seriesA.color }} />
          {seriesA.name}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-xs inline-block" style={{ backgroundColor: seriesB.color }} />
          {seriesB.name}
        </span>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto overflow-visible">
        {gridTicks.map((g, i) => (
          <g key={i}>
            <line
              x1={padL}
              y1={g.y}
              x2={width - padR}
              y2={g.y}
              stroke="#E5E1D8"
              strokeDasharray="3 3"
            />
            <text
              x={padL - 8}
              y={g.y + 4}
              textAnchor="end"
              className="fill-slate-400 text-[10px] font-mono tabular-nums"
            >
              {g.label}
            </text>
          </g>
        ))}

        {data.map((d, i) => {
          const cx = padL + groupW * i + groupW / 2;
          const hA = (d.a / maxVal) * innerH;
          const hB = (d.b / maxVal) * innerH;
          return (
            <g
              key={d.label}
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(null)}
              className="cursor-pointer"
            >
              <rect
                x={cx - barW - 2}
                y={padT + innerH - hA}
                width={barW}
                height={Math.max(2, hA)}
                rx="2"
                fill={seriesA.color}
                opacity={hoverIdx === i ? 1 : 0.88}
              />
              <rect
                x={cx + 2}
                y={padT + innerH - hB}
                width={barW}
                height={Math.max(2, hB)}
                rx="2"
                fill={seriesB.color}
                opacity={hoverIdx === i ? 1 : 0.88}
              />
              <text
                x={cx}
                y={height - 6}
                textAnchor="middle"
                className="fill-slate-500 text-[10px]"
              >
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>

      {active && (
        <div className="pointer-events-none absolute top-0 right-2 bg-[#144A47] text-white text-xs px-2.5 py-1.5 rounded-md shadow-sm tabular-nums">
          <div className="font-medium mb-0.5">{active.label}</div>
          <div className="font-mono">
            {seriesA.name}: {isCurrency ? formatBRL(active.a) : active.a} · {seriesB.name}:{' '}
            {isCurrency ? formatBRL(active.b) : active.b}
          </div>
        </div>
      )}
    </div>
  );
}

const DONUT_COLORS = ['#0E5A75', '#6F873D', '#EBB428', '#BD4B22', '#144A47', '#64748B'];

export function DonutChart({
  data,
}: {
  data: { category: string; amount: number; percentage: number }[];
}) {
  if (data.length === 0) {
    return <div className="h-48 flex items-center justify-center text-sm text-slate-400">Sem despesas no período.</div>;
  }

  const total = data.reduce((s, d) => s + d.amount, 0) || 1;
  const radius = 56;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6 pt-2">
      <div className="relative w-40 h-40 shrink-0">
        <svg viewBox="0 0 160 160" className="w-full h-full -rotate-90">
          {data.slice(0, 6).map((slice, idx) => {
            const frac = slice.amount / total;
            const dash = frac * circumference;
            const currentOffset = offset;
            offset += dash;
            return (
              <circle
                key={slice.category}
                cx="80"
                cy="80"
                r={radius}
                fill="none"
                stroke={DONUT_COLORS[idx % DONUT_COLORS.length]}
                strokeWidth="22"
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-currentOffset}
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[11px] text-slate-500">Total</span>
          <span className="text-xs font-mono font-semibold text-slate-900 tabular-nums">
            {formatBRL(total)}
          </span>
        </div>
      </div>

      <div className="flex-1 w-full space-y-2">
        {data.slice(0, 6).map((slice, idx) => (
          <div key={slice.category} className="flex items-center justify-between text-xs gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="w-2.5 h-2.5 rounded-xs shrink-0"
                style={{ backgroundColor: DONUT_COLORS[idx % DONUT_COLORS.length] }}
              />
              <span className="text-slate-700 truncate">{slice.category}</span>
            </div>
            <div className="font-mono text-slate-900 tabular-nums shrink-0">
              {slice.percentage}% · {formatBRL(slice.amount)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
