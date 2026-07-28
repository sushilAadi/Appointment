import { randomUUID } from "crypto";
import { getSupabaseAdmin } from "./supabaseAdmin";

const BUCKET = "prescriptions";

/**
 * Uploads a prescription photo (already downloaded from WhatsApp) to the
 * public "prescriptions" Storage bucket and returns its public URL — used
 * both to store a durable link in the appointment record and to hand back
 * to WhatsApp's send-image API (which needs a plain fetchable URL).
 *
 * The object path is a random UUID, not the appointment id or phone number
 * — the bucket is public, so an unguessable path is what keeps a photo from
 * being found by anyone who doesn't already have the link.
 */
export async function uploadPrescriptionPhoto(buffer: Buffer, mimeType: string): Promise<string> {
  const supabase = getSupabaseAdmin();
  const extension = mimeType.split("/")[1]?.split("+")[0] || "jpg";
  const path = `${randomUUID()}.${extension}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    contentType: mimeType,
    upsert: false,
  });
  if (error) throw new Error(`Failed to upload prescription photo: ${error.message}`);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
