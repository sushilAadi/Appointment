import { randomUUID } from "crypto";
import { getSupabaseAdmin } from "./supabaseAdmin";

const BUCKET = "prescriptions";

/**
 * Uploads a file to the public "prescriptions" Storage bucket and returns
 * its public URL — used both to store a durable link and to hand back to
 * WhatsApp's send-image/send-document APIs (which need a plain fetchable
 * URL, no auth header support).
 *
 * The object path is a random UUID, not the appointment id or phone number
 * — the bucket is public, so an unguessable path is what keeps a file from
 * being found by anyone who doesn't already have the link.
 */
async function uploadToPrescriptionsBucket(
  buffer: Buffer,
  contentType: string,
  extension: string
): Promise<string> {
  const supabase = getSupabaseAdmin();
  const path = `${randomUUID()}.${extension}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    contentType,
    upsert: false,
  });
  if (error) throw new Error(`Failed to upload file: ${error.message}`);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/** A prescription photo the doctor sent (either a raw handwritten note, or a reference photo attached alongside typed notes). */
export async function uploadPrescriptionPhoto(buffer: Buffer, mimeType: string): Promise<string> {
  const extension = mimeType.split("/")[1]?.split("+")[0] || "jpg";
  return uploadToPrescriptionsBucket(buffer, mimeType, extension);
}

/** The doctor's saved signature photo, captured once during setup and reused on every generated prescription slip. */
export async function uploadDoctorSignature(buffer: Buffer, mimeType: string): Promise<string> {
  const extension = mimeType.split("/")[1]?.split("+")[0] || "jpg";
  return uploadToPrescriptionsBucket(buffer, mimeType, extension);
}

/** The auto-generated PDF prescription slip for a completed visit. */
export async function uploadPrescriptionSlip(buffer: Buffer): Promise<string> {
  return uploadToPrescriptionsBucket(buffer, "application/pdf", "pdf");
}
