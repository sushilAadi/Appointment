import { JWT } from "google-auth-library";

// Shared service-account auth for both the Calendar and Sheets clients.
// The service account must be shared (as Editor / "make changes to events")
// on the target calendar and spreadsheet — see README for the exact steps.

let cachedClient: JWT | null = null;

export function getGoogleAuthClient(): JWT {
  if (cachedClient) return cachedClient;

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

  if (!email || !rawKey) {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY are not set"
    );
  }

  // Env vars store the key with literal "\n" sequences; convert to real
  // newlines for the PEM parser.
  const privateKey = rawKey.includes("\\n") ? rawKey.replace(/\\n/g, "\n") : rawKey;

  cachedClient = new JWT({
    email,
    key: privateKey,
    scopes: [
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/spreadsheets",
    ],
  });

  return cachedClient;
}
