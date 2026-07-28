import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { CLINIC_NAME, DOCTOR_NAME } from "./config";

export interface PrescriptionSlipInput {
  prescriptionNumber: string; // short, unique per-visit reference — see completeAppointment
  doctorRegistrationNumber: string;
  signatureUrl: string;
  patientName: string;
  patientPhone: string;
  visitDateLabel: string; // e.g. "Wed, Jul 29, 4:30 PM–5:00 PM"
  medicines: string; // the doctor's typed prescription text, used as-is
}

function wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (paragraph.trim() === "") {
      lines.push("");
      continue;
    }
    const words = paragraph.split(" ");
    let current = "";
    for (const word of words) {
      const attempt = current ? `${current} ${word}` : word;
      if (current && font.widthOfTextAtSize(attempt, fontSize) > maxWidth) {
        lines.push(current);
        current = word;
      } else {
        current = attempt;
      }
    }
    lines.push(current);
  }
  return lines;
}

/**
 * Builds a formatted, signed prescription slip as a PDF — this is what
 * turns a doctor's typed WhatsApp message into something that reads like a
 * real prescription: clinic name, doctor name + registration number, the
 * patient's details, the medicines as typed, a unique per-visit reference
 * number, and the doctor's saved signature image.
 *
 * The unique number isn't a separate counter to manage — it's derived from
 * the appointment's own database id (see completeAppointment), which
 * already can't collide or be reused, since each appointment can only be
 * completed once.
 */
export async function generatePrescriptionSlipPdf(input: PrescriptionSlipInput): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4, in points
  const { width, height } = page.getSize();
  const marginX = 50;

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let y = height - 60;

  page.drawText(CLINIC_NAME, { x: marginX, y, size: 20, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
  y -= 22;
  page.drawText("Prescription", { x: marginX, y, size: 12, font: fontRegular, color: rgb(0.35, 0.35, 0.35) });
  y -= 14;
  page.drawLine({ start: { x: marginX, y }, end: { x: width - marginX, y }, thickness: 1, color: rgb(0.8, 0.8, 0.8) });
  y -= 30;

  page.drawText(`Dr. ${DOCTOR_NAME}`, { x: marginX, y, size: 13, font: fontBold });
  page.drawText(`Rx No: ${input.prescriptionNumber}`, {
    x: width - marginX - fontRegular.widthOfTextAtSize(`Rx No: ${input.prescriptionNumber}`, 11),
    y,
    size: 11,
    font: fontRegular,
  });
  y -= 16;
  page.drawText(`Reg. No: ${input.doctorRegistrationNumber}`, { x: marginX, y, size: 11, font: fontRegular });
  y -= 30;

  page.drawText(`Patient: ${input.patientName}`, { x: marginX, y, size: 12, font: fontRegular });
  y -= 16;
  page.drawText(`Phone: +${input.patientPhone}`, { x: marginX, y, size: 12, font: fontRegular });
  y -= 16;
  page.drawText(`Visit: ${input.visitDateLabel}`, { x: marginX, y, size: 12, font: fontRegular });
  y -= 26;

  page.drawLine({ start: { x: marginX, y }, end: { x: width - marginX, y }, thickness: 1, color: rgb(0.8, 0.8, 0.8) });
  y -= 26;

  page.drawText("Rx", { x: marginX, y, size: 16, font: fontBold });
  y -= 24;

  const maxWidth = width - marginX * 2;
  const bodySize = 12;
  const minY = 150; // leave room for the signature block below
  for (const line of wrapText(input.medicines, fontRegular, bodySize, maxWidth)) {
    if (y < minY) break; // a very long note gets truncated rather than overflow the page — good enough for a single-page slip
    page.drawText(line, { x: marginX, y, size: bodySize, font: fontRegular });
    y -= 18;
  }

  // Signature block, bottom-right.
  const sigBoxY = 110;
  try {
    const sigRes = await fetch(input.signatureUrl);
    if (sigRes.ok) {
      const sigBytes = new Uint8Array(await sigRes.arrayBuffer());
      const contentType = sigRes.headers.get("content-type") || "";
      const sigImage = contentType.includes("png")
        ? await pdfDoc.embedPng(sigBytes)
        : await pdfDoc.embedJpg(sigBytes);
      const sigDims = sigImage.scaleToFit(140, 55);
      page.drawImage(sigImage, {
        x: width - marginX - sigDims.width,
        y: sigBoxY + 20,
        width: sigDims.width,
        height: sigDims.height,
      });
    }
  } catch (err) {
    console.error("Failed to embed doctor signature in prescription slip", err);
  }

  page.drawLine({
    start: { x: width - marginX - 160, y: sigBoxY + 14 },
    end: { x: width - marginX, y: sigBoxY + 14 },
    thickness: 1,
    color: rgb(0.5, 0.5, 0.5),
  });
  page.drawText(`Dr. ${DOCTOR_NAME}`, { x: width - marginX - 160, y: sigBoxY, size: 10, font: fontBold });
  page.drawText(`Reg. No: ${input.doctorRegistrationNumber}`, {
    x: width - marginX - 160,
    y: sigBoxY - 14,
    size: 9,
    font: fontRegular,
    color: rgb(0.35, 0.35, 0.35),
  });

  page.drawText(
    `System-generated prescription — visit Rx No: ${input.prescriptionNumber}, issued by ${CLINIC_NAME}.`,
    { x: marginX, y: 40, size: 8, font: fontRegular, color: rgb(0.55, 0.55, 0.55) }
  );

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
