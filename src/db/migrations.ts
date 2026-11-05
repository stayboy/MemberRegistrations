/**
 * Migrations are embedded rather than read from disk so the compiled function
 * bundle cannot miss a .sql file. Each entry is applied once, in order, inside
 * a transaction, and recorded in `schema_migrations`.
 */
export interface Migration {
  version: string;
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
];
