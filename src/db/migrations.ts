/**
 * Migrations are embedded rather than read from disk so the compiled function
 * bundle cannot miss a .sql file. Each entry is applied once, in order, inside
 * a transaction, and recorded in `schema_migrations`.
 */
export interface Migration {
  version: string;
  /**
   * Data statements that must run before `sql` and whose affected row count is
   * worth logging (for example a reclassification). They run in the same
   * transaction, before the schema change.
   */
  logged?: Array<{ label: string; sql: string }>;
  sql: string;
}

export const MIGRATIONS: Migration[] = [
  {
    version: '0001_init',
    sql: `
create table ministries (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index ministries_code_ci on ministries (lower(code));

create table members (
  id uuid primary key default gen_random_uuid(),
  member_no text not null,
  first_name text,
  last_name text,
  other_names text,
  maiden_name text,
  alias text,
  dob date,
  gender text not null default 'undisclosed'
    check (gender in ('male', 'female', 'other', 'undisclosed')),
  place_of_residence text,
  address_line text,
  joined_on date,
  archived_at timestamptz,
  purged_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text not null,
  updated_by text not null
);
create unique index members_member_no_ci on members (lower(member_no));
create index members_joined_on on members (joined_on);

create table member_contacts (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  kind text not null check (kind in ('phone', 'email', 'whatsapp')),
  value text not null,
  normalized_value text not null,
  display_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index member_contacts_value on member_contacts (normalized_value);
create unique index member_contacts_order on member_contacts (member_id, display_order);
create index member_contacts_member on member_contacts (member_id);

-- A dependent "having" the guardian's number links to it instead of copying it.
create table member_contact_links (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  contact_id uuid not null references member_contacts(id) on delete cascade,
  display_order integer not null,
  created_at timestamptz not null default now(),
  unique (member_id, contact_id)
);

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('life_insurance', 'credit_union')),
  policyholder_member_id uuid not null references members(id),
  scope text not null check (scope in ('individual', 'household')),
  status text not null default 'active' check (status in ('active', 'ended')),
  reference text,
  started_on date not null,
  ended_on date,
  created_at timestamptz not null default now(),
  created_by text not null
);
create index subscriptions_policyholder on subscriptions (policyholder_member_id);

create table subscription_coverage (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references subscriptions(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  added_on date not null,
  removed_on date,
  created_at timestamptz not null default now()
);
create unique index subscription_coverage_active
  on subscription_coverage (subscription_id, member_id)
  where removed_on is null;
create index subscription_coverage_member on subscription_coverage (member_id);

create table member_ministries (
  member_id uuid not null references members(id) on delete cascade,
  ministry_id uuid not null references ministries(id),
  assigned_on date not null default current_date,
  primary key (member_id, ministry_id)
);

create table member_relationships (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  related_member_id uuid not null references members(id) on delete cascade,
  type text not null check (type in ('spouse', 'parent', 'child', 'guardian', 'other')),
  is_dependent boolean not null default false,
  created_at timestamptz not null default now(),
  created_by text not null,
  check (member_id <> related_member_id)
);
-- One edge per pair, regardless of which side declared it.
create unique index member_relationships_pair
  on member_relationships (least(member_id, related_member_id), greatest(member_id, related_member_id), type);
-- At most one spouse edge per member, on either side.
create unique index member_relationships_spouse_left
  on member_relationships (member_id) where type = 'spouse';
create unique index member_relationships_spouse_right
  on member_relationships (related_member_id) where type = 'spouse';

create table import_batches (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('events', 'attendance')),
  actor text not null,
  row_count integer not null,
  checksum text not null,
  created_at timestamptz not null default now()
);

create table event_series (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  ministry_id uuid references ministries(id),
  timezone text not null default 'Africa/Lagos',
  description text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text not null,
  updated_by text not null
);
create unique index event_series_name_ministry
  on event_series (lower(name), coalesce(ministry_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where archived_at is null;

create table series_schedules (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references event_series(id) on delete cascade,
  effective_from date not null,
  rrule text not null,
  ends_on date,
  created_at timestamptz not null default now(),
  created_by text not null,
  unique (series_id, effective_from),
  check (ends_on is null or ends_on >= effective_from)
);
create index series_schedules_series on series_schedules (series_id, effective_from);

create table series_exceptions (
  series_id uuid not null references event_series(id) on delete cascade,
  occurs_on date not null,
  kind text not null check (kind in ('cancelled', 'extra')),
  note text,
  created_at timestamptz not null default now(),
  created_by text not null,
  primary key (series_id, occurs_on)
);

create table event_occurrences (
  series_id uuid not null references event_series(id) on delete cascade,
  occurs_on date not null,
  event_no text,
  ministry_name text,
  import_batch_id uuid references import_batches(id),
  created_at timestamptz not null default now(),
  primary key (series_id, occurs_on)
);
create unique index event_occurrences_event_no
  on event_occurrences (event_no) where event_no is not null;

create table attendance (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  series_id uuid not null references event_series(id),
  occurs_on date not null,
  source text not null check (source in ('import', 'manual')),
  import_batch_id uuid references import_batches(id),
  created_at timestamptz not null default now(),
  created_by text not null,
  unique (member_id, series_id, occurs_on)
);
create index attendance_member on attendance (member_id, series_id);
create index attendance_series on attendance (series_id, occurs_on);

-- Deleting an imported row must survive the next import of the same file.
create table attendance_suppressions (
  member_id uuid not null references members(id) on delete cascade,
  series_id uuid not null references event_series(id) on delete cascade,
  occurs_on date not null,
  suppressed_at timestamptz not null default now(),
  suppressed_by text not null,
  primary key (member_id, series_id, occurs_on)
);
`,
  },
  {
    version: '0002_seed_ministries',
    sql: `
insert into ministries (code, name, description) values
  ('PEMEM',  'PEMEM',            'Pentecost Men''s Ministry'),
  ('WOMEN',  'Women''s Ministry', 'Women''s Ministry'),
  ('CHOIR',  'Choir',            'Choir'),
  ('PRAYER', 'Prayer',           'Prayer Ministry')
on conflict do nothing;
`,
  },
  {
    version: '0003_shepherding',
    sql: `
alter table members add column is_presbyter boolean not null default false;
create index members_presbyter on members (member_no) where is_presbyter;

-- UTC is the backend default; an explicit per-series timezone remains allowed.
alter table event_series alter column timezone set default 'UTC';
alter table member_ministries alter column assigned_on set default ((now() at time zone 'UTC')::date);

create table shepherding_assignments (
  id uuid primary key default gen_random_uuid(),
  officer_member_id uuid not null references members(id),
  member_id uuid not null references members(id),
  assigned_on date not null,
  ended_on date,
  assigned_by text not null,
  ended_by text,
  reason text,
  ended_reason text,
  created_at timestamptz not null default now(),
  check (officer_member_id <> member_id),
  check (ended_on is null or ended_on >= assigned_on)
);
-- One active shepherd per member; an officer may hold any number.
create unique index shepherding_assignments_active_member
  on shepherding_assignments (member_id) where ended_on is null;
create index shepherding_assignments_officer
  on shepherding_assignments (officer_member_id) where ended_on is null;
create index shepherding_assignments_history
  on shepherding_assignments (member_id, assigned_on desc);

-- Append-only: there is deliberately no update or delete path for a call.
create table shepherding_calls (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references shepherding_assignments(id) on delete cascade,
  called_on date not null,
  outcome text not null check (outcome in ('reached', 'no_answer', 'wrong_number')),
  still_in_church text not null default 'unknown'
    check (still_in_church in ('yes', 'no', 'unknown')),
  feedback text,
  issue text,
  recorded_by text not null,
  created_at timestamptz not null default now()
);
create index shepherding_calls_assignment on shepherding_calls (assignment_id, called_on desc);
create index shepherding_calls_called_on on shepherding_calls (called_on);
`,
  },
  {
    version: '0004_session_gateway',
    sql: `
create table officers (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text not null,
  actor_id text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index officers_email_ci on officers (lower(email));
create unique index officers_actor_ci on officers (lower(actor_id));

create table auth_magic_links (
  id uuid primary key default gen_random_uuid(),
  officer_id uuid not null references officers(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index auth_magic_links_officer on auth_magic_links (officer_id, created_at desc);

create table auth_sessions (
  id uuid primary key default gen_random_uuid(),
  officer_id uuid not null references officers(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  absolute_expires_at timestamptz not null,
  last_used_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (absolute_expires_at >= expires_at)
);
create index auth_sessions_officer on auth_sessions (officer_id, created_at desc);

-- Fixed-window counters. The primary key is the subject (email:<address> or ip:<addr>).
create table auth_rate_limits (
  key text primary key,
  window_start timestamptz not null default now(),
  count integer not null default 0
);
create index auth_rate_limits_window on auth_rate_limits (window_start);
`,
  },
  {
    version: '0005_event_instances',
    sql: `
-- Mint event instances for attendance/suppression keys that have no occurrence row,
-- while the old (series_id, occurs_on) primary key still exists as a conflict target.
insert into event_occurrences (series_id, occurs_on)
select distinct a.series_id, a.occurs_on from attendance a
where not exists (
  select 1 from event_occurrences e where e.series_id = a.series_id and e.occurs_on = a.occurs_on
)
on conflict (series_id, occurs_on) do nothing;

insert into event_occurrences (series_id, occurs_on)
select distinct s.series_id, s.occurs_on from attendance_suppressions s
where not exists (
  select 1 from event_occurrences e where e.series_id = s.series_id and e.occurs_on = s.occurs_on
)
on conflict (series_id, occurs_on) do nothing;

-- Stable id; move the primary key off (series_id, occurs_on).
alter table event_occurrences add column id uuid default gen_random_uuid();
update event_occurrences set id = gen_random_uuid() where id is null;
alter table event_occurrences alter column id set not null;
alter table event_occurrences drop constraint event_occurrences_pkey;
alter table event_occurrences add primary key (id);

-- Event-instance columns.
alter table event_occurrences
  alter column series_id drop not null,
  add column name text,
  add column timezone text not null default 'UTC',
  add column start_date date,
  add column end_date date,
  add column start_time text,
  add column end_time text,
  add column venue_type text not null default 'auditorium',
  add column venue_name text,
  add column description text,
  add column status text not null default 'scheduled',
  add column source text not null default 'series',
  add column sessions jsonb not null default '[]'::jsonb;

update event_occurrences e
set name = coalesce(e.name, s.name),
    timezone = coalesce(s.timezone, 'UTC'),
    start_date = e.occurs_on,
    end_date = e.occurs_on,
    sessions = jsonb_build_array(jsonb_build_object(
      'date', e.occurs_on,
      'startTime', null,
      'endTime', null,
      'status', 'scheduled'
    ))
from event_series s
where s.id = e.series_id;

alter table event_occurrences
  alter column start_date set not null,
  alter column end_date set not null;

-- Attendance → event instance + session date.
alter table attendance add column event_instance_id uuid;
alter table attendance add column session_date date;
update attendance a
set event_instance_id = e.id, session_date = a.occurs_on
from event_occurrences e
where e.series_id = a.series_id and e.occurs_on = a.occurs_on;
alter table attendance alter column event_instance_id set not null;
alter table attendance alter column session_date set not null;
alter table attendance drop constraint attendance_member_id_series_id_occurs_on_key;
alter table attendance drop column series_id;
alter table attendance drop column occurs_on;
alter table attendance add unique (event_instance_id, session_date, member_id);
alter table attendance add foreign key (event_instance_id) references event_occurrences(id) on delete cascade;
create index attendance_member on attendance (member_id);

-- Suppressions → event instance + session date.
alter table attendance_suppressions add column event_instance_id uuid;
alter table attendance_suppressions add column session_date date;
update attendance_suppressions s
set event_instance_id = e.id, session_date = s.occurs_on
from event_occurrences e
where e.series_id = s.series_id and e.occurs_on = s.occurs_on;
alter table attendance_suppressions alter column event_instance_id set not null;
alter table attendance_suppressions alter column session_date set not null;
alter table attendance_suppressions drop constraint attendance_suppressions_pkey;
alter table attendance_suppressions drop column series_id;
alter table attendance_suppressions drop column occurs_on;
alter table attendance_suppressions add primary key (member_id, event_instance_id, session_date);
alter table attendance_suppressions add foreign key (event_instance_id) references event_occurrences(id) on delete cascade;

-- Series idempotency key and indexes, then rename in place.
alter table event_occurrences drop column occurs_on;
drop index event_occurrences_event_no;
create unique index event_instances_event_no on event_occurrences (event_no) where event_no is not null;
create unique index event_instances_series_date on event_occurrences (series_id, start_date);
create index event_instances_series on event_occurrences (series_id, start_date);

alter table event_occurrences rename to event_instances;
`,
  },
  {
    version: '0006_attendance_session_guard',
    sql: `
-- Backstop for a direct write: a session date must be one of the event's sessions.
create function attendance_session_guard() returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1
    from event_instances e
    cross join lateral jsonb_array_elements(e.sessions) session
    where e.id = new.event_instance_id
      and (session->>'date')::date = new.session_date
  ) then
    raise exception
      'Attendance session date % is not one of the sessions of event instance %',
      new.session_date, new.event_instance_id
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger attendance_session_guard
before insert or update of event_instance_id, session_date on attendance
for each row execute function attendance_session_guard();
`,
  },
  {
    version: '0007_event_no_counters',
    sql: `
-- Per-year counter behind generated event numbers (EVT-<year>-<NNN>).
create table event_no_counters (
  year integer primary key,
  last_value integer not null
);

-- Start each year from the highest number already in use, ignoring other formats.
insert into event_no_counters (year, last_value)
select (regexp_match(event_no, '^EVT-([0-9]{4})-[0-9]+$'))[1]::int as year,
       max(regexp_replace(event_no, '^EVT-[0-9]{4}-', '')::int) as last_value
from event_instances
where event_no ~ '^EVT-[0-9]{4}-[0-9]+$'
group by 1
on conflict (year) do nothing;
`,
  },
  {
    version: '0008_import_kind_members',
    sql: `
-- V2 has exactly two imports: members and attendance. Legacy event-list
-- batches stay readable because 'events' remains allowed.
alter table import_batches drop constraint if exists import_batches_kind_check;
alter table import_batches add constraint import_batches_kind_check
  check (kind in ('events', 'members', 'attendance'));
`,
  },
  {
    version: '0009_attendance_import_occurrence',
    sql: `
-- The clock time the register carried, when the source supplied one. A manual
-- entry and a date-only import row leave it null; the event session's own
-- startTime stays untouched.
alter table attendance add column session_time time;

-- An attendance batch targets one occurrence. Legacy batches stay null; there
-- is deliberately no unique index on the checksum because historical batches
-- may legitimately share one and audit rows are never rewritten.
alter table import_batches
  add column event_instance_id uuid references event_instances(id),
  add column session_date date,
  add column written_count integer,
  add column skipped_count integer;
`,
  },
  {
    version: '0010_offerings_core',
    sql: `
-- An offering is archived by flag, never deleted, and its appeal is versioned.
create table offerings (
  id uuid primary key default gen_random_uuid(),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);

-- A published version is immutable; a change publishes the next version.
create table offering_terms (
  offering_id uuid not null references offerings(id),
  version integer not null check (version > 0),
  name text,
  purpose text not null,
  kind text not null check (kind in ('freewill', 'tithe', 'pledge', 'building', 'missions', 'other')),
  currency text not null,
  target_minor bigint,
  default_amount_minor bigint,
  starts_on date,
  ends_on date,
  available_until date,
  scripture text,
  gateway_account text,
  gateway_metadata jsonb,
  reason text,
  created_at timestamptz not null default now(),
  created_by text not null,
  primary key (offering_id, version)
);

-- One attachment targets exactly one of an event instance or a series. Detaching
-- sets detached_on and keeps the row for history.
create table event_instance_offerings (
  id uuid primary key default gen_random_uuid(),
  event_instance_id uuid references event_instances(id),
  series_id uuid references event_series(id),
  offering_id uuid not null references offerings(id),
  available_until date,
  attached_on timestamptz not null default now(),
  attached_by text not null,
  detached_on timestamptz,
  detached_by text,
  check ((event_instance_id is null) <> (series_id is null))
);
create unique index event_instance_offerings_active_event
  on event_instance_offerings (offering_id, event_instance_id)
  where detached_on is null and event_instance_id is not null;
create unique index event_instance_offerings_active_series
  on event_instance_offerings (offering_id, series_id)
  where detached_on is null and series_id is not null;

-- Append-only: the newest row per (attachment_id, date) is the effective exception.
create table offering_exceptions (
  id uuid primary key default gen_random_uuid(),
  attachment_id uuid not null references event_instance_offerings(id),
  date date not null,
  kind text not null check (kind in ('skip', 'opt_in')),
  note text,
  created_at timestamptz not null default now(),
  created_by text not null
);
create index offering_exceptions_lookup
  on offering_exceptions (attachment_id, date, created_at desc);
`,
  },
  {
    version: '0011_contributions',
    sql: `
-- A gift is append-only: exactly one giver (member or visitor) and the terms
-- version it was made under. Visitor gifts keep only a phone hash.
create table contributions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references members(id),
  visitor_name text,
  visitor_phone_hash text,
  offering_id uuid not null references offerings(id),
  event_instance_id uuid not null references event_instances(id),
  session_date date not null,
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null,
  channel text not null check (channel in ('app', 'ussd', 'manual')),
  status text not null check (status in ('initiated', 'paid', 'failed')),
  reference text not null unique,
  idempotency_key text not null unique,
  terms_version integer not null,
  created_at timestamptz not null default now(),
  created_by text not null,
  check ((member_id is null) <> (visitor_name is null)),
  check ((member_id is null) = (visitor_phone_hash is not null)),
  foreign key (offering_id, terms_version) references offering_terms (offering_id, version)
);
create index contributions_session_page
  on contributions (session_date, created_at desc, id desc);
create index contributions_cursor on contributions (created_at desc, id desc);
create index contributions_member on contributions (member_id);
`,
  },
  {
    version: '0012_pledges',
    // A pledge is a payment mode, not an offering kind. Reclassify (never
    // delete) existing rows before the check drops the value.
    logged: [
      {
        label: 'offering_terms kind pledge reclassified to other',
        sql: `
with reclassified as (
  update offering_terms set kind = 'other' where kind = 'pledge' returning 1
)
select count(*)::int as count from reclassified`,
      },
    ],
    sql: `
-- A pledge always targets an existing offering attached to the event. It is
-- append-only; honor, dishonor and reassignment are pledge_events rows.
create table pledges (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id),
  offering_id uuid not null references offerings(id),
  event_instance_id uuid not null references event_instances(id),
  session_date date,
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null,
  expected_on date not null,
  officer_member_id uuid not null references members(id),
  status text not null check (status in ('pending', 'honored', 'dishonored')),
  reason text,
  terms_version integer not null,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  created_by text not null,
  foreign key (offering_id, terms_version) references offering_terms (offering_id, version)
);
create index pledges_expected_page on pledges (expected_on, created_at desc, id desc);
create index pledges_cursor on pledges (created_at desc, id desc);
create index pledges_member on pledges (member_id);
create index pledges_officer on pledges (officer_member_id);

-- Append-only transitions; the from and to officers are set on a reassignment.
create table pledge_events (
  id uuid primary key default gen_random_uuid(),
  pledge_id uuid not null references pledges(id),
  kind text not null check (kind in ('created', 'honored', 'dishonored', 'reassigned')),
  actor text not null,
  reason text,
  from_officer_member_id uuid references members(id),
  to_officer_member_id uuid references members(id),
  at timestamptz not null default now()
);
create index pledge_events_pledge on pledge_events (pledge_id, at desc, id desc);

-- Reminder records; delivery is out of scope in V1. An auto-created date that
-- is already past is written cancelled and never sent.
create table reminders (
  id uuid primary key default gen_random_uuid(),
  pledge_id uuid not null references pledges(id),
  scheduled_for date not null,
  channel text not null check (channel in ('sms', 'whatsapp', 'ussd', 'email')),
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed', 'cancelled')),
  sent_at timestamptz,
  unique (pledge_id, scheduled_for, channel)
);
create index reminders_pledge on reminders (pledge_id, scheduled_for desc, id desc);

-- A pledge is a payment mode on an existing offering, never an offering kind.
alter table offering_terms drop constraint if exists offering_terms_kind_check;
alter table offering_terms add constraint offering_terms_kind_check
  check (kind in ('freewill', 'tithe', 'building', 'missions', 'other'));
`,
  },
  {
    version: '0013_ussd_core',
    sql: `
-- A USSD session stores only the HMAC phone hash, never the raw MSISDN.
create table ussd_sessions (
  id uuid primary key default gen_random_uuid(),
  phone_hash text not null,
  member_id uuid references members(id),
  anonymous boolean not null,
  state text not null,
  context jsonb not null default '{}'::jsonb,
  last_input_seq integer not null default 0,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ussd_sessions_phone_hash on ussd_sessions (phone_hash);
create index ussd_sessions_expires_at on ussd_sessions (expires_at);

-- Replay guard for the aggregator HMAC; rows are pruned after ten minutes.
create table ussd_nonces (
  nonce text primary key,
  seen_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index ussd_nonces_expires_at on ussd_nonces (expires_at);

-- One group is one gateway charge: one total, one currency, one idempotency key.
-- A pledge redemption group carries the pledge and is unique per pledge.
create table payment_groups (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  idempotency_key text not null unique,
  total_minor bigint not null check (total_minor > 0),
  currency text not null,
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'failed')),
  pledge_id uuid references pledges(id),
  created_at timestamptz not null default now(),
  created_by text not null
);
create unique index payment_groups_pledge
  on payment_groups (pledge_id)
  where pledge_id is not null;

-- One intent per group, keyed by the gateway reference.
create table payment_intents (
  id uuid primary key default gen_random_uuid(),
  payment_group_id uuid not null unique references payment_groups(id),
  gateway text not null,
  reference text not null unique,
  status text not null default 'initiated'
    check (status in ('initiated', 'paid', 'failed')),
  raw_callback_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table contributions add column payment_group_id uuid references payment_groups(id);
create index contributions_payment_group on contributions (payment_group_id);

alter table pledges add column settled_contribution_id uuid references contributions(id);
create unique index pledges_settled_contribution
  on pledges (settled_contribution_id)
  where settled_contribution_id is not null;
`,
  },
  {
    version: '0014_ussd_attendance',
    sql: `
-- A senior presbyter carries a rank; 1 is the most senior. The flag stays the
-- authority gate and clearing it clears the rank in the same write.
alter table members add column presbyter_rank integer;
alter table members add constraint members_presbyter_rank_positive
  check (presbyter_rank is null or presbyter_rank >= 1);
alter table members add constraint members_presbyter_rank_check
  check (presbyter_rank is null or is_presbyter);

-- Headcount-only events (FR-42) keep an operator count instead of per-member
-- attendance. The column precedes this round in the data model; the default
-- preserves every existing event as member-trackable.
alter table event_instances add column tracks_members boolean not null default true;

-- One-time six-digit codes. Only the HMAC-SHA-256 hash is stored.
create table attendance_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  purpose text not null check (purpose in ('attendance_punch', 'registration')),
  event_instance_id uuid not null references event_instances(id),
  session_date date not null,
  issued_by text not null,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by_member_id uuid references members(id),
  registration_request_id uuid,
  voided_at timestamptz,
  voided_by text
);
create index attendance_codes_session
  on attendance_codes (event_instance_id, session_date, purpose);
create index attendance_codes_expires_at on attendance_codes (expires_at);

-- An anonymous registration request carries only the phone hash. Approval is
-- the only path that creates a member.
create table registration_requests (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  first_name text not null,
  last_name text not null,
  phone_hash text not null,
  event_instance_id uuid not null references event_instances(id),
  session_date date not null,
  code_id uuid not null references attendance_codes(id),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  member_id uuid references members(id),
  reason text,
  created_at timestamptz not null default now(),
  decided_by text,
  decided_at timestamptz
);
create index registration_requests_page
  on registration_requests (status, created_at desc, id desc);
create index registration_requests_event
  on registration_requests (event_instance_id, session_date);

alter table attendance_codes add constraint attendance_codes_request_fk
  foreign key (registration_request_id) references registration_requests(id);

-- One active clocking delegation per event session. The grant ends with the
-- session; V3 leaves ended_at null and derives activity from the session date.
create table clocking_delegations (
  id uuid primary key default gen_random_uuid(),
  event_instance_id uuid not null references event_instances(id),
  session_date date not null,
  from_member_id uuid not null references members(id),
  to_member_id uuid not null references members(id),
  reason text not null,
  created_at timestamptz not null default now(),
  created_by text not null,
  ended_at timestamptz
);
create unique index clocking_delegations_active
  on clocking_delegations (event_instance_id, session_date)
  where ended_at is null;

-- The operator's expected headcount, separate from the register-derived count.
create table event_session_expected (
  event_instance_id uuid not null references event_instances(id),
  session_date date not null,
  male integer not null check (male between 0 and 10000),
  female integer not null check (female between 0 and 10000),
  children integer not null check (children between 0 and 10000),
  recorded_by text not null,
  recorded_at timestamptz not null default now(),
  primary key (event_instance_id, session_date),
  check (male + female + children <= 30000)
);
`,
  },
  {
    version: '0015_welfare_products',
    sql: `
-- Welfare becomes configured reference data: eligibility, payer and cover are
-- product rules evaluated server-side, never coded per subscription.
create table subscription_products (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  description text,
  premium_minor bigint not null check (premium_minor > 0),
  currency text not null,
  active boolean not null default true,
  payment_mode text not null check (payment_mode in ('member', 'church', 'either')),
  period_months integer not null check (period_months in (1, 2, 3, 6, 12)),
  covers text not null check (covers in ('individual', 'household')),
  max_dependents integer not null default 0 check (max_dependents >= 0),
  allowed_relationships text[] not null default '{}',
  min_membership_days integer not null default 0 check (min_membership_days >= 0),
  requires_card boolean not null default false,
  requires_verified boolean not null default false,
  gender text,
  min_age integer,
  max_age integer,
  created_by text not null,
  updated_by text,
  updated_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index subscription_products_code_ci on subscription_products (lower(code));

-- A product subscription leaves kind null; a legacy row keeps its kind and
-- leaves the product fields null. Exactly one of the two is always set.
alter table subscriptions drop constraint if exists subscriptions_kind_check;
alter table subscriptions alter column kind drop not null;
alter table subscriptions
  add column product_id uuid references subscription_products(id),
  add column paid_by text check (paid_by in ('member', 'church')),
  add column premium_minor bigint,
  add column period_start date,
  add column period_end date,
  add column updated_by text,
  add column updated_at timestamptz;
update subscriptions set updated_by = created_by, updated_at = created_at where updated_by is null;
alter table subscriptions add constraint subscriptions_kind_or_product
  check ((kind is null) <> (product_id is null));

-- One row per paid cover period; the period itself is the natural key.
create table subscription_payments (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references subscriptions(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null,
  channel text not null check (channel in ('app', 'ussd', 'manual')),
  reference text not null,
  paid_at timestamptz not null default now(),
  recorded_by text not null,
  idempotency_key text not null,
  created_at timestamptz not null default now()
);
create unique index subscription_payments_period
  on subscription_payments (subscription_id, period_start);
create unique index subscription_payments_reference
  on subscription_payments (reference);
create unique index subscription_payments_idempotency
  on subscription_payments (idempotency_key);

-- Claims are records, not payouts. A decision is append-only in practice (no
-- route rewrites history) and the status machine is enforced by the repository.
create table subscription_claims (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references subscriptions(id) on delete cascade,
  member_id uuid not null references members(id),
  amount_minor bigint not null check (amount_minor > 0),
  reason text not null,
  status text not null check (status in ('pending', 'approved', 'rejected', 'paid')),
  recorded_by text not null,
  recorded_at timestamptz not null default now(),
  decided_by text,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now()
);
create index subscription_claims_subscription
  on subscription_claims (subscription_id, recorded_at desc, id desc);

-- The card is detail-only; a present value is trimmed, 1-32 characters and
-- case-insensitively unique. Verification is an independent officer timestamp.
alter table members add column membership_card_no text;
alter table members add column verified_at timestamptz;
create unique index members_membership_card_no_ci
  on members (lower(membership_card_no)) where membership_card_no is not null;
alter table members add constraint members_membership_card_no_trimmed
  check (
    membership_card_no is null
    or (membership_card_no = btrim(membership_card_no) and char_length(membership_card_no) between 1 and 32)
  );
`,
  },
  {
    version: '0016_ussd_headcount_presbytery',
    sql: `
-- A provider gateway session id resolves to the internal uuid. Today the only
-- provider is the HMAC reference entry, so every existing row defaults to
-- 'hmac'; slice B adds the Nalo adapter against the same pair. The internal id
-- stays the session key, and the gateway SESSIONID is what re-delivery resolves.
alter table ussd_sessions add column provider text not null default 'hmac';
alter table ussd_sessions add column external_id text;
create unique index ussd_sessions_provider_external_id
  on ussd_sessions (provider, external_id)
  where external_id is not null;

-- Presbyter-only events are hidden from non-presbyters on every member-facing
-- reading surface and their roster is the active presbyter set. An officer's
-- bearer read sees the whole register. A series flag only
-- templates future generated instances; existing instances keep their own.
alter table event_instances add column presbyter_only boolean not null default false;
alter table event_series add column presbyter_only boolean not null default false;

-- Operator-entered headcounts are append-only observations. A correction is a
-- new row whose supersedes_id names the row it corrects; the corrected row is
-- never deleted or rewritten. as_of is validated against the event timezone in
-- the repository because the database cannot join the event row in a check.
create table event_session_headcounts (
  id uuid primary key default gen_random_uuid(),
  event_instance_id uuid not null references event_instances(id),
  session_date date not null,
  as_of timestamptz not null,
  mode text not null check (mode in ('adults', 'children', 'mixed')),
  adult_male integer not null default 0 check (adult_male between 0 and 10000),
  adult_female integer not null default 0 check (adult_female between 0 and 10000),
  adult_unspecified integer not null default 0 check (adult_unspecified between 0 and 10000),
  child_male integer not null default 0 check (child_male between 0 and 10000),
  child_female integer not null default 0 check (child_female between 0 and 10000),
  child_unspecified integer not null default 0 check (child_unspecified between 0 and 10000),
  total integer not null check (total between 0 and 30000),
  recorded_by text not null,
  recorded_at timestamptz not null default now(),
  supersedes_id uuid references event_session_headcounts(id),
  check (
    total = adult_male + adult_female + adult_unspecified
          + child_male + child_female + child_unspecified
  ),
  check (
    (mode = 'adults' and child_male = 0 and child_female = 0 and adult_unspecified = 0)
    or (mode = 'children' and adult_male = 0 and adult_female = 0 and child_unspecified = 0)
    or mode = 'mixed'
  )
);
create unique index event_session_headcounts_supersedes
  on event_session_headcounts (supersedes_id)
  where supersedes_id is not null;
create index event_session_headcounts_session
  on event_session_headcounts (event_instance_id, session_date);

-- The operator's "expected headcount" is retired; the register-derived
-- expected count is computed from the roster and keeps its wire name.
drop table event_session_expected;
`,
  },
  {
    version: '0017_offering_counts',
    sql: `
-- The operator's bulk cash count, per event + offering + session: an
-- append-only observation whose lines are denomination x pieces. A correction
-- is a new row whose supersedes_id names the current observation; the corrected
-- row is never deleted or rewritten. A session date in the event's sessions, an
-- attached offering and a positive total are validated in the repository
-- because the database cannot join those rows in a check.
create table event_session_offering_counts (
  id uuid primary key default gen_random_uuid(),
  event_instance_id uuid not null references event_instances(id),
  offering_id uuid not null references offerings(id),
  session_date date not null,
  currency text not null,
  terms_version integer not null,
  as_of timestamptz not null,
  recorded_by text not null,
  recorded_at timestamptz not null default now(),
  supersedes_id uuid references event_session_offering_counts(id)
);
create unique index event_session_offering_counts_supersedes
  on event_session_offering_counts (supersedes_id)
  where supersedes_id is not null;
create index event_session_offering_counts_group
  on event_session_offering_counts (event_instance_id, offering_id, session_date);

-- One line per denomination within a count; denomination values are minor
-- units and a piece count is a positive whole number.
create table event_session_offering_count_lines (
  count_id uuid not null references event_session_offering_counts(id) on delete cascade,
  denomination_minor bigint not null
    constraint event_session_offering_count_lines_denomination_positive
    check (denomination_minor > 0),
  pieces integer not null
    constraint event_session_offering_count_lines_pieces_positive
    check (pieces > 0),
  primary key (count_id, denomination_minor)
);
`,
  },
  {
    version: '0020_attendance_captures',
    sql: `
-- Attendance is a capture model: every import batch and every headcount
-- observation is a capture stamped with the moment it observed the session.
-- Live is computed from the session window; the only stored operator input is
-- 'ended'. One close per (event, session) is derived from any ended capture, so
-- there is no session-close table.
alter table import_batches add column as_of timestamptz default now();
update import_batches set as_of = created_at;
alter table import_batches alter column as_of set not null;
alter table import_batches add column ended boolean not null default false;
alter table event_session_headcounts add column ended boolean not null default false;
`,
  },
  {
    version: '0021_officer_titles',
    sql: `
-- Two vocabularies, both data rather than code: adding an entry is an insert
-- and retiring one is active = false, so existing holders keep rendering their
-- label and no schema change is needed to learn a new word.
create table presbyter_titles (
  code text primary key,
  label text not null,
  gender_restriction text check (gender_restriction in ('male','female')),
  active boolean not null default true
);
insert into presbyter_titles (code, label, gender_restriction) values
  ('pastor',    'Pastor',    null),
  ('apostle',   'Apostle',   null),
  ('elder',     'Elder',     'male'),
  ('deaconess', 'Deaconess', 'female'),
  ('deacon',    'Deacon',    'male');

create table ministry_positions (
  code text primary key,
  label text not null,
  active boolean not null default true
);
insert into ministry_positions (code, label) values
  ('leader',               'Ministry Leader'),
  ('assistant-leader',     'Asst. Leader'),
  ('secretary',            'Secretary'),
  ('organising-secretary', 'Organising Secretary'),
  ('financial-secretary',  'Financial Secretary'),
  ('executive-member',     'Executive Member');

-- One title per member, and an optional UTC calendar date for when it was
-- taken. A title and is_presbyter are independent: writing or clearing the
-- title never changes that flag, and changing the flag never changes the title.
alter table members add column title_code text references presbyter_titles(code);
alter table members add column titled_on date;
create index members_title on members (title_code) where title_code is not null;

-- One position per membership, for free under the existing primary key.
alter table member_ministries add column position_code text references ministry_positions(code);
`,
  },
  {
    version: '0022_headcount_lanes',
    sql: `
-- Headcounts become one observation per mode: the six fixed bucket columns move
-- to a lines table and the mode/bucket vocabularies become reference data. From
-- here a new mode or bucket is an insert, never another migration.
create table headcount_modes (
  code text primary key,
  label text not null,
  entry_label text not null,
  retired boolean not null default false
);
-- 'mixed' is retired: no new observation may be recorded in it, but its label
-- stays so a legacy row keeps rendering (HC-9).
insert into headcount_modes (code, label, entry_label, retired) values
  ('adults',     'Adult service',    'Adult',     false),
  ('children',   'Children service', 'Children',  false),
  ('visitors',   'Visitors',         'Visitors',  false),
  ('presbyters', 'Presbyters',       'Presbyters', false),
  ('mixed',      'Mixed service',    'Mixed',     true);

create table headcount_buckets (
  mode_code text not null references headcount_modes(code),
  code text not null,
  label text not null,
  sort_order integer not null,
  primary key (mode_code, code)
);
-- The four legacy mixed buckets exist only so a migrated mixed row keeps its
-- lines under a real foreign key; they are never offered for entry.
insert into headcount_buckets (mode_code, code, label, sort_order) values
  ('adults',     'adult-male',        'Adult men',        1),
  ('adults',     'adult-female',      'Adult women',      2),
  ('adults',     'child-unspecified', 'Children',         3),
  ('children',   'child-male',        'Boys',             1),
  ('children',   'child-female',      'Girls',            2),
  ('children',   'adult-unspecified', 'Adults',           3),
  ('visitors',   'visitor-male',      'Visitor men',      1),
  ('visitors',   'visitor-female',    'Visitor women',    2),
  ('visitors',   'visitor-children',  'Visitor children', 3),
  ('presbyters', 'elder',             'Elders',           1),
  ('presbyters', 'deaconess',         'Deaconess',        2),
  ('presbyters', 'deacon',            'Deacons',          3),
  ('mixed',      'adult-male',        'Adult men',        1),
  ('mixed',      'adult-female',      'Adult women',      2),
  ('mixed',      'child-male',        'Boys',             3),
  ('mixed',      'child-female',      'Girls',            4);

-- A bucket is unique only per mode, so the line carries its mode and the
-- foreign key is the pair. That keeps referential integrity without a
-- surrogate id on the reference row.
create table headcount_lines (
  headcount_id uuid not null references event_session_headcounts(id) on delete cascade,
  mode_code text not null,
  bucket_code text not null,
  count integer not null constraint headcount_lines_count_check
    check (count between 0 and 10000),
  primary key (headcount_id, bucket_code),
  foreign key (mode_code, bucket_code) references headcount_buckets (mode_code, code)
);

-- Mechanical reshape: one line per non-zero column. Adults rows carried
-- adult male/female plus child-unspecified; children rows the mirror image; a
-- mixed row carried both splits and no unspecified bucket.
insert into headcount_lines (headcount_id, mode_code, bucket_code, count)
select id, mode, 'adult-male', adult_male
  from event_session_headcounts where adult_male <> 0
union all
select id, mode, 'adult-female', adult_female
  from event_session_headcounts where adult_female <> 0
union all
select id, mode, 'child-unspecified', child_unspecified
  from event_session_headcounts where child_unspecified <> 0
union all
select id, mode, 'child-male', child_male
  from event_session_headcounts where child_male <> 0
union all
select id, mode, 'child-female', child_female
  from event_session_headcounts where child_female <> 0
union all
select id, mode, 'adult-unspecified', adult_unspecified
  from event_session_headcounts where adult_unspecified <> 0;

-- The mode vocabulary outgrows the old check; the table constraints that named
-- the six columns are dropped with them.
alter table event_session_headcounts
  drop constraint if exists event_session_headcounts_mode_check;

alter table event_session_headcounts
  drop column adult_male,
  drop column adult_female,
  drop column adult_unspecified,
  drop column child_male,
  drop column child_female,
  drop column child_unspecified;

alter table event_session_headcounts
  add constraint event_session_headcounts_mode_fkey
  foreign key (mode) references headcount_modes(code);

-- No index claims one current row per lane. A superseded root keeps its
-- supersedes_id null, so a partial unique index on that column would guard one
-- root per lane rather than one tip; the write path resolves the tip with
-- not exists (select 1 from event_session_headcounts s where s.supersedes_id = h.id)
-- inside the write transaction under a per-lane advisory lock (a first count has no row to lock) (HC-2). The unique
-- index on supersedes_id above still keeps the chain a chain - one successor
-- per row. Legacy data may hold several current rows in one lane and the
-- reshape neither rewrites nor deletes them; the newest wins on read (HC-27).
`,
  },
  {
    version: '0023_member_membership_fields',
    sql: `
-- Membership movement is four plain nullable values on the member, not a
-- history table: when the member joined this assembly (distinct from joined_on,
-- which is when the register first saw them), where they came from, when they
-- moved out and where to. No default and no backfill - blank stays null, so a
-- member who has not moved reads null rather than a guessed date.
alter table members add column assembly_joined_on date;
alter table members add column came_from text;
alter table members add column moved_out_on date;
alter table members add column moved_to_assembly text;
`,
  },
  {
    version: '0024_member_photo',
    sql: `
-- One square photograph per member, stored in the register (MR-14). The bytes
-- are re-encoded by the client, so no filename, EXIF or original file ever
-- reaches the column (MR-15, MR-21). All three columns are additive and
-- nullable: an existing member simply has no photo until one is uploaded.
alter table members add column photo bytea;
alter table members add column photo_content_type text
  check (photo_content_type in ('image/webp', 'image/jpeg', 'image/png'));
alter table members add column photo_updated_at timestamptz;
`,
  },
  {
    version: '0025_member_verification',
    sql: `
-- Phase 3's contact verification. Proof is per contact (MR-26): the code sent to
-- one contact sets that contact's verified_at, and changing or removing the
-- contact clears it. members.verified_at stays inert history and no new write
-- touches it; the officer confirmation is the append-only table below (MR-52).
alter table member_contacts add column verified_at timestamptz;

-- The officer confirmation and its withdrawal are one append-only audit. A row
-- is active while withdrawn_at is null; confirmedAt reads the latest active one
-- (MR-52).
create table member_confirmations (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  confirmed_by text not null,
  confirmed_at timestamptz not null default now(),
  reason text not null,
  withdrawn_at timestamptz,
  withdrawn_by text
);
create index member_confirmations_member
  on member_confirmations (member_id, confirmed_at);

-- One live code per member. The row keeps only the HMAC of the six digits, the
-- one masked destination, the one contact it binds to (with that contact's value
-- hash, so an edit between issue and accept refuses the code), the single-use
-- token hash, the expiry and the attempt count (MR-25, MR-26, MR-51). Consumed
-- rows stay for history; the partial unique index guarantees a single live code.
create table member_verification_codes (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  code_hash text not null,
  destination jsonb not null,
  contact_id uuid references member_contacts(id) on delete set null,
  destination_value_hash text not null,
  token_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index member_verification_codes_live
  on member_verification_codes (member_id)
  where consumed_at is null;

-- A pending registration retains the caller's number so approval can bind it as
-- an owned or borrowed contact (MR-53). It is AES-256-GCM ciphertext under
-- REGISTRATION_PHONE_KEY, never returned, and erased on approve, reject or purge.
alter table registration_requests add column phone_encrypted text;
`,
  },
  {
    version: '0026_event_parent',
    sql: `
-- The event parent replaces the per-session instance and the JSONB sessions
-- array. A series-backed instance becomes one occurrence of its series parent
-- (the parent reuses the series id); a standalone instance becomes a parent
-- that reuses the instance id with one occurrence per sessions[] entry.
-- Every child row is rekeyed by (parent, date), the legacy columns and tables
-- are dropped, and row counts are asserted before and after.
create table events (
  id uuid primary key default gen_random_uuid(),
  event_no text,
  name text not null,
  audience_id uuid,
  ministry_id uuid references ministries(id),
  presbyter_only boolean not null default false,
  timezone text not null default 'UTC',
  description text,
  venue_type text not null default 'auditorium'
    check (venue_type in ('auditorium', 'virtual', 'hybrid')),
  venue_name text,
  start_time text,
  end_time text,
  tracks_members boolean not null default true,
  status text not null default 'active'
    check (status in ('draft', 'active', 'archived')),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index events_event_no on events (event_no) where event_no is not null;

create table event_recurrence_versions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  effective_from date not null,
  rrule text not null,
  ends_on date,
  created_at timestamptz not null default now(),
  created_by text not null,
  check (ends_on is null or ends_on >= effective_from)
);
create unique index event_recurrence_versions_event_effective
  on event_recurrence_versions (event_id, effective_from);

create table event_recurrence_exceptions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  date date not null,
  kind text not null check (kind in ('cancelled', 'extra')),
  note text,
  created_at timestamptz not null default now(),
  created_by text not null
);
create index event_recurrence_exceptions_lookup
  on event_recurrence_exceptions (event_id, date, created_at desc);

create table event_occurrences (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  date date not null,
  start_time text,
  end_time text,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'held', 'cancelled')),
  note text,
  venue_type text check (venue_type in ('auditorium', 'virtual', 'hybrid')),
  legacy_event_no text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index event_occurrences_event_date on event_occurrences (event_id, date);
create index event_occurrences_event on event_occurrences (event_id);

-- Row counts of every table whose key changes. A failure anywhere rolls the
-- whole migration back, so the register is never left half rekeyed.
create temp table _event_parent_counts (
  table_name text primary key,
  row_count bigint not null
) on commit drop;
insert into _event_parent_counts (table_name, row_count) values
  ('attendance', (select count(*) from attendance)),
  ('attendance_suppressions', (select count(*) from attendance_suppressions)),
  ('event_session_headcounts', (select count(*) from event_session_headcounts)),
  ('event_session_offering_counts', (select count(*) from event_session_offering_counts)),
  ('registration_requests', (select count(*) from registration_requests)),
  ('attendance_codes', (select count(*) from attendance_codes)),
  ('clocking_delegations', (select count(*) from clocking_delegations)),
  ('import_batches', (select count(*) from import_batches)),
  ('contributions', (select count(*) from contributions)),
  ('pledges', (select count(*) from pledges));

-- Pre-conditions: a duplicate standalone session date aborts rather than
-- minting two occurrences for one date, and the chains must already resolve.
do $$
declare
  bad record;
begin
  select e.id as instance_id, s->>'date' as session_date, count(*) as n
    into bad
    from event_instances e
    cross join lateral jsonb_array_elements(e.sessions) s
   where e.series_id is null
   group by e.id, s->>'date'
  having count(*) > 1
   limit 1;
  if found then
    raise exception 'Event instance % has % sessions on %', bad.instance_id, bad.n, bad.session_date
      using errcode = '23514';
  end if;

  if exists (
    select 1 from (
      select event_instance_id, session_date, member_id
        from attendance
       group by event_instance_id, session_date, member_id
      having count(*) > 1
    ) duplicate
  ) then
    raise exception 'Attendance contains a duplicate (event, date, member) key'
      using errcode = '23514';
  end if;

  if exists (
    select 1 from event_session_headcounts h
     where h.supersedes_id is not null
       and not exists (select 1 from event_session_headcounts p where p.id = h.supersedes_id)
  ) then
    raise exception 'A headcount supersedes_id does not resolve'
      using errcode = '23514';
  end if;

  if exists (
    select 1 from event_session_offering_counts c
     where c.supersedes_id is not null
       and not exists (
         select 1 from event_session_offering_counts p where p.id = c.supersedes_id
       )
  ) then
    raise exception 'An offering-count supersedes_id does not resolve'
      using errcode = '23514';
  end if;
end $$;

-- Parents. A series parent reuses the series id; a standalone parent reuses
-- the instance id.
insert into events (
  id, event_no, name, ministry_id, presbyter_only, timezone, description,
  venue_type, venue_name, start_time, end_time, tracks_members, status, archived_at,
  created_at, updated_at
)
select s.id, null, s.name, s.ministry_id, s.presbyter_only, s.timezone, s.description,
       coalesce(first.venue_type, 'auditorium'), null,
       coalesce(first.start_time, '00:00'), first.end_time, true,
       case when s.archived_at is null then 'active' else 'archived' end,
       s.archived_at, s.created_at, s.updated_at
  from event_series s
  left join lateral (
    select e.venue_type, e.start_time, e.end_time
      from event_instances e
     where e.series_id = s.id and e.status <> 'cancelled'
     order by e.start_date, e.id
     limit 1
  ) first on true
on conflict (id) do nothing;

insert into events (
  id, event_no, name, ministry_id, presbyter_only, timezone, description,
  venue_type, venue_name, start_time, end_time, tracks_members, status, archived_at,
  created_at, updated_at
)
select e.id, e.event_no, e.name, null, e.presbyter_only, e.timezone, e.description,
       e.venue_type, e.venue_name, e.start_time, e.end_time, e.tracks_members,
       case e.status
         when 'draft' then 'draft'
         when 'archived' then 'archived'
         else 'active'
       end,
       case when e.status = 'archived' then now() else null end,
       e.created_at, now()
  from event_instances e
 where e.series_id is null
on conflict (id) do nothing;

-- Recurrence moves from the series tables to the parent.
insert into event_recurrence_versions (
  event_id, effective_from, rrule, ends_on, created_at, created_by
)
select s.series_id, s.effective_from, s.rrule, s.ends_on, s.created_at, s.created_by
  from series_schedules s
on conflict (event_id, effective_from) do nothing;

insert into event_recurrence_exceptions (
  event_id, date, kind, note, created_at, created_by
)
select x.series_id, x.occurs_on, x.kind, x.note, x.created_at, x.created_by
  from series_exceptions x
 where not exists (
   select 1 from event_recurrence_exceptions r
    where r.event_id = x.series_id
      and r.date = x.occurs_on
      and r.kind = x.kind
      and r.note is not distinct from x.note
 );

-- The series number is minted once the schedule rows exist, so its year is
-- the schedule's year rather than the deploy year.
do $$
declare
  row record;
  year_value integer;
  next_value integer;
  candidate text;
  attempt integer;
begin
  for row in select id from events where event_no is null order by id loop
    year_value := extract(
      year from coalesce(
        (select min(rv.effective_from) from event_recurrence_versions rv where rv.event_id = row.id),
        current_date
      )
    )::int;
    attempt := 0;
    loop
      insert into event_no_counters (year, last_value) values (year_value, 1)
      on conflict (year) do update set last_value = event_no_counters.last_value + 1
      returning last_value into next_value;
      candidate := 'EVT-' || year_value::text || '-' || lpad(next_value::text, 3, '0');
      exit when not exists (select 1 from events where event_no = candidate);
      attempt := attempt + 1;
      if attempt > 10 then
        raise exception 'Could not mint a unique event number for %', row.id
          using errcode = '23505';
      end if;
    end loop;
    update events set event_no = candidate where id = row.id;
  end loop;
end $$;

-- One occurrence per series instance, one per standalone sessions[] entry.
insert into event_occurrences (
  event_id, date, start_time, end_time, status, note, venue_type, legacy_event_no,
  created_at, updated_at
)
select e.series_id, e.start_date, e.start_time, e.end_time,
       coalesce(
         (select case
                   when s->>'status' in ('scheduled', 'held', 'cancelled') then s->>'status'
                   else null
                 end
            from jsonb_array_elements(e.sessions) s
           where (s->>'date')::date = e.start_date
           limit 1),
         case e.status
           when 'held' then 'held'
           when 'cancelled' then 'cancelled'
           else 'scheduled'
         end
       ),
       (select nullif(s->>'note', '')
          from jsonb_array_elements(e.sessions) s
         where (s->>'date')::date = e.start_date
         limit 1),
       e.venue_type, e.event_no, e.created_at, now()
  from event_instances e
 where e.series_id is not null
on conflict (event_id, date) do nothing;

insert into event_occurrences (
  event_id, date, start_time, end_time, status, note, venue_type, legacy_event_no,
  created_at, updated_at
)
select e.id,
       (s->>'date')::date,
       coalesce(s->>'startTime', e.start_time),
       coalesce(s->>'endTime', e.end_time),
       case
         when e.status = 'draft' then 'scheduled'
         when e.status = 'cancelled' then 'cancelled'
         when s->>'status' in ('scheduled', 'held', 'cancelled') then s->>'status'
         else 'scheduled'
       end,
       nullif(s->>'note', ''),
       coalesce(
         case when s->>'venueType' in ('auditorium', 'virtual', 'hybrid') then s->>'venueType' end,
         e.venue_type
       ),
       e.event_no, e.created_at, now()
  from event_instances e
  cross join lateral jsonb_array_elements(e.sessions) s
 where e.series_id is null
on conflict (event_id, date) do nothing;

-- Rekey: attendance. The (occurrence, member) pair replaces the triple.
drop trigger if exists attendance_session_guard on attendance;
drop function if exists attendance_session_guard();
alter table attendance add column occurrence_id uuid;
update attendance a
   set occurrence_id = o.id
  from event_instances i, event_occurrences o
 where i.id = a.event_instance_id
   and o.event_id = coalesce(i.series_id, i.id)
   and o.date = a.session_date;
do $$
declare bad record;
begin
  select id, event_instance_id, session_date into bad
    from attendance where occurrence_id is null limit 1;
  if found then
    raise exception 'Attendance row % (instance %, date %) has no occurrence',
      bad.id, bad.event_instance_id, bad.session_date using errcode = '23514';
  end if;
end $$;
alter table attendance alter column occurrence_id set not null;
alter table attendance drop constraint if exists attendance_event_instance_id_session_date_member_id_key;
alter table attendance drop constraint if exists attendance_event_instance_id_fkey;
alter table attendance drop column event_instance_id;
alter table attendance drop column session_date;
alter table attendance add constraint attendance_occurrence_member_key unique (occurrence_id, member_id);
alter table attendance add constraint attendance_occurrence_fkey
  foreign key (occurrence_id) references event_occurrences(id) on delete cascade;
create index attendance_occurrence on attendance (occurrence_id);

-- Rekey: attendance suppressions. The pair becomes the primary key.
alter table attendance_suppressions add column occurrence_id uuid;
update attendance_suppressions s
   set occurrence_id = o.id
  from event_instances i, event_occurrences o
 where i.id = s.event_instance_id
   and o.event_id = coalesce(i.series_id, i.id)
   and o.date = s.session_date;
do $$
declare bad record;
begin
  select member_id, event_instance_id, session_date into bad
    from attendance_suppressions where occurrence_id is null limit 1;
  if found then
    raise exception 'Suppression (%) (instance %, date %) has no occurrence',
      bad.member_id, bad.event_instance_id, bad.session_date using errcode = '23514';
  end if;
end $$;
alter table attendance_suppressions drop constraint attendance_suppressions_pkey;
alter table attendance_suppressions drop constraint if exists attendance_suppressions_event_instance_id_fkey;
alter table attendance_suppressions alter column occurrence_id set not null;
alter table attendance_suppressions drop column event_instance_id;
alter table attendance_suppressions drop column session_date;
alter table attendance_suppressions add primary key (member_id, occurrence_id);
alter table attendance_suppressions add foreign key (occurrence_id)
  references event_occurrences(id) on delete cascade;

-- Rekey: headcounts. session_date stays as the derived read field.
alter table event_session_headcounts add column occurrence_id uuid;
update event_session_headcounts h
   set occurrence_id = o.id
  from event_instances i, event_occurrences o
 where i.id = h.event_instance_id
   and o.event_id = coalesce(i.series_id, i.id)
   and o.date = h.session_date;
do $$
declare bad record;
begin
  select id, event_instance_id, session_date into bad
    from event_session_headcounts where occurrence_id is null limit 1;
  if found then
    raise exception 'Headcount % (instance %, date %) has no occurrence',
      bad.id, bad.event_instance_id, bad.session_date using errcode = '23514';
  end if;
end $$;
alter table event_session_headcounts alter column occurrence_id set not null;
alter table event_session_headcounts drop constraint if exists event_session_headcounts_event_instance_id_fkey;
alter table event_session_headcounts drop column event_instance_id;
alter table event_session_headcounts add foreign key (occurrence_id)
  references event_occurrences(id) on delete cascade;
drop index if exists event_session_headcounts_session;
create index event_session_headcounts_occurrence on event_session_headcounts (occurrence_id);

-- Rekey: offering counts. The supersession chain and its lines stay.
alter table event_session_offering_counts add column occurrence_id uuid;
update event_session_offering_counts c
   set occurrence_id = o.id
  from event_instances i, event_occurrences o
 where i.id = c.event_instance_id
   and o.event_id = coalesce(i.series_id, i.id)
   and o.date = c.session_date;
do $$
declare bad record;
begin
  select id, event_instance_id, session_date into bad
    from event_session_offering_counts where occurrence_id is null limit 1;
  if found then
    raise exception 'Offering count % (instance %, date %) has no occurrence',
      bad.id, bad.event_instance_id, bad.session_date using errcode = '23514';
  end if;
end $$;
alter table event_session_offering_counts alter column occurrence_id set not null;
alter table event_session_offering_counts drop constraint if exists event_session_offering_counts_event_instance_id_fkey;
alter table event_session_offering_counts drop column event_instance_id;
alter table event_session_offering_counts add foreign key (occurrence_id)
  references event_occurrences(id) on delete cascade;
drop index if exists event_session_offering_counts_group;
create index event_session_offering_counts_occurrence
  on event_session_offering_counts (occurrence_id, offering_id);

-- Rekey: registration requests. session_date stays denormalised.
alter table registration_requests add column occurrence_id uuid;
update registration_requests r
   set occurrence_id = o.id
  from event_instances i, event_occurrences o
 where i.id = r.event_instance_id
   and o.event_id = coalesce(i.series_id, i.id)
   and o.date = r.session_date;
do $$
declare bad record;
begin
  select id, event_instance_id, session_date into bad
    from registration_requests where occurrence_id is null limit 1;
  if found then
    raise exception 'Registration request % (instance %, date %) has no occurrence',
      bad.id, bad.event_instance_id, bad.session_date using errcode = '23514';
  end if;
end $$;
alter table registration_requests alter column occurrence_id set not null;
alter table registration_requests drop constraint if exists registration_requests_event_instance_id_fkey;
alter table registration_requests drop column event_instance_id;
alter table registration_requests add foreign key (occurrence_id)
  references event_occurrences(id) on delete cascade;
drop index if exists registration_requests_event;
create index registration_requests_occurrence
  on registration_requests (occurrence_id, status);

-- Rekey: attendance codes. session_date stays.
alter table attendance_codes add column occurrence_id uuid;
update attendance_codes c
   set occurrence_id = o.id
  from event_instances i, event_occurrences o
 where i.id = c.event_instance_id
   and o.event_id = coalesce(i.series_id, i.id)
   and o.date = c.session_date;
do $$
declare bad record;
begin
  select id, event_instance_id, session_date into bad
    from attendance_codes where occurrence_id is null limit 1;
  if found then
    raise exception 'Attendance code % (instance %, date %) has no occurrence',
      bad.id, bad.event_instance_id, bad.session_date using errcode = '23514';
  end if;
end $$;
alter table attendance_codes alter column occurrence_id set not null;
alter table attendance_codes drop constraint if exists attendance_codes_event_instance_id_fkey;
alter table attendance_codes drop column event_instance_id;
alter table attendance_codes add foreign key (occurrence_id)
  references event_occurrences(id) on delete cascade;
drop index if exists attendance_codes_session;
create index attendance_codes_occurrence on attendance_codes (occurrence_id, purpose);

-- Rekey: clocking delegations. The pair is the identity; session_date goes.
alter table clocking_delegations add column occurrence_id uuid;
update clocking_delegations d
   set occurrence_id = o.id
  from event_instances i, event_occurrences o
 where i.id = d.event_instance_id
   and o.event_id = coalesce(i.series_id, i.id)
   and o.date = d.session_date;
do $$
declare bad record;
begin
  select id, event_instance_id, session_date into bad
    from clocking_delegations where occurrence_id is null limit 1;
  if found then
    raise exception 'Delegation % (instance %, date %) has no occurrence',
      bad.id, bad.event_instance_id, bad.session_date using errcode = '23514';
  end if;
end $$;
alter table clocking_delegations alter column occurrence_id set not null;
alter table clocking_delegations drop constraint if exists clocking_delegations_event_instance_id_fkey;
alter table clocking_delegations drop column event_instance_id;
alter table clocking_delegations drop column session_date;
alter table clocking_delegations add foreign key (occurrence_id)
  references event_occurrences(id) on delete cascade;
drop index if exists clocking_delegations_active;
create unique index clocking_delegations_active
  on clocking_delegations (occurrence_id) where ended_at is null;

-- Rekey: import batches. A legacy batch with neither occurrence nor date
-- stays null; nothing is guessed.
alter table import_batches add column occurrence_id uuid;
update import_batches b
   set occurrence_id = o.id
  from event_instances i, event_occurrences o
 where i.id = b.event_instance_id
   and b.session_date is not null
   and o.event_id = coalesce(i.series_id, i.id)
   and o.date = b.session_date;
do $$
declare bad record;
begin
  select id, event_instance_id, session_date into bad
    from import_batches
   where event_instance_id is not null and occurrence_id is null
   limit 1;
  if found then
    raise exception 'Import batch % (instance %, date %) has no occurrence',
      bad.id, bad.event_instance_id, bad.session_date using errcode = '23514';
  end if;
end $$;
alter table import_batches drop constraint if exists import_batches_event_instance_id_fkey;
alter table import_batches drop column event_instance_id;
alter table import_batches add foreign key (occurrence_id)
  references event_occurrences(id);

-- Rekey: contributions and pledges resolve the parent only and keep
-- session_date; the session-offerings round adds their session target later.
alter table contributions add column event_id uuid;
update contributions c
   set event_id = coalesce(i.series_id, i.id)
  from event_instances i
 where i.id = c.event_instance_id;
do $$
declare bad record;
begin
  select id, event_instance_id into bad from contributions where event_id is null limit 1;
  if found then
    raise exception 'Contribution % (instance %) has no parent event',
      bad.id, bad.event_instance_id using errcode = '23514';
  end if;
end $$;
alter table contributions alter column event_id set not null;
alter table contributions drop constraint if exists contributions_event_instance_id_fkey;
alter table contributions drop column event_instance_id;
alter table contributions add foreign key (event_id) references events(id);
create index contributions_event on contributions (event_id);

alter table pledges add column event_id uuid;
update pledges p
   set event_id = coalesce(i.series_id, i.id)
  from event_instances i
 where i.id = p.event_instance_id;
do $$
declare bad record;
begin
  select id, event_instance_id into bad from pledges where event_id is null limit 1;
  if found then
    raise exception 'Pledge % (instance %) has no parent event',
      bad.id, bad.event_instance_id using errcode = '23514';
  end if;
end $$;
alter table pledges alter column event_id set not null;
alter table pledges drop constraint if exists pledges_event_instance_id_fkey;
alter table pledges drop column event_instance_id;
alter table pledges add foreign key (event_id) references events(id);
create index pledges_event on pledges (event_id);

-- The offering attachment stays legacy until the session-offerings round, but
-- its target is now the parent: both an instance and its series map to one
-- events row. offering_exceptions keeps pointing at the attachment.
alter table event_instance_offerings add column event_id uuid;
alter table event_instance_offerings add column occurrence_id uuid;
update event_instance_offerings a
   set event_id = coalesce(i.series_id, i.id)
  from event_instances i
 where i.id = a.event_instance_id;
update event_instance_offerings a
   set occurrence_id = o.id
  from event_instances i, event_occurrences o
 where i.id = a.event_instance_id
   and i.series_id is not null
   and o.event_id = i.series_id
   and o.date = i.start_date;
update event_instance_offerings a
   set event_id = a.series_id
 where a.event_instance_id is null and a.series_id is not null;
do $$
declare
  bad record;
  expected bigint;
  actual bigint;
begin
  select id into bad from event_instance_offerings where event_id is null limit 1;
  if found then
    raise exception 'Offering attachment % has no parent event', bad.id
      using errcode = '23514';
  end if;

  select count(*) into expected
    from event_instance_offerings a
    join event_instances i on i.id = a.event_instance_id
   where i.series_id is not null;
  select count(*) into actual
    from event_instance_offerings where occurrence_id is not null;
  if expected <> actual then
    raise exception 'Offering attachment occurrence mapping covered % of % rows',
      actual, expected using errcode = '23514';
  end if;
end $$;
drop index if exists event_instance_offerings_active_event;
drop index if exists event_instance_offerings_active_series;
alter table event_instance_offerings
  drop constraint if exists event_instance_offerings_event_instance_id_fkey;
alter table event_instance_offerings
  drop constraint if exists event_instance_offerings_series_id_fkey;
alter table event_instance_offerings drop column event_instance_id;
alter table event_instance_offerings drop column series_id;
alter table event_instance_offerings alter column event_id set not null;
alter table event_instance_offerings add foreign key (event_id) references events(id);
alter table event_instance_offerings add foreign key (occurrence_id)
  references event_occurrences(id);
alter table event_instance_offerings rename to event_offerings;
create index event_offerings_event on event_offerings (event_id, offering_id);
create unique index event_offerings_active_occurrence
  on event_offerings (offering_id, occurrence_id)
  where occurrence_id is not null and detached_on is null;
create unique index event_offerings_active_event
  on event_offerings (offering_id, event_id)
  where occurrence_id is null and detached_on is null;

-- Post-conditions: row counts unchanged, no unresolved child, the attendance
-- unique pair preserved, and every supersession chain still resolves.
do $$
declare
  row record;
  actual bigint;
  total bigint;
  distinct_pairs bigint;
begin
  for row in select * from _event_parent_counts loop
    execute format('select count(*) from %I', row.table_name) into actual;
    if actual <> row.row_count then
      raise exception 'Row count of % changed from % to %', row.table_name, row.row_count, actual
        using errcode = '23514';
    end if;
  end loop;

  select count(*), count(distinct (occurrence_id, member_id))
    into total, distinct_pairs
    from attendance;
  if total <> distinct_pairs then
    raise exception 'Attendance unique (occurrence, member) pairs were not preserved'
      using errcode = '23514';
  end if;

  if exists (
    select 1 from event_session_headcounts h
     where h.supersedes_id is not null
       and not exists (select 1 from event_session_headcounts p where p.id = h.supersedes_id)
  ) then
    raise exception 'A headcount supersedes_id no longer resolves'
      using errcode = '23514';
  end if;

  if exists (
    select 1 from event_session_offering_counts c
     where c.supersedes_id is not null
       and not exists (
         select 1 from event_session_offering_counts p where p.id = c.supersedes_id
       )
  ) then
    raise exception 'An offering-count supersedes_id no longer resolves'
      using errcode = '23514';
  end if;
end $$;

-- Legacy source goes once nothing references it. events.ministry_id and
-- presbyter_only stay as the audience round's read-only projections;
-- event_offerings and offering_exceptions stay for the offerings round.
drop table series_schedules;
drop table series_exceptions;
drop table event_instances;
drop table event_series;
`,
  },
  {
    version: '0027_event_audience_membership',
    sql: `
-- An event's applicability becomes one audience. The seven seeded groups (the
-- ministry group is one per ministry) plus the legacy pair's combination
-- audience are reference data; the legacy ministry_id/presbyter_only columns
-- stay, written from the audience, until the downstream round deletes them.
create table audiences (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  system boolean not null default false,
  system_key text,
  active boolean not null default true,
  rule jsonb not null,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz not null default now(),
  updated_by text
);
create unique index audiences_system_key
  on audiences (system_key) where system_key is not null;
create unique index audiences_name_ci on audiences (lower(name));

create table member_status_events (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  kind text not null check (kind in ('promoted')),
  from_status text not null,
  to_status text not null,
  reason text,
  actor text not null,
  at timestamptz not null default now()
);
create index member_status_events_member on member_status_events (member_id, at);

-- Append-only: the only link between a first-time visitor gift's phone hash and
-- the person, and it is never rewritten.
create table first_time_visitor_identities (
  phone_hash text primary key,
  member_id uuid not null references members(id),
  linked_by text not null,
  linked_at timestamptz not null default now()
);

-- Archived is derived from archived_at, so it is not a stored status value.
alter table members add column membership_status text;
update members set membership_status = 'active';
alter table members alter column membership_status set default 'active';
alter table members alter column membership_status set not null;
alter table members add constraint members_membership_status_check
  check (membership_status in ('visitor', 'active'));

insert into audiences (name, system, system_key, active, rule, created_by, updated_by) values
  ('Everyone', true, 'everyone', true,
   '{"operator":"allOf","clauses":[{"attribute":"membershipStatus","value":"active"}]}'::jsonb,
   'migration', 'migration'),
  ('Presbyters', true, 'presbyters', true,
   '{"operator":"allOf","clauses":[{"attribute":"presbyter","value":true}]}'::jsonb,
   'migration', 'migration'),
  ('Children 0-12', true, 'age:0-12', true,
   '{"operator":"allOf","clauses":[{"attribute":"ageBand","minYears":0,"maxYears":12}]}'::jsonb,
   'migration', 'migration'),
  ('Youth 13-17', true, 'age:13-17', true,
   '{"operator":"allOf","clauses":[{"attribute":"ageBand","minYears":13,"maxYears":17}]}'::jsonb,
   'migration', 'migration'),
  ('Adults 18+', true, 'age:18+', true,
   '{"operator":"allOf","clauses":[{"attribute":"ageBand","minYears":18,"maxYears":null}]}'::jsonb,
   'migration', 'migration'),
  ('Visitors only', true, 'status:visitor', true,
   '{"operator":"allOf","clauses":[{"attribute":"membershipStatus","value":"visitor"}]}'::jsonb,
   'migration', 'migration')
on conflict (system_key) where system_key is not null do nothing;

insert into audiences (name, system, system_key, active, rule, created_by, updated_by)
select m.name, true, 'ministry:' || m.code, true,
       jsonb_build_object(
         'operator', 'allOf',
         'clauses', jsonb_build_array(
           jsonb_build_object('attribute', 'ministry', 'ministryCode', m.code)
         )
       ),
       'migration', 'migration'
  from ministries m
on conflict (system_key) where system_key is not null do nothing;

-- A ministry + presbyter pair is one custom audience, shared by every event
-- with that pair; its natural key lets a re-run reuse it.
insert into audiences (name, system, system_key, active, rule, created_by, updated_by)
select m.name || ' · Presbyters', false, 'legacy:' || m.code || ':presbyters', true,
       jsonb_build_object(
         'operator', 'allOf',
         'clauses', jsonb_build_array(
           jsonb_build_object('attribute', 'ministry', 'ministryCode', m.code),
           jsonb_build_object('attribute', 'presbyter', 'value', true)
         )
       ),
       'migration', 'migration'
  from ministries m
 where exists (
   select 1 from events e
    where e.ministry_id = m.id and e.presbyter_only
 )
on conflict (system_key) where system_key is not null do nothing;

-- audience_id is nullable from 0026; backfill from the legacy pair, then
-- require the foreign key.
update events e
   set audience_id = (
     select a.id
       from audiences a
      where a.system_key = case
              when e.ministry_id is null and not e.presbyter_only then 'everyone'
              when e.ministry_id is null and e.presbyter_only then 'presbyters'
              when not e.presbyter_only then
                'ministry:' || (select m.code from ministries m where m.id = e.ministry_id)
              else
                'legacy:' || (select m.code from ministries m where m.id = e.ministry_id)
                  || ':presbyters'
            end
   )
 where e.audience_id is null;

do $$
declare bad record;
begin
  select id, ministry_id, presbyter_only into bad
    from events where audience_id is null limit 1;
  if found then
    raise exception 'Event % (ministry %, presbyter_only %) has no audience',
      bad.id, bad.ministry_id, bad.presbyter_only using errcode = '23514';
  end if;
end $$;

alter table events alter column audience_id set not null;
alter table events add constraint events_audience_fkey
  foreign key (audience_id) references audiences(id);

-- The legacy columns are written from the audience, never by a route again.
update events e
   set ministry_id = (
         select mi.id
           from audiences a
           cross join lateral jsonb_array_elements(a.rule -> 'clauses') c
           join ministries mi on mi.code = c ->> 'ministryCode'
          where a.id = e.audience_id and c ->> 'attribute' = 'ministry'
          limit 1
       ),
       presbyter_only = exists (
         select 1
           from audiences a
           cross join lateral jsonb_array_elements(a.rule -> 'clauses') c
          where a.id = e.audience_id
            and c ->> 'attribute' = 'presbyter'
            and (c ->> 'value')::boolean
       );
`,
  },
  {
    version: '0028_event_audiences',
    sql: `
-- An event carries an ordered set of audiences and they compose by
-- intersection (member-registrations-event-audience.md A-2a). This table is the
-- only authority for who an event is for; events.audience_id stays a
-- write-only revert shim that mirrors the primary.
create table if not exists event_audiences (
  event_id uuid not null references events(id) on delete cascade,
  audience_id uuid not null references audiences(id),
  sort_order integer not null,
  primary key (event_id, audience_id)
);

-- Assert before constraining, in this order. A dev database that still holds
-- an event whose writer did not write the set must fail the deploy rather than
-- ship a zero-roster event; the register is empty, so the assertions are a
-- tripwire and not a backfill.
do $$
declare bad record;
begin
  select e.id, e.name into bad
    from events e
   where not exists (
     select 1 from event_audiences ea where ea.event_id = e.id
   )
   limit 1;
  if found then
    raise exception 'Event % (%) has no event_audiences row; every writer must write the audience set',
      bad.id, bad.name using errcode = '23514';
  end if;

  select e.id, e.name into bad
    from events e
   where e.event_no is null
   limit 1;
  if found then
    raise exception 'Event % (%) has no event number; the register must mint one before the column is required',
      bad.id, bad.name using errcode = '23514';
  end if;
end $$;

-- The event number is minted and required on read, so the column is no longer
-- optional and the partial unique index becomes a plain one.
alter table events alter column event_no set not null;
drop index if exists events_event_no;
create unique index if not exists events_event_no on events (event_no);
`,
  },
];
