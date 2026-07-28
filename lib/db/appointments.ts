import { getSupabaseAdmin } from "../supabaseAdmin";

// Thrown when an insert is rejected by the appointments_unique_confirmed_start
// unique index (Postgres error code 23505) — i.e. someone else booked the
// exact same slot a moment before this request landed.
export class SlotUnavailableError extends Error {
  constructor() {
    super("That slot was just booked by someone else.");
    this.name = "SlotUnavailableError";
  }
}

export type AppointmentStatus = "CONFIRMED" | "CANCELLED" | "COMPLETED";

export interface Appointment {
  id: string;
  clientName: string;
  clientPhone: string;
  startTime: Date;
  endTime: Date;
  status: AppointmentStatus;
  notes: string | null;
  googleEventId: string | null;
  cancelledBy: string | null;
  cancellationReason: string | null;
  prescriptionNotes: string | null;
  prescriptionPhotoUrl: string | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// Raw shape as it comes back from Supabase (snake_case columns, timestamps
// as ISO strings) — kept private to this module.
interface AppointmentRow {
  id: string;
  client_name: string;
  client_phone: string;
  start_time: string;
  end_time: string;
  status: AppointmentStatus;
  notes: string | null;
  google_event_id: string | null;
  cancelled_by: string | null;
  cancellation_reason: string | null;
  prescription_notes: string | null;
  prescription_photo_url: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

function mapRow(row: AppointmentRow): Appointment {
  return {
    id: row.id,
    clientName: row.client_name,
    clientPhone: row.client_phone,
    startTime: new Date(row.start_time),
    endTime: new Date(row.end_time),
    status: row.status,
    notes: row.notes,
    googleEventId: row.google_event_id,
    cancelledBy: row.cancelled_by,
    cancellationReason: row.cancellation_reason,
    prescriptionNotes: row.prescription_notes,
    prescriptionPhotoUrl: row.prescription_photo_url,
    completedAt: row.completed_at ? new Date(row.completed_at) : null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export async function createAppointmentRecord(input: {
  clientName: string;
  clientPhone: string;
  startTime: Date;
  endTime: Date;
  notes?: string | null;
}): Promise<Appointment> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("appointments")
    .insert({
      client_name: input.clientName,
      client_phone: input.clientPhone,
      start_time: input.startTime.toISOString(),
      end_time: input.endTime.toISOString(),
      status: "CONFIRMED",
      notes: input.notes ?? null,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") throw new SlotUnavailableError();
    throw new Error(`Failed to create appointment: ${error.message}`);
  }
  if (!data) throw new Error("Failed to create appointment: no data returned");
  return mapRow(data as AppointmentRow);
}

/**
 * Proactive check used right before showing a booking confirmation — avoids
 * the generic DB error in the common case. The unique index in
 * supabase/schema.sql is still the real guarantee against a race, since
 * this check-then-insert has a (small) window between the two.
 */
export async function isSlotTaken(startTime: Date, endTime: Date): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("appointments")
    .select("id")
    .eq("status", "CONFIRMED")
    .lt("start_time", endTime.toISOString())
    .gt("end_time", startTime.toISOString())
    .limit(1);

  if (error) throw new Error(`Failed to check slot availability: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

export async function setAppointmentGoogleEventId(id: string, googleEventId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("appointments")
    .update({ google_event_id: googleEventId })
    .eq("id", id);
  if (error) throw new Error(`Failed to set google_event_id: ${error.message}`);
}

export async function getAppointmentById(id: string): Promise<Appointment | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("appointments").select().eq("id", id).maybeSingle();
  if (error) throw new Error(`Failed to fetch appointment: ${error.message}`);
  return data ? mapRow(data as AppointmentRow) : null;
}

export async function cancelAppointmentRecord(
  id: string,
  cancelledBy: "CLIENT" | "DOCTOR",
  cancellationReason?: string | null
): Promise<Appointment | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("appointments")
    .update({
      status: "CANCELLED",
      cancelled_by: cancelledBy,
      cancellation_reason: cancellationReason ?? null,
    })
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) throw new Error(`Failed to cancel appointment: ${error.message}`);
  return data ? mapRow(data as AppointmentRow) : null;
}

export async function markAppointmentComplete(
  id: string,
  input: { prescriptionNotes?: string | null; prescriptionPhotoUrl?: string | null }
): Promise<Appointment | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("appointments")
    .update({
      status: "COMPLETED",
      prescription_notes: input.prescriptionNotes ?? null,
      prescription_photo_url: input.prescriptionPhotoUrl ?? null,
      completed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) throw new Error(`Failed to mark appointment complete: ${error.message}`);
  return data ? mapRow(data as AppointmentRow) : null;
}

/**
 * True-overlap lookup (start < end AND end > start), same predicate as
 * isSlotTaken but returning full rows — used when the doctor blocks off a
 * time range that may not line up with the 30-minute slot grid (e.g. a
 * custom "2:15pm-5pm" block), where a plain startTime >= X filter could miss
 * an appointment that started slightly earlier but still overlaps.
 */
export async function listOverlappingAppointments(
  start: Date,
  end: Date,
  status: AppointmentStatus = "CONFIRMED"
): Promise<Appointment[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("appointments")
    .select()
    .eq("status", status)
    .lt("start_time", end.toISOString())
    .gt("end_time", start.toISOString())
    .order("start_time", { ascending: true });
  if (error) throw new Error(`Failed to list overlapping appointments: ${error.message}`);
  return (data as AppointmentRow[]).map(mapRow);
}

export interface AppointmentQuery {
  status?: AppointmentStatus;
  clientPhone?: string;
  startFrom?: Date;
  startBefore?: Date;
  orderAscending?: boolean;
  limit?: number;
}

export async function listAppointments(query: AppointmentQuery = {}): Promise<Appointment[]> {
  const supabase = getSupabaseAdmin();
  let builder = supabase.from("appointments").select();

  if (query.status) builder = builder.eq("status", query.status);
  if (query.clientPhone) builder = builder.eq("client_phone", query.clientPhone);
  if (query.startFrom) builder = builder.gte("start_time", query.startFrom.toISOString());
  if (query.startBefore) builder = builder.lt("start_time", query.startBefore.toISOString());

  builder = builder.order("start_time", { ascending: query.orderAscending ?? true });
  if (query.limit) builder = builder.limit(query.limit);

  const { data, error } = await builder;
  if (error) throw new Error(`Failed to list appointments: ${error.message}`);
  return (data as AppointmentRow[]).map(mapRow);
}
