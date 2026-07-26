import { getSupabaseAdmin } from "../supabaseAdmin";

export type AppointmentStatus = "CONFIRMED" | "CANCELLED";

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
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export async function createAppointmentRecord(input: {
  clientName: string;
  clientPhone: string;
  startTime: Date;
  endTime: Date;
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
    })
    .select()
    .single();

  if (error || !data) throw new Error(`Failed to create appointment: ${error?.message}`);
  return mapRow(data as AppointmentRow);
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
  cancelledBy: "CLIENT" | "DOCTOR"
): Promise<Appointment | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("appointments")
    .update({ status: "CANCELLED", cancelled_by: cancelledBy })
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) throw new Error(`Failed to cancel appointment: ${error.message}`);
  return data ? mapRow(data as AppointmentRow) : null;
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
