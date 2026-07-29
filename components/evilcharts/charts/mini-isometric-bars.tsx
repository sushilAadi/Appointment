"use client";

import * as React from "react";
import { Bar, BarChart, YAxis } from "recharts";

// A compact, chrome-free cousin of IsometricBarChart (components/evilcharts/
// charts/isometric-bar-chart.tsx) — same 3D bevelled-bar look, but sized to
// drop straight into a KPI card's small trend slot (replacing the old plain
// flat-bar Sparkline). No axis labels, tooltip, or total/peak header: at
// ~70x30px there isn't room for any of that, and the KPI card already shows
// its own value/delta next to it.

export interface MiniIsoBarsProps {
  values: number[];
  width?: number;
  height?: number;
}

const DX = 3;
const DY = 3;
const HIGHLIGHT_COLOR = "#22c55e";
const HIGHLIGHT_COLOR_DARK = "#15803d";

interface ShapeProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: { value: number };
}

function MiniIsoBar({ x, y, width, height, payload, maxValue, idPrefix }: ShapeProps & { maxValue: number; idPrefix: string }) {
  const bx = Number(x ?? 0);
  const by = Number(y ?? 0);
  const bw = Number(width ?? 0);
  const bh = Number(height ?? 0);
  if (bh <= 0) return null;

  const highlight = payload?.value === maxValue && maxValue > 0;
  const sideX = bx + bw;
  const topPoints = `${bx},${by} ${bx + bw},${by} ${bx + bw + DX},${by - DY} ${bx + DX},${by - DY}`;
  const sidePoints = `${sideX},${by} ${sideX + DX},${by - DY} ${sideX + DX},${by + bh - DY} ${sideX},${by + bh}`;

  const url = (name: string) => `url(#${idPrefix}-${name})`;
  const frontFill = highlight ? url("mini-front-accent") : url("mini-front-base");
  const topFill = highlight ? url("mini-top-accent") : url("mini-top-base");
  const rightFill = highlight ? url("mini-right-accent") : url("mini-right-base");

  return (
    <g>
      <polygon points={sidePoints} fill={rightFill} />
      <polygon points={topPoints} fill={topFill} />
      <rect x={bx} y={by} width={bw} height={bh} fill={frontFill} />
    </g>
  );
}

export default function MiniIsoBars({ values, width = 72, height = 30 }: MiniIsoBarsProps) {
  const idPrefix = React.useId().replace(/:/g, "");
  const data = values.map((value) => ({ value }));
  const maxValue = Math.max(0, ...values);

  return (
    <BarChart width={width} height={height} data={data} margin={{ top: 3, right: 2, left: 2, bottom: 0 }} barCategoryGap="30%">
      <defs>
        <linearGradient id={`${idPrefix}-mini-front-base`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={1} />
          <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0.8} />
        </linearGradient>
        <linearGradient id={`${idPrefix}-mini-top-base`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.55} />
          <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0.5} />
        </linearGradient>
        <linearGradient id={`${idPrefix}-mini-right-base`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.4} />
          <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0.3} />
        </linearGradient>
        <linearGradient id={`${idPrefix}-mini-front-accent`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={HIGHLIGHT_COLOR} stopOpacity={1} />
          <stop offset="100%" stopColor={HIGHLIGHT_COLOR_DARK} stopOpacity={0.95} />
        </linearGradient>
        <linearGradient id={`${idPrefix}-mini-top-accent`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={HIGHLIGHT_COLOR} stopOpacity={0.7} />
          <stop offset="100%" stopColor={HIGHLIGHT_COLOR} stopOpacity={0.55} />
        </linearGradient>
        <linearGradient id={`${idPrefix}-mini-right-accent`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={HIGHLIGHT_COLOR_DARK} stopOpacity={0.55} />
          <stop offset="100%" stopColor={HIGHLIGHT_COLOR_DARK} stopOpacity={0.4} />
        </linearGradient>
      </defs>
      <YAxis hide domain={[0, "dataMax + 1"]} />
      <Bar
        dataKey="value"
        isAnimationActive={false}
        shape={(props: unknown) => (
          <MiniIsoBar {...(props as ShapeProps)} maxValue={maxValue} idPrefix={idPrefix} />
        )}
      />
    </BarChart>
  );
}
