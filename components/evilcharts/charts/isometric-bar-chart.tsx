"use client";

import * as React from "react";
import { Bar, BarChart, XAxis, YAxis } from "recharts";
import { motion } from "motion/react";
import { type ChartConfig, ChartContainer } from "@/components/evilcharts/ui/recharts-chart";
import { ChartTooltip, ChartTooltipContent } from "@/components/evilcharts/ui/recharts-tooltip";

// Generalized version of the evilcharts "isometric bar chart" example — the
// original hardcoded a 7-month revenue dataset with "$"/"K" formatting. This
// version takes plain { label, value } data plus display strings for the
// corner callouts, so the same isometric-bar visual can be reused for any
// count-based series (appointments per day, per month, visits per patient,
// ...) without copy-pasting the whole chart three times.

export interface IsoBarDatum {
  label: string; // x-axis category (day label, month label, patient name, ...)
  value: number;
}

export interface IsometricBarChartProps {
  data: IsoBarDatum[];
  /** Single-series color key, e.g. "count" — must match the config below. */
  seriesKey?: string;
  seriesLabel?: string;
  totalLabel: string; // e.g. "Total appointments"
  totalDisplay: string; // pre-formatted, e.g. "214"
  peakLabel: string; // e.g. "Peak day"
  peakDisplay: string; // pre-formatted, e.g. "Jul 24" or a patient's name
  /** Top-right two-line readout, e.g. ["DAILY", "MAX"]. Omit to hide. */
  cornerReadout?: [string, string];
  /** Shortens x-axis tick labels, e.g. month names -> 3-letter abbreviations. Identity by default. */
  xAxisFormatter?: (label: string) => string;
  /** Appended after the raw number in the tooltip, e.g. " visits". Empty by default. */
  valueSuffix?: string;
  /**
   * Opt-in click-to-select. When provided, bars become clickable: clicking one
   * highlights it (in place of the default max-value highlight) and reports
   * its index via onSelectIndex; clicking the same bar again clears the
   * selection. Charts that don't pass this stay non-interactive.
   */
  selectedIndex?: number | null;
  onSelectIndex?: (index: number | null) => void;
}

const DX = 10;
const DY = 10;
const BEVEL_OPACITY = 0.55;
const FILLED = true;
const DIRECTION: "left" | "right" = "right";
const HIGHLIGHT_COLOR = "#22c55e";
const HIGHLIGHT_COLOR_DARK = "#15803d";

interface ShapeProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  index?: number;
  payload?: IsoBarDatum;
}

