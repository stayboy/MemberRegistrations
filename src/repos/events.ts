import type { Db } from '../db/sql.js';
import type { EventListQuery } from '../schemas/events.js';

export type VenueType = 'auditorium' | 'virtual' | 'hybrid';
export type EventStatus = 'draft' | 'scheduled' | 'held' | 'cancelled' | 'archived';
export type EventSessionStatus = 'scheduled' | 'held' | 'cancelled';
export type EventSource = 'series' | 'manual' | 'import';
export type SessionSource = 'import' | 'manual' | 'mixed' | 'none';

export interface EventSessionItem {
  date: string;
  startTime: string;
  endTime: string | null;
  status: EventSessionStatus;
  venueType?: VenueType;
  present: number;
  /** Deferred to ticket 10; zero until the expected-per-session engine lands. */
  expected: number;
  importedRows: number;
  source: SessionSource;
}

export interface EventOfferingStatsItem {
  attachedEvents: number;
  pledgedMinor: number;
  paidMinor: number;
  pendingMinor: number;
  honorRate: number;
  contributionCount: number;
}

export interface EventOfferingItem {
  offeringId: string;
  name: string;
  kind: 'freewill' | 'tithe' | 'pledge' | 'building' | 'missions' | 'other';
  currency: string;
  availableUntil: string | null;
  exceptions: Array<{ date: string; kind: 'skip' | 'opt_in'; note: string | null }>;
  stats: EventOfferingStatsItem;
}

export interface EventItem {
  id: string;
  /** Null while a series-minted instance has not been assigned an event number yet. */
  eventNo: string | null;
  name: string;
  seriesId: string | null;
  ministry: { code: string; name: string } | null;
  timezone: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string | null;
  venueType: VenueType;
  venueName: string | null;
  description: string | null;
  status: EventStatus;
  source: EventSource;
  sessions: EventSessionItem[];
  /** Offerings arrive in ticket 20; the list keeps the contract shape. */
  offerings: EventOfferingItem[];
  stats: EventOfferingStatsItem;
}

interface StoredSession {
  date?: unknown;
  startTime?: string | null;
  endTime?: string | null;
  status?: string;
  venueType?: string;
}

interface SessionCount {
  date: unknown;
  present: number | string;
  importedRows: number | string;
}

type EventRow = {
  id: string;
  event_no: string | null;
  name: string;
  series_id: string | null;
  timezone: string;
  start_date: unknown;
  end_date: unknown;
  start_time: string | null;
  end_time: string | null;
  venue_type: string;
  venue_name: string | null;
  description: string | null;
  status: string;
  source: string;
  sessions: unknown;
  ministry_code: string | null;
  ministry_name: string | null;
  session_counts: unknown;
};

/**
 * One page query: the page CTE applies the filters, stable order and limit, then
 * a lateral aggregate counts attendance per session for just those rows. No
 * follow-up query is issued per event or per session.
 */
const LIST_SQL = `
with page as (
  select e.id,
         e.event_no,
         e.name,
         e.series_id,
         e.timezone,
         e.start_date,
         e.end_date,
         e.start_time,
         e.end_time,
         e.venue_type,
         e.venue_name,
         e.description,
         e.status,
         e.source,
         e.sessions,
         m.code as ministry_code,
         m.name as ministry_name
  from event_instances e
  left join event_series s on s.id = e.series_id
  left join ministries m on m.id = s.ministry_id
  where ($1::date is null or e.end_date >= $1::date)
    and ($2::date is null or e.start_date <= $2::date)
    and ($3::uuid is null or e.series_id = $3::uuid)
    and (
      $4::text is null
      or lower(m.code) = lower($4::text)
      or lower(m.name) = lower($4::text)
    )
    and ($5::text is null or e.venue_type = $5::text)
  order by e.start_date, e.id
  limit $6::int offset $7::int
)
select p.*,
       coalesce(counts.session_counts, '[]'::jsonb) as session_counts
from page p
left join lateral (
  select jsonb_agg(
           jsonb_build_object(
             'date', c.session_date,
             'present', c.present,
             'importedRows', c.imported_rows
           )
           order by c.session_date
         ) as session_counts
  from (
    select a.session_date,
           count(*)::int as present,
           count(*) filter (where a.source = 'import')::int as imported_rows
    from attendance a
    where a.event_instance_id = p.id
    group by a.session_date
  ) c
) counts on true
order by p.start_date, p.id
`;

