import { getSupabaseAdmin } from "../supabaseAdmin";

export type SessionStep =
  | "IDLE"
  | "AWAITING_NAME"
  | "AWAITING_DATE_SELECTION"
  | "AWAITING_SLOT_SELECTION"
  | "AWAITING_DUPLICATE_CONFIRM"
  | "AWAITING_CONCERN"
  | "AWAITING_CANCEL_SELECTION"
  | "AWAITING_CANCEL_REASON"
  | "AWAITING_PRESCRIPTION"
  | "AWAITING_BLOCK_DATE"
  | "AWAITING_BLOCK_RANGE";

export interface SessionData {
  clientName?: string;
  suggestedName?: string; // returning patient's name from their last visit, offered as a shortcut
  offeredDates?: string[]; // "YYYY-MM-DD" clinic-local dates, in displayed order, for the date-picker step
  offeredSlots?: { start: string; end: string }[]; // ISO strings
  selectedSlot?: { start: string; end: string }; // ISO strings, chosen slot awaiting concern + confirmation
  cancellableAppointments?: string[]; // appointment ids, in displayed order
  cancelAppointmentId?: string; // appointment chosen to cancel, awaiting a reason
  viewedAppointments?: string[]; // doctor's last-shown today/week list, so "<n> complete" can resolve a number
  prescribeAppointmentId?: string; // appointment being marked complete, awaiting prescription notes/photo
  blockOfferedDates?: string[]; // "YYYY-MM-DD" dates shown for the doctor's "block my time" date picker
  blockDate?: string; // "YYYY-MM-DD" date the doctor is blocking, awaiting the time range
  [key: string]: unknown;
}

interface ChatSessionRow {
  phone: string;
  step: SessionStep;
  data: SessionData;
}

export async function getSession(phone: string): Promise<{ step: SessionStep; data: SessionData }> {
  const supabase = getSupabaseAdmin();
  const { data: existing, error } = await supabase
    .from("chat_sessions")
    .select("phone, step, data")
    .eq("phone", phone)
    .maybeSingle();

  if (error) throw new Error(`Failed to load chat session: ${error.message}`);
  if (existing) {
    const row = existing as ChatSessionRow;
    return { step: row.step, data: row.data ?? {} };
  }

  const { data: created, error: insertError } = await supabase
    .from("chat_sessions")
    .insert({ phone, step: "IDLE", data: {} })
    .select("phone, step, data")
    .single();

  if (insertError || !created) {
    throw new Error(`Failed to create chat session: ${insertError?.message}`);
  }

  const row = created as ChatSessionRow;
  return { step: row.step, data: row.data ?? {} };
}

export async function setSession(
  phone: string,
  step: SessionStep,
  data: SessionData = {}
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("chat_sessions")
    .upsert({ phone, step, data }, { onConflict: "phone" });
  if (error) throw new Error(`Failed to save chat session: ${error.message}`);
}

export async function resetSession(phone: string): Promise<void> {
  await setSession(phone, "IDLE", {});
}
