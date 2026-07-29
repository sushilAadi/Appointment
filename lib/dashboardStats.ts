import { listAppointments, type Appointment } from "./db/appointments";
import { CLINIC_TIMEZONE } from "./config";
import { clinicMidnight, isoDateInClinicTz, toClinicLocal } from "./timezone";

const weekdayShortFmt = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: CLINIC_TIMEZONE });
const dayLabelFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: CLINIC_TIMEZONE });
const monthLabelFmt = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: CLINIC_TIMEZONE });
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export interface DayBucket {
  key: string; // "YYYY-MM-DD", clinic-local
  label: string; // "Mon"
  date: Date; // clinic-local midnight of this day, as a UTC instant
  count: number;
}

export interface DailyVisitBucket {
  key: string;
  label: string; // "Mar 22"
  date: Date;
  newCount: number; // appointments that were that patient's first-ever visit
  returningCount: number;
}

export interface MonthBucket {
  key: string; // "YYYY-MM"
  label: string; // "Jan"
  count: number;
}

export interface TopPatient {
  name: string;
  phone: string;
  visits: number;
}

export interface PeakSlot {
  dayLabel: string;
  hourLabel: string;
  count: number;
}

export interface DashboardStats {
  uniquePatients: number;
  newPatientsThisWeek: number;
  newPatientsLastWeek: number;
  upcoming: Appointment[]; // next 5 confirmed, soonest first
  last7Days: DayBucket[]; // oldest -> newest (today last) — used for KPI sparklines
  last30Days: DailyVisitBucket[]; // oldest -> newest (today last), new vs returning split
  monthlyThisYear: MonthBucket[]; // Jan -> Dec, clinic-local current year
  hourHeatmap: number[][]; // [dayOfWeek 0-6 (Sun-Sat)][hour 0-23], non-cancelled counts
  peakSlot: PeakSlot | null;
  topPatients: TopPatient[]; // top 5 by completed-visit count
  weekAveragePerDay: number;
  thisWeekTotal: number;
  lastWeekTotal: number;
  showUpRateThisWeek: number | null; // completed / (completed + cancelled), this week
  showUpRateLastWeek: number | null;
  statusTotals: { confirmed: number; completed: number; cancelled: number };
  today: {
    confirmed: number;
    completed: number;
    cancelled: number;
    nextAppointment: Appointment | null;
  };
}

/**
 * Buckets appointments into clinic-local calendar days. Cancelled
 * appointments are excluded — they never became a real visit, so counting
 * them would overstate patient volume.
 */
function countsByDay(appointments: Appointment[], days: number): DayBucket[] {
  const buckets: DayBucket[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = clinicMidnight(-i);
    buckets.push({ key: isoDateInClinicTz(date), label: weekdayShortFmt.format(date), date, count: 0 });
  }
  const indexByKey = new Map(buckets.map((b, idx) => [b.key, idx]));
  for (const a of appointments) {
    if (a.status === "CANCELLED") continue;
    const idx = indexByKey.get(isoDateInClinicTz(a.startTime));
    if (idx !== undefined) buckets[idx].count++;
  }
  return buckets;
}