function IsoBar({
  x,
  y,
  width,
  height,
  index,
  payload,
  maxValue,
  idPrefix,
  seriesKey,
  selectedIndex,
}: ShapeProps & { maxValue: number; idPrefix: string; seriesKey: string; selectedIndex?: number | null }) {
  const bx = Number(x ?? 0);
  const by = Number(y ?? 0);
  const bw = Number(width ?? 0);
  const bh = Number(height ?? 0);

  if (bh <= 0) return null;

  // A selection (when the chart is clickable) takes over the highlight from
  // the default "biggest bar" behavior — clicking a bar is a deliberate
  // choice to spotlight it, even if it isn't the tallest one.
  const highlight =
    selectedIndex != null ? index === selectedIndex : payload?.value === maxValue && maxValue > 0;
  const dx = DIRECTION === "left" ? -DX : DX;
  const sideX = DIRECTION === "left" ? bx : bx + bw;
  const topPoints = `${bx},${by} ${bx + bw},${by} ${bx + bw + dx},${by - DY} ${bx + dx},${by - DY}`;
  const sidePoints = `${sideX},${by} ${sideX + dx},${by - DY} ${sideX + dx},${by + bh - DY} ${sideX},${by + bh}`;

  // Gradient/pattern ids are namespaced per chart instance so multiple
  // charts on the same page don't share (and clobber) each other's <defs>.
  const url = (name: string) => `url(#${idPrefix}-${name})`;

  const strokeColor = highlight ? HIGHLIGHT_COLOR_DARK : "var(--color-accent)";

  const frontFill = FILLED
    ? highlight
      ? url(`iso-front-accent-${seriesKey}`)
      : url(`iso-front-base-${seriesKey}`)
    : "none";
  const topFill = FILLED
    ? highlight
      ? url(`iso-top-accent-${seriesKey}`)
      : url(`iso-top-base-${seriesKey}`)
    : "none";
  const rightFill = FILLED
    ? highlight
      ? url(`iso-right-accent-${seriesKey}`)
      : url(`iso-right-base-${seriesKey}`)
    : "none";
  const hatchFill = highlight ? url(`iso-hatch-accent-${seriesKey}`) : url(`iso-hatch-base-${seriesKey}`);

  return (
    <motion.g
      initial={{ scaleY: 0, opacity: 0 }}
      animate={{ scaleY: 1, opacity: 1 }}
      transition={{
        duration: 0.7,
        delay: (index ?? 0) * 0.03,
        ease: [0.16, 1, 0.3, 1],
      }}
      style={{ transformBox: "fill-box", transformOrigin: "50% 100%" }}
    >
      <polygon
        points={sidePoints}
        fill={rightFill}
        stroke={strokeColor}
        strokeWidth={FILLED ? 0 : 1}
      />
      <polygon
        points={topPoints}
        fill={topFill}
        stroke={strokeColor}
        strokeWidth={FILLED ? 0 : 1}
      />
      <rect
        x={bx}
        y={by}
        width={bw}
        height={bh}
        fill={frontFill}
        stroke={strokeColor}
        strokeWidth={FILLED ? 0 : 1}
      />
      {FILLED && <rect x={bx} y={by} width={bw} height={bh} fill={hatchFill} />}
      {FILLED && highlight && (
        <rect x={bx} y={by} width={2} height={bh} fill="rgba(0,0,0,0.15)" />
      )}
    </motion.g>
  );
}