const VENUE_TYPES: readonly VenueType[] = ['auditorium', 'virtual', 'hybrid'];
const EVENT_STATUSES: readonly EventStatus[] = [
  'draft',
  'scheduled',
  'held',
  'cancelled',
  'archived',
];
const SESSION_STATUSES: readonly EventSessionStatus[] = ['scheduled', 'held', 'cancelled'];

function isoDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

function parseJsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function emptyStats(): EventOfferingStatsItem {
  return {
    attachedEvents: 0,
    pledgedMinor: 0,
    paidMinor: 0,
    pendingMinor: 0,
    honorRate: 0,
    contributionCount: 0,
  };
}

function deriveStatus(
  stored: EventStatus,
  startDate: string,
  endDate: string,
  today: string,
): EventStatus {
  if (stored === 'draft' || stored === 'cancelled' || stored === 'archived') return stored;
  if (endDate < today) return 'held';
  if (startDate > today) return 'scheduled';
  return 'held';
}

function sessionSource(present: number, importedRows: number): SessionSource {
  if (present === 0) return 'none';
  if (importedRows === 0) return 'manual';
  if (importedRows === present) return 'import';
  return 'mixed';
}

function asStatus(value: string): EventStatus {
  return EVENT_STATUSES.includes(value as EventStatus) ? (value as EventStatus) : 'scheduled';
}

function asSessionStatus(value: string | undefined): EventSessionStatus {
  return SESSION_STATUSES.includes(value as EventSessionStatus)
    ? (value as EventSessionStatus)
    : 'scheduled';
}

function asVenueType(value: string): VenueType {
  return VENUE_TYPES.includes(value as VenueType) ? (value as VenueType) : 'auditorium';
}

export class EventRepository {
  constructor(private readonly db: Db) {}

  async list(query: EventListQuery): Promise<EventItem[]> {
    const rows = await this.db.query<EventRow>(LIST_SQL, [
      query.from ?? null,
      query.to ?? null,
      query.seriesId ?? null,
      query.ministry ?? null,
      query.venueType ?? null,
      query.limit,
      query.offset,
    ]);
    const today = new Date().toISOString().slice(0, 10);

    return rows.map((row) => this.toItem(row, today));
  }

  private toItem(row: EventRow, today: string): EventItem {
    const startDate = isoDate(row.start_date);
    const endDate = isoDate(row.end_date);
    const status = deriveStatus(asStatus(row.status), startDate, endDate, today);
    const startTime = row.start_time ?? '';

    const counts = new Map(
      parseJsonArray(row.session_counts).map((entry) => {
        const count = entry as SessionCount;
        return [
          isoDate(count.date),
          {
            present: Number(count.present),
            importedRows: Number(count.importedRows),
          },
        ] as const;
      }),
    );

    const sessions: EventSessionItem[] = parseJsonArray(row.sessions).map((entry) => {
      const session = entry as StoredSession;
      const date = isoDate(session.date);
      const count = counts.get(date) ?? { present: 0, importedRows: 0 };
      const sessionVenueType =
        session.venueType && VENUE_TYPES.includes(session.venueType as VenueType)
          ? (session.venueType as VenueType)
          : undefined;

      return {
        date,
        startTime: session.startTime ?? startTime,
        endTime: session.endTime ?? null,
        status: asSessionStatus(session.status),
        ...(sessionVenueType ? { venueType: sessionVenueType } : {}),
        present: count.present,
        expected: 0,
        importedRows: count.importedRows,
        source: sessionSource(count.present, count.importedRows),
      };
    });

    return {
      id: row.id,
      eventNo: row.event_no,
      name: row.name,
      seriesId: row.series_id,
      ministry:
        row.ministry_code && row.ministry_name
          ? { code: row.ministry_code, name: row.ministry_name }
          : null,
      timezone: row.timezone,
      startDate,
      endDate,
      startTime,
      endTime: row.end_time,
      venueType: asVenueType(row.venue_type),
      venueName: row.venue_name,
      description: row.description,
      status,
      source: row.source as EventSource,
      sessions,
      offerings: [],
      stats: emptyStats(),
    };
  }
}