function showUpRate(appointments: Appointment[], start: Date, end: Date): number | null {
  const inRange = appointments.filter((a) => a.startTime >= start && a.startTime < end);
  const completed = inRange.filter((a) => a.status === "COMPLETED").length;
  const cancelled = inRange.filter((a) => a.status === "CANCELLED").length;
  const finished = completed + cancelled;
  return finished > 0 ? Math.round((completed / finished) * 100) : null;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const now = new Date();

  // One wide pull (ascending, oldest first) is the source for everything
  // below — a solo-clinic dataset is small enough that deriving all of
  // these views in memory is simpler and cheaper than a dozen narrower
  // queries. Ascending order also makes "this patient's first-ever visit"
  // a single pass: the first time a phone number is seen IS that patient's
  // first appointment.
  const all = await listAppointments({ limit: 5000, orderAscending: true });

  const firstVisitByPhone = new Map<string, number>(); // phone -> first start_time (ms)
  for (const a of all) {
    if (a.status === "CANCELLED") continue;
    if (!firstVisitByPhone.has(a.clientPhone)) firstVisitByPhone.set(a.clientPhone, a.startTime.getTime());
  }

  const uniquePatients = firstVisitByPhone.size;

  const statusTotals = all.reduce(
    (acc, a) => {
      if (a.status === "CONFIRMED") acc.confirmed++;
      else if (a.status === "COMPLETED") acc.completed++;
      else if (a.status === "CANCELLED") acc.cancelled++;
      return acc;
    },
    { confirmed: 0, completed: 0, cancelled: 0 }
  );

  const upcoming = all
    .filter((a) => a.status === "CONFIRMED" && a.startTime.getTime() >= now.getTime())
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
    .slice(0, 5);

  const windowStart14 = clinicMidnight(-13);
  const windowEnd = clinicMidnight(1); // tomorrow midnight, exclusive
  const last14Appointments = all.filter((a) => a.startTime >= windowStart14 && a.startTime < windowEnd);

  const last14Days = countsByDay(last14Appointments, 14);
  const last7Days = last14Days.slice(7);
  const previous7Days = last14Days.slice(0, 7);

  const thisWeekTotal = last7Days.reduce((sum, d) => sum + d.count, 0);
  const lastWeekTotal = previous7Days.reduce((sum, d) => sum + d.count, 0);
  const weekAveragePerDay = Math.round((thisWeekTotal / 7) * 10) / 10;

  const thisWeekStart = clinicMidnight(-6);
  const lastWeekStart = clinicMidnight(-13);
  const showUpRateThisWeek = showUpRate(all, thisWeekStart, windowEnd);
  const showUpRateLastWeek = showUpRate(all, lastWeekStart, thisWeekStart);

  const newPatientsThisWeek = [...firstVisitByPhone.values()].filter(
    (t) => t >= thisWeekStart.getTime() && t < windowEnd.getTime()
  ).length;
  const newPatientsLastWeek = [...firstVisitByPhone.values()].filter(
    (t) => t >= lastWeekStart.getTime() && t < thisWeekStart.getTime()
  ).length;

  // Last 30 days, new-vs-returning visit split — the dashboard's main chart.
  const windowStart30 = clinicMidnight(-29);
  const last30Appointments = all.filter((a) => a.startTime >= windowStart30 && a.startTime < windowEnd && a.status !== "CANCELLED");
  const last30Days: DailyVisitBucket[] = [];
  for (let i = 29; i >= 0; i--) {
    const date = clinicMidnight(-i);
    last30Days.push({ key: isoDateInClinicTz(date), label: dayLabelFmt.format(date), date, newCount: 0, returningCount: 0 });
  }
  const indexByKey30 = new Map(last30Days.map((b, idx) => [b.key, idx]));
  for (const a of last30Appointments) {
    const idx = indexByKey30.get(isoDateInClinicTz(a.startTime));
    if (idx === undefined) continue;
    const isFirstVisit = firstVisitByPhone.get(a.clientPhone) === a.startTime.getTime();
    if (isFirstVisit) last30Days[idx].newCount++;
    else last30Days[idx].returningCount++;
  }

  // This calendar year, clinic-local, month by month.
  const clinicYear = toClinicLocal(now).getUTCFullYear();
  const monthlyThisYear: MonthBucket[] = Array.from({ length: 12 }, (_, m) => {
    const date = new Date(Date.UTC(clinicYear, m, 1));
    return { key: `${clinicYear}-${String(m + 1).padStart(2, "0")}`, label: monthLabelFmt.format(date), count: 0 };
  });
  for (const a of all) {
    if (a.status === "CANCELLED") continue;
    const local = toClinicLocal(a.startTime);
    if (local.getUTCFullYear() !== clinicYear) continue;
    monthlyThisYear[local.getUTCMonth()].count++;
  }

  // Day-of-week x hour-of-day heatmap, clinic-local, across all history.
  const hourHeatmap: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  let peakSlot: PeakSlot | null = null;
  for (const a of all) {
    if (a.status === "CANCELLED") continue;
    const local = toClinicLocal(a.startTime);
    hourHeatmap[local.getUTCDay()][local.getUTCHours()]++;
  }
  let peakCount = 0;
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      if (hourHeatmap[d][h] > peakCount) {
        peakCount = hourHeatmap[d][h];
        const hour12 = h % 12 === 0 ? 12 : h % 12;
        const ampm = h < 12 ? "am" : "pm";
        peakSlot = { dayLabel: WEEKDAY_LABELS[d], hourLabel: `${hour12}${ampm}`, count: peakCount };
      }
    }
  }

  // Top patients by completed-visit count (a "returning patient" leaderboard).
  const visitsByPhone = new Map<string, { name: string; visits: number }>();
  for (const a of all) {
    if (a.status !== "COMPLETED") continue;
    const existing = visitsByPhone.get(a.clientPhone);
    if (existing) existing.visits++;
    else visitsByPhone.set(a.clientPhone, { name: a.clientName, visits: 1 });
  }
  const topPatients: TopPatient[] = [...visitsByPhone.entries()]
    .map(([phone, v]) => ({ phone, name: v.name, visits: v.visits }))
    .sort((a, b) => b.visits - a.visits)
    .slice(0, 5);

  const todayKey = isoDateInClinicTz(now);
  const todaysAppointments = last14Appointments.filter((a) => isoDateInClinicTz(a.startTime) === todayKey);
  const today = {
    confirmed: todaysAppointments.filter((a) => a.status === "CONFIRMED").length,
    completed: todaysAppointments.filter((a) => a.status === "COMPLETED").length,
    cancelled: todaysAppointments.filter((a) => a.status === "CANCELLED").length,
    nextAppointment: upcoming[0] ?? null,
  };

  return {
    uniquePatients,
    newPatientsThisWeek,
    newPatientsLastWeek,
    upcoming,
    last7Days,
    last30Days,
    monthlyThisYear,
    hourHeatmap,
    peakSlot,
    topPatients,
    weekAveragePerDay,
    thisWeekTotal,
    lastWeekTotal,
    showUpRateThisWeek,
    showUpRateLastWeek,
    statusTotals,
    today,
  };
}
