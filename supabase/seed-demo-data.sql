-- Demo/test data for the Schedule and Patients pages — NOT real patients.
-- Run once in the Supabase SQL Editor (Dashboard -> SQL Editor -> New query
-- -> paste -> Run) against a project that already has schema.sql applied.
--
-- Covers, across the clinic's real working days (Tue-Fri, since
-- WORKING_HOURS.closedDays in lib/config.ts closes Sat/Sun):
--   Jul 28 (Tue) — one particular time slot taken (11:00-11:30, COMPLETED
--                  with a full prescription incl. photo + signed slip) and
--                  one same-day cancellation (16:00), rest of the day open.
--   Jul 29 (Wed) — afternoon booked / morning open: two already-past slots
--                  (COMPLETED — one with no prescription on file, to show
--                  the "no prescription recorded" empty state; one with
--                  notes only, no photo/slip), plus three CONFIRMED slots
--                  later in the day.
--   Jul 30 (Thu) — morning booked / afternoon+evening open: three CONFIRMED
--                  slots and one CANCELLED slot mixed in.
--   Jul 31 (Fri) — left with zero rows on purpose: a fully open day.
--   Aug 1-2 (Sat/Sun) — intentionally no rows; the clinic is configured
--                  closed those days, so "not available" there is real
--                  (config-driven), not faked appointment data.
--
-- All times below are timestamptz literals in IST (+05:30) so they land on
-- the intended clinic-local date/time regardless of your database's
-- session timezone.
--
-- Re-running this script is safe — fixed ids + ON CONFLICT DO NOTHING mean
-- it won't create duplicates. To remove this demo data later, run:
--   delete from appointments where id::text like 'a0000000-0000-0000-0000-%'
--      or id::text like 'b0000000-0000-0000-0000-%'
--      or id::text like 'c0000000-0000-0000-0000-%';

insert into appointments (
  id, client_name, client_phone, start_time, end_time, status, notes,
  cancelled_by, cancellation_reason,
  prescription_notes, prescription_photo_url, prescription_slip_url, completed_at,
  created_at, updated_at
) values

-- Jul 28 (Tue) — particular-time-taken day
(
  'a0000000-0000-0000-0000-000000000001', 'Asha Rao', '919810000001',
  '2026-07-28 11:00:00+05:30', '2026-07-28 11:30:00+05:30', 'COMPLETED',
  'Follow-up for hypertension.', null, null,
  'Continue Telmisartan 40mg once daily. BP well controlled at 128/82. Review in 4 weeks.',
  'https://images.unsplash.com/photo-1584017911766-d451b3d0e843?w=600',
  'https://example-storage.supabase.co/storage/v1/object/public/prescriptions/a1-slip.pdf',
  '2026-07-28 11:35:00+05:30',
  '2026-07-25 09:00:00+05:30', '2026-07-28 11:35:00+05:30'
),
(
  'a0000000-0000-0000-0000-000000000002', 'Sunita Verma', '919810000010',
  '2026-07-28 16:00:00+05:30', '2026-07-28 16:30:00+05:30', 'CANCELLED',
  null, 'DOCTOR', 'Doctor unavailable due to emergency.',
  null, null, null, null,
  '2026-07-26 09:00:00+05:30', '2026-07-28 08:00:00+05:30'
),

-- Jul 29 (Wed) — afternoon booked, morning open
(
  'b0000000-0000-0000-0000-000000000001', 'Vikram Iyer', '919810000002',
  '2026-07-29 13:00:00+05:30', '2026-07-29 13:30:00+05:30', 'COMPLETED',
  'Routine checkup.', null, null,
  null, null, null,
  '2026-07-29 13:35:00+05:30',
  '2026-07-27 10:00:00+05:30', '2026-07-29 13:35:00+05:30'
),
(
  'b0000000-0000-0000-0000-000000000002', 'Priya Nair', '919810000003',
  '2026-07-29 14:30:00+05:30', '2026-07-29 15:00:00+05:30', 'COMPLETED',
  'Mild hypotension complaint.', null, null,
  'Continue Amlodipine 5mg once daily. Stay hydrated. Review in 2 weeks.',
  null, null,
  '2026-07-29 15:05:00+05:30',
  '2026-07-27 11:00:00+05:30', '2026-07-29 15:05:00+05:30'
),
(
  'b0000000-0000-0000-0000-000000000003', 'Rakesh Kumar', '919810000004',
  '2026-07-29 16:30:00+05:30', '2026-07-29 17:00:00+05:30', 'CONFIRMED',
  null, null, null,
  null, null, null, null,
  '2026-07-26 09:00:00+05:30', '2026-07-26 09:00:00+05:30'
),
(
  'b0000000-0000-0000-0000-000000000004', 'Karan Mehta', '919810000005',
  '2026-07-29 17:30:00+05:30', '2026-07-29 18:00:00+05:30', 'CONFIRMED',
  null, null, null,
  null, null, null, null,
  '2026-07-26 09:30:00+05:30', '2026-07-26 09:30:00+05:30'
),
(
  'b0000000-0000-0000-0000-000000000005', 'Meera Joshi', '919810000006',
  '2026-07-29 19:00:00+05:30', '2026-07-29 19:30:00+05:30', 'CONFIRMED',
  null, null, null,
  null, null, null, null,
  '2026-07-26 10:00:00+05:30', '2026-07-26 10:00:00+05:30'
),

-- Jul 30 (Thu) — morning booked, afternoon/evening open
(
  'c0000000-0000-0000-0000-000000000001', 'Asha Rao', '919810000001',
  '2026-07-30 10:00:00+05:30', '2026-07-30 10:30:00+05:30', 'CONFIRMED',
  'Follow-up review.', null, null,
  null, null, null, null,
  '2026-07-28 11:40:00+05:30', '2026-07-28 11:40:00+05:30'
),
(
  'c0000000-0000-0000-0000-000000000002', 'Rohan Das', '919810000007',
  '2026-07-30 10:30:00+05:30', '2026-07-30 11:00:00+05:30', 'CANCELLED',
  null, 'CLIENT', 'Feeling better, no longer needed.',
  null, null, null, null,
  '2026-07-27 12:00:00+05:30', '2026-07-29 09:00:00+05:30'
),
(
  'c0000000-0000-0000-0000-000000000003', 'Neha Kapoor', '919810000008',
  '2026-07-30 11:30:00+05:30', '2026-07-30 12:00:00+05:30', 'CONFIRMED',
  null, null, null,
  null, null, null, null,
  '2026-07-27 13:00:00+05:30', '2026-07-27 13:00:00+05:30'
),
(
  'c0000000-0000-0000-0000-000000000004', 'Deepak Shah', '919810000009',
  '2026-07-30 12:30:00+05:30', '2026-07-30 13:00:00+05:30', 'CONFIRMED',
  null, null, null,
  null, null, null, null,
  '2026-07-27 14:00:00+05:30', '2026-07-27 14:00:00+05:30'
)

on conflict (id) do nothing;