function IsoBarDefs({ idPrefix, seriesKey }: { idPrefix: string; seriesKey: string }) {
  return (
    <defs>
      <linearGradient id={`${idPrefix}-iso-front-base-${seriesKey}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={1} />
        <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0.8} />
      </linearGradient>
      <linearGradient id={`${idPrefix}-iso-top-base-${seriesKey}`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={BEVEL_OPACITY} />
        <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={BEVEL_OPACITY * 0.9} />
      </linearGradient>
      <linearGradient id={`${idPrefix}-iso-right-base-${seriesKey}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={BEVEL_OPACITY * 0.7} />
        <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={BEVEL_OPACITY * 0.55} />
      </linearGradient>

      <linearGradient id={`${idPrefix}-iso-front-accent-${seriesKey}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={HIGHLIGHT_COLOR} stopOpacity={1} />
        <stop offset="100%" stopColor={HIGHLIGHT_COLOR_DARK} stopOpacity={0.95} />
      </linearGradient>
      <linearGradient id={`${idPrefix}-iso-top-accent-${seriesKey}`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor={HIGHLIGHT_COLOR} stopOpacity={BEVEL_OPACITY + 0.15} />
        <stop offset="100%" stopColor={HIGHLIGHT_COLOR} stopOpacity={BEVEL_OPACITY} />
      </linearGradient>
      <linearGradient id={`${idPrefix}-iso-right-accent-${seriesKey}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={HIGHLIGHT_COLOR_DARK} stopOpacity={BEVEL_OPACITY + 0.05} />
        <stop offset="100%" stopColor={HIGHLIGHT_COLOR_DARK} stopOpacity={BEVEL_OPACITY * 0.7} />
      </linearGradient>

      <pattern
        id={`${idPrefix}-iso-hatch-base-${seriesKey}`}
        patternUnits="userSpaceOnUse"
        width="6"
        height="6"
        patternTransform="rotate(45)"
      >
        <line x1="0" y1="0" x2="0" y2="6" stroke="currentColor" strokeWidth="1" strokeOpacity="0.15" />
      </pattern>
      <pattern
        id={`${idPrefix}-iso-hatch-accent-${seriesKey}`}
        patternUnits="userSpaceOnUse"
        width="6"
        height="6"
        patternTransform="rotate(45)"
      >
        <line x1="0" y1="0" x2="0" y2="6" stroke={HIGHLIGHT_COLOR_DARK} strokeWidth="1" strokeOpacity="0.15" />
      </pattern>
    </defs>
  );
}

export function IsometricBarChart({
  data,
  seriesKey = "value",
  seriesLabel = "Value",
  totalLabel,
  totalDisplay,
  peakLabel,
  peakDisplay,
  cornerReadout,
  xAxisFormatter,
  valueSuffix = "",
  selectedIndex,
  onSelectIndex,
}: IsometricBarChartProps) {
  // Namespaces this instance's <defs> ids so several charts can coexist on a page.
  const idPrefix = React.useId().replace(/:/g, "");

  const maxValue = React.useMemo(
    () => data.reduce((m, d) => (d.value > m ? d.value : m), 0),
    [data],
  );

  const chartConfig = React.useMemo(
    () =>
      ({
        [seriesKey]: {
          label: seriesLabel,
          colors: { light: ["var(--color-accent)"], dark: ["var(--color-accent)"] },
        },
      }) satisfies ChartConfig,
    [seriesKey, seriesLabel],
  );

  const formatTick = xAxisFormatter ?? ((value: string) => value);

  return (
    <div className="flex h-full w-full flex-col p-4">
      <div className="flex flex-row justify-between">
        <div className="flex flex-row">
          <div className="flex flex-col gap-2">
            <span className="text-muted-foreground font-mono text-xs">{totalLabel}</span>
            <span className="text-primary font-mono text-3xl tracking-tighter">{totalDisplay}</span>
          </div>
          <hr className="mx-4 h-full border-l border-dashed" />
          <div className="flex flex-col gap-2">
            <span className="text-muted-foreground font-mono text-xs">{peakLabel}</span>
            <span className="text-primary font-mono text-3xl tracking-tighter">{peakDisplay}</span>
          </div>
        </div>
        {cornerReadout && (
          <div className="flex flex-col justify-end gap-1">
            <span className="text-muted-foreground font-mono text-[10px]">
              {"// "}
              <span className="text-primary">{cornerReadout[0]}</span>
            </span>
            <span className="text-muted-foreground font-mono text-[10px]">
              {"// "}
              <span className="text-primary">{cornerReadout[1]}</span>
            </span>
          </div>
        )}
      </div>
      <hr className="my-4 border-t border-dashed" />
      <ChartContainer config={chartConfig}>
        <BarChart
          accessibilityLayer
          data={data}
          margin={{ top: 30, right: 12, left: 0, bottom: 0 }}
          barCategoryGap="25%"
        >
          <IsoBarDefs idPrefix={idPrefix} seriesKey={seriesKey} />
          <XAxis
            dataKey="label"
            tickLine={false}
            tickMargin={10}
            axisLine={false}
            interval="preserveStartEnd"
            tickFormatter={formatTick}
          />
          <YAxis hide domain={[0, "dataMax + 1"]} />
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                formatter={(value, name) => (
                  <div className="flex flex-1 items-center gap-2">
                    <div
                      className="size-2.5 shrink-0 rounded-[2px]"
                      style={{ background: `var(--color-${seriesKey}-0)` }}
                    />
                    <span className="text-muted-foreground flex-1 capitalize">{name}</span>
                    <span className="text-foreground font-mono font-medium tabular-nums">
                      {value}
                      {valueSuffix}
                    </span>
                  </div>
                )}
              />
            }
          />
          <Bar
            dataKey="value"
            name={seriesLabel}
            isAnimationActive={false}
            cursor={onSelectIndex ? "pointer" : undefined}
            onClick={
              onSelectIndex
                ? (_data: unknown, index: number) => onSelectIndex(selectedIndex === index ? null : index)
                : undefined
            }
            shape={(props: unknown) => (
              <IsoBar
                {...(props as ShapeProps)}
                maxValue={maxValue}
                idPrefix={idPrefix}
                seriesKey={seriesKey}
                selectedIndex={selectedIndex}
              />
            )}
          />
        </BarChart>
      </ChartContainer>
    </div>
  );
}
