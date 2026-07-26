import { getSupabaseAdmin } from "../supabaseAdmin";

export type SessionStep =
  | "IDLE"
  | "AWAITING_NAME"
  | "AWAITING_SLOT_SELECTION"
  | "AWAITING_CANCEL_SELECTION";

export interface SessionData {
  clientName?: string;
  offeredSlots?: { start: string; end: string }[]; // ISO strings
  cancellableAppointments?: string[]; // appointment ids, in displayed order
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
