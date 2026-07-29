# WhatsApp Doctor Appointment Booking

A Next.js app that lets patients book appointments with a single doctor
entirely over WhatsApp. Every booking is written to Postgres (Supabase),
mirrored to a Google Calendar event, logged as a row in a Google Sheet, and
both the patient and the doctor get a WhatsApp confirmation. A small
dashboard at `/` shows everything in a browser.

## How it works

1. A patient messages your WhatsApp Business number ("hi", "book", etc).
2. Meta's WhatsApp Cloud API forwards that message to `POST /api/whatsapp/webhook`.
3. `lib/bookingBot.ts` runs a tiny state machine (stored per phone number in
   the `chat_sessions` table) that asks for the patient's name, shows the next
   open slots, and confirms the booking.
4. `lib/appointments.ts` creates the appointment: DB row → Google Calendar
   event → Google Sheet row → WhatsApp message to the patient → WhatsApp
   message to the doctor.
5. The doctor can text `today`, `week`, or `cancel` to their own WhatsApp
   number to manage their schedule from their phone.
6. The doctor can browse the dashboard at `/` in a browser.

Everything below is a one-time setup. Budget about 30–45 minutes the first
time through.

---

## 1. Prerequisites

- Node.js 18.18+ and npm
- A Meta (Facebook) developer account
- A Google account (for Google Cloud + Calendar + Sheets)
- A Supabase account (free tier is fine)
- [ngrok](https://ngrok.com/download) for local testing, or a Vercel account for deploying

---

## 2. Install

```bash
cd whatsapp-doctor-booking
npm install
cp .env.example .env
```

You'll fill in `.env` as you go through the steps below.

---

## 3. Database — Supabase

This app talks to Supabase using the **Supabase JS client** (`@supabase/supabase-js`),
not Prisma and not a raw Postgres connection string — so there's no pooler
or IPv6 gotchas to deal with.

1. Go to [supabase.com](https://supabase.com) → **New project** (skip this
   if you already have one).
2. Get your project URL and secret key: **Project Settings → API Keys**.
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL` in `.env`.
   - **`service_role`** secret key → `SUPABASE_SERVICE_ROLE_KEY` in `.env`.

   > Don't use the **`anon` / `publishable`** key for this app (that's the
   > one meant to be exposed to a browser, e.g. `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   > if you'd already grabbed one). It can't write to these tables. The
   > `service_role` key is a separate, secret key on the same API Keys page
   > that bypasses Row Level Security — the Next.js server uses it, it's
   > never sent to the browser, so keep it out of any `NEXT_PUBLIC_` var.

3. Create the tables: open **SQL Editor** in the Supabase dashboard → **New
   query** → paste the contents of [`supabase/schema.sql`](./supabase/schema.sql)
   from this project → **Run**. That creates the `appointments` and
   `chat_sessions` tables, indexes, and `updated_at` triggers in one go.
4. You can browse the data any time in **Table Editor** in the same
   dashboard.

---

## 4. WhatsApp — Meta Cloud API

No developer experience needed — this is all clicking through Meta's
dashboard. The screens go in this exact order: **App details → Use case →
Business → Requirements → Overview → Dashboard → Quickstart**.

1. Go to [developers.facebook.com/apps](https://developers.facebook.com/apps)
   and log in with a normal Facebook account. Click **Create App**.

2. **App details screen** (this comes first, before anything WhatsApp-
   specific). Two fields:
   - **App name** — purely internal; patients never see this, it's just
     the label in your own dashboard. Anything like `Sunrise Clinic
     Booking Bot` is fine.
   - **Contact email** — use your own real email; Meta only uses it to
     reach you, never shown to patients.

   Click **Next**.

3. **Use case screen** — select **"Connect with customers through
   WhatsApp"** from the list, click **Next**.

4. **Business screen** — this is where you attach a **Business Portfolio**
   (Meta's current name for what used to be called "Business Manager" —
   same thing). If you don't have one, choose **Create a business
   portfolio** and give it a name (your clinic's name is fine). You do
   **not** need to submit it for verification right now — skip that if
   offered; verification is only required later, for messaging people
   beyond your 5 test recipients. Click **Next**.

5. **Requirements → Overview** — review screens, no input needed. Click
   **Go to dashboard**.

6. You land on **Customize use case → Connect on WhatsApp → Quickstart**.
   Click **Start using the API**. Meta automatically provisions, for free:
   - A **test WhatsApp Business Account**
   - A **test phone number** you can send/receive with immediately
   - A pre-approved `hello_world` template

7. On the **API Setup** page, copy two things into `.env`:
   - **Generate access token** → copy the token shown → `WHATSAPP_TOKEN`
     (this one expires in ~24h, fine for testing now — the "permanent
     token" section below covers getting one that doesn't expire).
   - **Phone number ID** (shown on the same page) → `WHATSAPP_PHONE_NUMBER_ID`.

8. Still on that page, find the **To** field and add a recipient: enter
   your own phone number, Meta texts you a verification code, enter it.
   The free test number can message up to **5 verified recipients** this
   way — add both your own number and whichever number will act as "the
   doctor."

9. Pick any random secret string yourself and put it in
   `WHATSAPP_VERIFY_TOKEN` in `.env` — you'll paste this same value into
   the Meta dashboard in the webhook step below.

10. Put the doctor's WhatsApp number (digits only, country code, no `+`,
    e.g. `15551234567`) in `DOCTOR_WHATSAPP_NUMBER`. It must be one of the
    verified recipients from step 8 while you're still on the test number.

### Connecting the webhook (local dev)

1. Start the app: `npm run dev` (runs on `http://localhost:3000`).
2. In another terminal: `ngrok http 3000`. Copy the `https://xxxx.ngrok-free.app` URL it gives you.
3. Back in the Meta dashboard: **WhatsApp → Configuration → Webhook → Edit**.
   - Callback URL: `https://xxxx.ngrok-free.app/api/whatsapp/webhook`
   - Verify token: the same string you put in `WHATSAPP_VERIFY_TOKEN`
   - Click **Verify and save** (this hits the `GET` handler in
     `app/api/whatsapp/webhook/route.ts`).
4. Click **Manage** next to webhook fields and subscribe to `messages`.

Now send "hi" from your phone to the test number shown in the Meta
dashboard — you should get the welcome menu back.

> **24-hour window gotcha:** free-form text (which is all this bot sends)
> only works within 24 hours of the patient's last message to you. If you
> (or the bot) try to message someone who hasn't texted in the last 24h,
> Meta rejects it — you'd need a pre-approved template message instead.
> This doesn't affect the normal booking flow (the patient always messages
> first), but keep it in mind if you build reminders later.

### Getting a permanent token (before going live)

Temporary tokens expire in ~24 hours. For anything beyond testing:
[business.facebook.com/latest/settings](https://business.facebook.com/latest/settings)
→ **System users** → **Add** → create one → **Assign assets** (toggle
"Manage app" for this app, "Manage WhatsApp Business accounts" for your
WABA) → **Generate token**, requesting `whatsapp_business_messaging` and
`whatsapp_business_management`. Swap that token into `WHATSAPP_TOKEN` — it
doesn't expire.

To message anyone (not just the 5 verified test recipients), you need to
add a real business phone number to your WhatsApp Business Account and
complete Meta's **Business Verification** — a bit more paperwork, only
needed once you're ready to go live with real patients.

---

## 5. Google Calendar + Sheets — Service Account

Using a service account (instead of OAuth login) means the bot can write to
the calendar/sheet in the background with no human needing to click
"Allow" each time.

1. Go to [console.cloud.google.com](https://console.cloud.google.com) →
   create a new project (or reuse one).
2. **APIs & Services → Library** → enable **Google Calendar API** and
   **Google Sheets API**.
3. **APIs & Services → Credentials → Create Credentials → Service account**.
   Give it any name (e.g. `booking-bot`). No special roles needed.
4. Open the new service account → **Keys → Add key → Create new key → JSON**.
   A JSON file downloads.
5. Open that JSON file. Copy:
   - `client_email` → `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - `private_key` → `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` (keep the quotes
     and the `\n` sequences exactly as they appear in the JSON file — do
     not turn them into real line breaks).

### Calendar

1. In Google Calendar, create a new calendar (or use an existing one) for
   the doctor's appointments.
2. **Settings and sharing** for that calendar → **Share with specific
   people** → add the service account's email (from step above) with
   **"Make changes to events"** permission.
3. Scroll down to **Integrate calendar** → copy the **Calendar ID**
   (looks like `abc123@group.calendar.google.com`) into `GOOGLE_CALENDAR_ID`.

### Sheet

1. Create a new Google Sheet (any name, e.g. "Appointments Log").
2. Click **Share** → add the service account email as **Editor**.
3. Copy the ID from the URL: `https://docs.google.com/spreadsheets/d/THIS_PART/edit` → `GOOGLE_SHEET_ID`.
4. Run this once to create the header row automatically:

   ```bash
   npx tsx -e "import('./lib/sheets').then(m => m.ensureSheetHeaders())"
   ```

   (Or just add the header row yourself: Appointment ID, Client Name,
   Client Phone, Start Time, End Time, Status, Notes, Created At.)

---

## 6. Doctor / clinic details

In `.env`, set:

```
DOCTOR_NAME="Dr. Jane Smith"
CLINIC_NAME="Sunrise Family Clinic"
```

The `/`, `/patients`, and `/schedule` dashboard pages are open
(no login) — anyone with the URL can view and manage bookings. If you need
to restrict access, put the deployment behind your host's own access
control (e.g. Vercel Deployment Protection) rather than an app-level
password.

---

## 7. Run it

```bash
npm run dev
```

- `http://localhost:3000` — appointments dashboard
- `http://localhost:3000/api/whatsapp/webhook` — the endpoint Meta calls

Try the full flow from your phone:

- Text **"hi"** → menu
- Text **"book"** → asks for patient name → shows open slots → pick a
  number → confirmed. Both the patient and the number in
  `DOCTOR_WHATSAPP_NUMBER` get a WhatsApp confirmation, a Google Calendar
  event appears, and a row is appended to the Google Sheet.
- Text **"cancel"** → pick which appointment → cancelled everywhere, other
  party notified.
- As the doctor number, text **"today"** or **"week"** to see the
  schedule, or **"cancel"** to cancel any upcoming appointment.

---

## 8. Deploying (Vercel)

1. Push this project to a GitHub repo.
2. [vercel.com](https://vercel.com) → **New Project** → import the repo.
3. Add every variable from `.env` as a Vercel Environment Variable (Project
   → Settings → Environment Variables). For
   `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`, paste it exactly as it is in
   `.env`, `\n` sequences and all.
4. Deploy. Vercel gives you a permanent HTTPS URL.
5. Back in Meta's dashboard, update the webhook Callback URL to
   `https://your-app.vercel.app/api/whatsapp/webhook` (same verify token as
   before) and re-verify.

Nothing else to run — the Supabase tables already exist from step 3, and
the same project/tables are used in both local dev and production unless
you point `NEXT_PUBLIC_SUPABASE_URL` at a different Supabase project.

---

## Adjusting business rules

Everything about working hours, appointment length, and how many slots to
offer lives in `lib/config.ts`:

```ts
export const WORKING_HOURS = { startHour: 9, endHour: 17, closedDays: [0, 6] };
export const SLOT_MINUTES = 30;
export const BOOKING_WINDOW_DAYS = 7;
```

## Project structure

```
app/
  api/whatsapp/webhook/route.ts   Meta webhook (GET verify, POST messages)
  (dashboard)/layout.tsx          Shared top nav + sidebar chrome
  (dashboard)/page.tsx            Appointments dashboard, served at "/"
  (dashboard)/patients/           Patient directory (grouped by phone)
  (dashboard)/schedule/           Day-grouped upcoming agenda
  globals.css                     Design tokens + shared dashboard styles
components/
  Logo.tsx / TopNav.tsx / Sidebar.tsx / ThemeToggle.tsx
lib/
  bookingBot.ts                   Conversation state machine (client + doctor)
  appointments.ts                 create/cancel appointment side effects
  availability.ts                 Computes open slots (DB + Calendar busy times)
  whatsapp.ts                     WhatsApp Cloud API send + webhook parsing
  calendar.ts / sheets.ts         Google API wrappers
  supabaseAdmin.ts                Server-only Supabase client (service_role key)
  db/appointments.ts              Typed CRUD helpers for the appointments table
  db/chatSessions.ts              Per-phone conversation state, stored in DB
  config.ts                       Business rules (hours, slot length, names)
supabase/schema.sql               Run once in the Supabase SQL Editor
```

## Extending

- **Multiple doctors**: add a `Doctor` model, have the bot ask which
  doctor first, and scope `availability.ts` / calendar/sheet IDs per
  doctor.
- **Reminders**: add a scheduled job (e.g. Vercel Cron) that queries
  appointments starting in ~24h and sends a WhatsApp reminder.
- **Richer WhatsApp UI**: swap the numbered-list text prompts for WhatsApp
  interactive list/button messages (`lib/whatsapp.ts` has a spot to add
  `sendInteractiveList`).
