import {
  Users,
  ClipboardList,
  Activity,
  CircleCheck,
  TrendingUp,
  TrendingDown,
  Calendar,
  Download,
  ArrowRight,
} from "lucide-react";
import { getDashboardStats } from "@/lib/dashboardStats";
import { CLINIC_TIMEZONE, DOCTOR_NAME } from "@/lib/config";
import { initialsFor } from "@/lib/format";
import Sparkline from "@/components/charts/Sparkline";
import DailyVisitsChart from "@/components/charts/DailyVisitsChart";
import MonthlyBars from "@/components/charts/MonthlyBars";
import StatusDonut from "@/components/charts/StatusDonut";
import HourHeatmap from "@/components/charts/HourHeatmap";

export const dynamic = "force-dynamic";

const timeFmt = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: CLINIC_TIMEZONE,
});

const rangeDateFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: CLINIC_TIMEZONE,
});

const dayKeyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: CLINIC_TIMEZONE });

const laterDayFmt = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: CLINIC_TIMEZONE,
});

function greetingFor(now: Date): string {
  let hour = Number(
    new Intl.DateTimeFormat("en-US", { hour: "2-digit", hour12: false, timeZone: CLINIC_TIMEZONE }).format(now)
  );
  if (hour === 24) hour = 0;
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function relativeDayInfo(date: Date, now: Date): { label: string; badgeClass: string } {
  const dateKey = dayKeyFmt.format(date);
  if (dateKey === dayKeyFmt.format(now)) return { label: "Today", badgeClass: "badge-confirmed" };
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  if (dateKey === dayKeyFmt.format(tomorrow)) return { label: "Tomorrow", badgeClass: "badge-completed" };
  return { label: laterDayFmt.format(date), badgeClass: "badge-muted" };
}

/** Percent change from `previous` to `current`, or null when there's no
 * baseline to compare against (avoids a meaningless "+Infinity%"). */
function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export default async function AppointmentsPage() {
  const stats = await getDashboardStats();
  const now = new Date();

  const rangeStart = stats.last7Days[0]?.date ?? now;
  const rangeLabel = `${rangeDateFmt.format(rangeStart)} – ${rangeDateFmt.format(now)}`;
  const sparklineValues = stats.last7Days.map((d) => d.count);

  const apptDeltaPct = pctChange(stats.thisWeekTotal, stats.lastWeekTotal);
  const showUpDeltaPts =
    stats.showUpRateThisWeek !== null && stats.showUpRateLastWeek !== null
      ? stats.showUpRateThisWeek - stats.showUpRateLastWeek
      : null;

  const kpis = [
    {
      icon: Users,
      label: "Total patients",
      value: stats.uniquePatients.toLocaleString(),
      delta: `+${stats.newPatientsThisWeek}`,
      caption: "new this week",
      up: stats.newPatientsThisWeek >= stats.newPatientsLastWeek,
    },
    {
      icon: ClipboardList,
      label: "Appointments this week",
      value: stats.thisWeekTotal.toLocaleString(),
      delta: apptDeltaPct !== null ? `${apptDeltaPct >= 0 ? "+" : ""}${apptDeltaPct}%` : "—",
      caption: "vs last week",
      up: (apptDeltaPct ?? 0) >= 0,
    },
    {
      icon: Activity,
      label: "Avg patients / day",
      value: stats.weekAveragePerDay.toString(),
      delta: apptDeltaPct !== null ? `${apptDeltaPct >= 0 ? "+" : ""}${apptDeltaPct}%` : "—",
      caption: "vs last week",
      up: (apptDeltaPct ?? 0) >= 0,
    },
    {
      icon: CircleCheck,
      label: "Show-up rate",
      value: stats.showUpRateThisWeek !== null ? `${stats.showUpRateThisWeek}%` : "—",
      delta: showUpDeltaPts !== null ? `${showUpDeltaPts >= 0 ? "+" : ""}${showUpDeltaPts}pts` : "—",
      caption: "vs last week",
      up: (showUpDeltaPts ?? 0) >= 0,
    },
  ];

  const statusTotal = stats.statusTotals.confirmed + stats.statusTotals.completed + stats.statusTotals.cancelled;
  const statusPct = (n: number) => (statusTotal > 0 ? Math.round((n / statusTotal) * 100) : 0);
  const topPatientMax = stats.topPatients[0]?.visits ?? 1;

  return (
    <>
      <div className="page-header">
        <div>
          <p className="page-eyebrow">Dashboard</p>
          <h1 className="page-title">
            {greetingFor(now)}, {DOCTOR_NAME}
          </h1>
        </div>
        <div className="page-header-actions">
          <span className="date-range-pill">{rangeLabel}</span>
          <a className="btn-primary" href="/schedule">
            <Calendar size={15} /> View schedule
          </a>
        </div>
      </div>

      <div className="kpi-row">
        {kpis.map((k) => (
          <div className="kpi-card" key={k.label}>
            <div className="kpi-card-top">
              <span className="kpi-icon">
                <k.icon size={15} />
              </span>
              <span className="kpi-label">{k.label}</span>
            </div>
            <div className="kpi-card-value-row">
              <span className="kpi-value">{k.value}</span>
              <Sparkline values={sparklineValues} />
            </div>
            <div className={`kpi-delta ${k.up ? "up" : "down"}`}>
              {k.up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              <span>{k.delta}</span>
              <span className="kpi-delta-caption">{k.caption}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="hero-row">
        <section className="panel hero-chart">
          <div className="panel-header">
            <h2>Appointments — last 30 days</h2>
            <div className="hero-chart-legend">
              <span>
                <span className="legend-dot new" /> New patient
              </span>
              <span>
                <span className="legend-dot returning" /> Returning
              </span>
            </div>
          </div>
          <DailyVisitsChart days={stats.last30Days} />
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2>Appointments by month</h2>
          </div>
          <MonthlyBars months={stats.monthlyThisYear} />
        </section>
      </div>

      <div className="dash-two-col">
        <section className="panel donut-card">
          <div className="panel-header">
            <h2>Patient status</h2>
          </div>
          <div className="donut-card-body">
            <StatusDonut
              confirmed={stats.statusTotals.confirmed}
              completed={stats.statusTotals.completed}
              cancelled={stats.statusTotals.cancelled}
            />
            <div className="donut-legend-list">
              <div className="donut-legend-row">
                <span className="legend-dot" style={{ background: "var(--success-text)" }} />
                <span className="donut-legend-label">Confirmed</span>
                <span className="donut-legend-pct">{statusPct(stats.statusTotals.confirmed)}%</span>
                <span className="donut-legend-count">{stats.statusTotals.confirmed}</span>
              </div>
              <div className="donut-legend-row">
                <span className="legend-dot" style={{ background: "var(--info-text)" }} />
                <span className="donut-legend-label">Completed</span>
                <span className="donut-legend-pct">{statusPct(stats.statusTotals.completed)}%</span>
                <span className="donut-legend-count">{stats.statusTotals.completed}</span>
              </div>
              <div className="donut-legend-row">
                <span className="legend-dot" style={{ background: "var(--danger-text)" }} />
                <span className="donut-legend-label">Cancelled</span>
                <span className="donut-legend-pct">{statusPct(stats.statusTotals.cancelled)}%</span>
                <span className="donut-legend-count">{stats.statusTotals.cancelled}</span>
              </div>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2>Top patients</h2>
          </div>
          {stats.topPatients.length === 0 ? (
            <p className="empty-state">No completed visits yet.</p>
          ) : (
            <div className="top-patients-list">
              {stats.topPatients.map((p) => (
                <div className="top-patients-row" key={p.phone}>
                  <span className="avatar">{initialsFor(p.name)}</span>
                  <div className="top-patients-info">
                    <p className="top-patients-name">{p.name}</p>
                    <div className="top-patients-track">
                      <span
                        className="top-patients-fill"
                        style={{ width: `${Math.round((p.visits / topPatientMax) * 100)}%` }}
                      />
                    </div>
                  </div>
                  <span className="top-patients-count">{p.visits}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="dash-quad-row">
        <section className="panel">
          <div className="panel-header">
            <h2>Appointments by hour</h2>
          </div>
          <HourHeatmap grid={stats.hourHeatmap} />
          {stats.peakSlot && (
            <p className="heatmap-caption">
              Peak: {stats.peakSlot.dayLabel} {stats.peakSlot.hourLabel}
            </p>
          )}
        </section>

        <section className="panel today-card">
          <p className="today-card-title">Today at a glance</p>
          <div className="today-card-rows">
            <div className="today-card-row">
              <span>Confirmed</span>
              <strong>{stats.today.confirmed}</strong>
            </div>
            <div className="today-card-row">
              <span>Completed</span>
              <strong>{stats.today.completed}</strong>
            </div>
            <div className="today-card-row">
              <span>Cancelled</span>
              <strong>{stats.today.cancelled}</strong>
            </div>
          </div>
          <div className="today-card-next">
            <span>Next patient</span>
            <strong>
              {stats.today.nextAppointment
                ? `${stats.today.nextAppointment.clientName} · ${timeFmt.format(stats.today.nextAppointment.startTime)}`
                : "Nothing else scheduled"}
            </strong>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2>Upcoming patients</h2>
          </div>
          {stats.upcoming.length === 0 ? (
            <p className="empty-state">No upcoming appointments.</p>
          ) : (
            <div className="upcoming-list">
              {stats.upcoming.map((a) => {
                const { label, badgeClass } = relativeDayInfo(a.startTime, now);
                return (
                  <div className="upcoming-row" key={a.id}>
                    <span className="avatar">{initialsFor(a.clientName)}</span>
                    <div className="upcoming-info">
                      <p className="upcoming-name">{a.clientName}</p>
                      <p className="upcoming-meta">{timeFmt.format(a.startTime)}</p>
                    </div>
                    <span className={`badge ${badgeClass}`}>{label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2>Quick actions</h2>
          </div>
          <div className="quick-actions-list">
            <a className="quick-action-row" href="/schedule">
              <ClipboardList size={16} />
              <span>
                <strong>View schedule</strong>
                <small>Today&apos;s agenda</small>
              </span>
              <ArrowRight size={14} />
            </a>
            <a className="quick-action-row" href="/patients">
              <Users size={16} />
              <span>
                <strong>All patients</strong>
                <small>Full directory</small>
              </span>
              <ArrowRight size={14} />
            </a>
            <a className="quick-action-row" href="/api/export/appointments">
              <Download size={16} />
              <span>
                <strong>Export CSV</strong>
                <small>All appointments</small>
              </span>
              <ArrowRight size={14} />
            </a>
          </div>
        </section>
      </div>
    </>
  );
}
