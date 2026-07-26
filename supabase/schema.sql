-- Run this once in the Supabase SQL Editor (Dashboard -> SQL Editor -> New
-- query -> paste -> Run). Creates the two tables the booking bot needs.
-- No Prisma / connection string required.

create extension if not exists pgcrypto;

create table if not exists appointments (
  id              uuid primary key default gen_random_uuid(),
  client_name     text not null,
  client_phone    text not null,
  start_time      timestamptz not null,
  end_time        timestamptz not null,
  status          text not null default 'CONFIRMED' check (status in ('CONFIRMED', 'CANCELLED')),
  notes           text,
  google_event_id text,
  cancelled_by    text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists appointments_client_phone_idx on appointments (client_phone);
create index if not exists appointments_start_time_idx on appointments (start_time);
create index if not exists appointments_status_idx on appointments (status);

-- Hard stop against double-booking: no two CONFIRMED appointments may
-- share the same start_time. The app also checks availability before
-- inserting (for a friendly "that slot was just taken" message), but that
-- check-then-insert has a small race window under concurrent bookings —
-- this unique index is what actually guarantees it can never happen, by
-- rejecting the second insert outright.
create unique index if not exists appointments_unique_confirmed_start
  on appointments (start_time)
  where status = 'CONFIRMED';

-- Per-phone-number WhatsApp conversation state for the booking bot.
create table if not exists chat_sessions (
  id         uuid primary key default gen_random_uuid(),
  phone      text unique not null,
  step       text not null default 'IDLE',
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Keep updated_at current on every update, mirroring what Prisma's
-- @updatedAt would have done.
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists appointments_set_updated_at on appointments;
create trigger appointments_set_updated_at
  before update on appointments
  for each row execute procedure set_updated_at();

drop trigger if exists chat_sessions_set_updated_at on chat_sessions;
create trigger chat_sessions_set_updated_at
  before update on chat_sessions
  for each row execute procedure set_updated_at();

-- Row Level Security: enabled by default with no policies, which blocks
-- every request made with the anon/publishable key. This app never uses
-- that key — the Next.js server talks to Supabase with the secret
-- service_role key (see README), which always bypasses RLS. Leaving RLS
-- enabled with no policies is intentional: it guarantees the tables stay
-- unreachable from the browser even if a key were ever leaked client-side.
alter table appointments enable row level security;
alter table chat_sessions enable row level security;
