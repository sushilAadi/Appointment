import { google } from "googleapis";
import { getGoogleAuthClient } from "./googleAuth";

function sheetId(): string {
  const id = process.env.GOOGLE_SHEET_ID;
  if (!id) throw new Error("GOOGLE_SHEET_ID is not set");
  return id;
}

function tabName(): string {
  return process.env.GOOGLE_SHEET_TAB_NAME || "Appointments";
}

function sheetsClient() {
  return google.sheets({ version: "v4", auth: getGoogleAuthClient() });
}

export const SHEET_HEADERS = [
  "Appointment ID",
  "Client Name",
  "Client Phone",
  "Start Time",
  "End Time",
  "Status",
  "Notes",
  "Created At",
  "Cancellation Reason",
];

/** Creates the tab with a header row if it doesn't already exist. Safe to call repeatedly. */
export async function ensureSheetHeaders(): Promise<void> {
  const sheets = sheetsClient();
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: sheetId() });
  const existingTab = spreadsheet.data.sheets?.find(
    (s) => s.properties?.title === tabName()
  );

  if (!existingTab) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: sheetId(),
      requestBody: {
        requests: [{ addSheet: { properties: { title: tabName() } } }],
      },
    });
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId(),
    range: `${tabName()}!A1:I1`,
    valueInputOption: "RAW",
    requestBody: { values: [SHEET_HEADERS] },
  });
}

export interface SheetAppointmentRow {
  id: string;
  clientName: string;
  clientPhone: string;
  startTime: Date;
  endTime: Date;
  status: string;
  notes?: string | null;
  createdAt: Date;
}

/** Appends one row per appointment. The Appointment ID column is used later to find/update the row. */
export async function appendAppointmentRow(appt: SheetAppointmentRow): Promise<void> {
  const sheets = sheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId(),
    range: `${tabName()}!A:I`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [
        [
          appt.id,
          appt.clientName,
          appt.clientPhone,
          appt.startTime.toLocaleString(),
          appt.endTime.toLocaleString(),
          appt.status,
          appt.notes ?? "",
          appt.createdAt.toLocaleString(),
          "", // Cancellation Reason — filled in later if/when cancelled
        ],
      ],
    },
  });
}

/**
 * Finds the row whose Appointment ID column matches `appointmentId` and
 * updates its Status column, plus its Cancellation Reason column if given.
 */
export async function updateAppointmentStatusInSheet(
  appointmentId: string,
  status: string,
  cancellationReason?: string | null
): Promise<void> {
  const sheets = sheetsClient();
  const idColumn = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId(),
    range: `${tabName()}!A:A`,
  });

  const rows = idColumn.data.values ?? [];
  const rowIndex = rows.findIndex((row) => row[0] === appointmentId);
  if (rowIndex === -1) {
    console.warn(`Sheet row for appointment ${appointmentId} not found; skipping status update`);
    return;
  }

  const rowNumber = rowIndex + 1; // 1-indexed for the Sheets API
  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId(),
    range: `${tabName()}!F${rowNumber}`,
    valueInputOption: "RAW",
    requestBody: { values: [[status]] },
  });

  if (cancellationReason) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId(),
      range: `${tabName()}!I${rowNumber}`,
      valueInputOption: "RAW",
      requestBody: { values: [[cancellationReason]] },
    });
  }
}
