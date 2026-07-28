import { getSupabaseAdmin } from "../supabaseAdmin";

// Keys used in the clinic_settings table — kept in one place so a typo
// can't silently create a second, disconnected setting.
export const SETTING_KEYS = {
  DOCTOR_REGISTRATION_NUMBER: "doctor_registration_number",
  DOCTOR_SIGNATURE_URL: "doctor_signature_url",
} as const;

export async function getSetting(key: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("clinic_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error) throw new Error(`Failed to read setting "${key}": ${error.message}`);
  return data?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("clinic_settings")
    .upsert({ key, value }, { onConflict: "key" });
  if (error) throw new Error(`Failed to save setting "${key}": ${error.message}`);
}

export interface DoctorPrescriptionSettings {
  registrationNumber: string | null;
  signatureUrl: string | null;
}

/** Both pieces needed to build a signed prescription slip, fetched together. */
export async function getDoctorPrescriptionSettings(): Promise<DoctorPrescriptionSettings> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("clinic_settings")
    .select("key, value")
    .in("key", [SETTING_KEYS.DOCTOR_REGISTRATION_NUMBER, SETTING_KEYS.DOCTOR_SIGNATURE_URL]);
  if (error) throw new Error(`Failed to read doctor settings: ${error.message}`);

  const byKey = new Map((data ?? []).map((row) => [row.key, row.value as string]));
  return {
    registrationNumber: byKey.get(SETTING_KEYS.DOCTOR_REGISTRATION_NUMBER) ?? null,
    signatureUrl: byKey.get(SETTING_KEYS.DOCTOR_SIGNATURE_URL) ?? null,
  };
}
