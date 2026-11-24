import type { Db, Row } from '../db/sql.js';
import {
  ConflictError,
  DelegateRequiredError,
  DelegationExistsError,
  NotPresbyterError,
  NotSeniorPresbyterError,
  NotShepherdError,
  NotFoundError,
  ValidationError,
} from '../errors/domain-errors.js';
import { sqlState } from '../errors/sqlstate.js';
import type { Gender } from './members.js';
import { EventRepository, type EventAttendanceEntry } from './events.js';

export interface DelegationItem {
  id: string;
  fromMemberNo: string;
  fromName: string;
  toMemberNo: string;
  toName: string;
  reason: string;
  createdAt: string;
}

interface MemberRef extends Row {
  id: string;
  member_no: string;
  first_name: string | null;
  last_name: string | null;
  other_names: string | null;
  gender: Gender;
  is_presbyter: boolean;
  presbyter_rank: number | null;
}

function isoTimestamp(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

function displayName(row: MemberRef): string {
  const first = row.first_name?.trim() ?? '';
  const last = row.last_name?.trim() ?? '';
  if (first || last) return [first, last].filter(Boolean).join(' ');
  return row.other_names?.trim() ?? '';
}

/**
 * Clocking authority, delegation and the operator's expected headcount for one
 * event session. The write itself stays `EventRepository.addManualAttendance`.
 */
export class ClockingRepository {
  private readonly events: EventRepository;

  constructor(private readonly db: Db) {
    this.events = new EventRepository(db);
  }

  /**
   * `POST /v1/events/{eventId}/delegations`: a senior presbyter grants a
   * presbyter this session's clock-in authority. Clocking is authority, not
   * audience, so the event's audience does not gate either party.
   */
  async delegate(
    input: {
      eventId: string;
      sessionDate: string;
      fromMemberNo: string;
      toMemberNo: string;
      reason: string;
    },
    actor: string,
  ): Promise<DelegationItem> {
    await this.requireSession(input.eventId, input.sessionDate);
    const reason = input.reason.trim();
    if (reason.length < 3) throw new ValidationError('reason must be 3-500 characters');

    const from = await this.requireActiveMember(input.fromMemberNo);
    const to = await this.requireActiveMember(input.toMemberNo);
    if (!from.is_presbyter) {
      throw new NotPresbyterError(`Member ${from.member_no} is not a presbyter`);
    }
    if (from.presbyter_rank === null) {
      throw new NotSeniorPresbyterError(`Member ${from.member_no} is not a senior presbyter`);
    }
    if (!to.is_presbyter) {
      throw new NotPresbyterError(`Member ${to.member_no} is not a presbyter`);
    }
    if (from.id === to.id) {
      throw new ValidationError('fromMemberNo and toMemberNo must differ');
    }

    try {
      const [row] = await this.db.query<{ id: string; created_at: Date | string }>(
        `insert into clocking_delegations (
           occurrence_id, from_member_id, to_member_id, reason, created_by
         )
         select o.id, $2, $3, $4, $5
           from event_occurrences o
          where o.event_id = $1 and o.date = $6
         returning id, created_at`,
        [input.eventId, from.id, to.id, reason, actor, input.sessionDate],
      );
      if (!row)
        throw new ValidationError(`Event ${input.eventId} has no session on ${input.sessionDate}`);

      return {
        id: row!.id,
        fromMemberNo: from.member_no,
        fromName: displayName(from),
        toMemberNo: to.member_no,
        toName: displayName(to),
        reason,
        createdAt: isoTimestamp(row!.created_at)!,
      };
    } catch (error) {
      if (sqlState(error) === '23505') throw new DelegationExistsError();
      throw error;
    }
  }

  async listDelegations(
    eventId: string,
    sessionDate: string,
  ): Promise<{ items: DelegationItem[] }> {
    await this.requireSession(eventId, sessionDate);
    const rows = await this.db.query<{
      id: string;
      from_member_no: string;
      from_first: string | null;
      from_last: string | null;
      from_other: string | null;
      to_member_no: string;
      to_first: string | null;
      to_last: string | null;
      to_other: string | null;
      reason: string;
      created_at: Date | string;
    }>(
      `select d.id,
              f.member_no as from_member_no, f.first_name as from_first,
              f.last_name as from_last, f.other_names as from_other,
              t.member_no as to_member_no, t.first_name as to_first,
              t.last_name as to_last, t.other_names as to_other,
              d.reason, d.created_at
         from clocking_delegations d
         join event_occurrences o on o.id = d.occurrence_id
         join members f on f.id = d.from_member_id
         join members t on t.id = d.to_member_id
        where o.event_id = $1 and o.date = $2 and d.ended_at is null
        order by d.created_at desc, d.id desc`,
      [eventId, sessionDate],
    );

    return {
      items: rows.map((row) => ({
        id: row.id,
        fromMemberNo: row.from_member_no,
        fromName:
          [row.from_first, row.from_last].filter(Boolean).join(' ') || (row.from_other ?? ''),
        toMemberNo: row.to_member_no,
        toName: [row.to_first, row.to_last].filter(Boolean).join(' ') || (row.to_other ?? ''),
        reason: row.reason,
        createdAt: isoTimestamp(row.created_at)!,
      })),
    };
  }

  /**
   * A presbyter clocks a member in for one session; a delegate inherits the
   * senior's authority for that session only. Authority is the presbyter flag
   * and the shepherding edge, never the event's audience: a presbyter clocks a
   * youth event as readily as any other.
   */
  async clockIn(input: {
    eventId: string;
    sessionDate: string;
    memberNo: string;
    actorMemberNo: string;
    actor: string;
  }): Promise<EventAttendanceEntry> {
    await this.requireSession(input.eventId, input.sessionDate);

    const actor = await this.requireActiveMember(input.actorMemberNo);
    if (!actor.is_presbyter) {
      throw new NotPresbyterError(`Member ${actor.member_no} is not a presbyter`);
    }

    // A delegate inherits the senior's broad authority for this session only.
    const [delegation] = await this.db.query<{ id: string }>(
      `select d.id
         from clocking_delegations d
         join event_occurrences o on o.id = d.occurrence_id
        where o.event_id = $1 and o.date = $2
          and d.to_member_id = $3 and d.ended_at is null`,
      [input.eventId, input.sessionDate, actor.id],
    );

    if (actor.presbyter_rank !== null) {
      const report = await this.events.getAttendance(input.eventId, input.sessionDate);
      const present = report.rows.some((row) => row.memberNo === actor.member_no);
      if (!present && !delegation) throw new DelegateRequiredError();
    } else if (!delegation) {
      const target = await this.requireActiveMember(input.memberNo);
      const [assignment] = await this.db.query<{ id: string }>(
        `select id from shepherding_assignments
          where officer_member_id = $1 and member_id = $2 and ended_on is null`,
        [actor.id, target.id],
      );
      if (!assignment) throw new NotShepherdError();
    }
    return this.events.addManualAttendance(
      input.eventId,
      input.memberNo,
      input.sessionDate,
      input.actor,
    );
  }

  /**
   * The session must exist, be read-write and not cancelled. The legacy
   * `presbyter_only` flag is not read: clocking authority is the presbyter flag
   * and the delegation, so the audience has no gate here.
   */
  private async requireSession(eventId: string, sessionDate: string): Promise<void> {
    const [event] = await this.db.query<{
      status: string;
      occurrence_id: string | null;
      occurrence_status: string | null;
    }>(
      `select e.status,
              o.id as occurrence_id, o.status as occurrence_status
         from events e
         left join event_occurrences o on o.event_id = e.id and o.date = $2
        where e.id = $1`,
      [eventId, sessionDate],
    );
    if (!event) throw new NotFoundError(`Event ${eventId} was not found`);
    if (event.status === 'archived') {
      throw new ConflictError('An archived event is read-only');
    }
    if (!event.occurrence_id) {
      throw new ValidationError(`Event ${eventId} has no session on ${sessionDate}`);
    }
    if (event.occurrence_status === 'cancelled') {
      throw new ValidationError(`The session on ${sessionDate} is cancelled and read-only`);
    }
  }

  private async requireActiveMember(memberNo: string): Promise<MemberRef> {
    const [row] = await this.db.query<MemberRef>(
      `select id, member_no, first_name, last_name, other_names, gender,
              is_presbyter, presbyter_rank
         from members
        where lower(member_no) = lower($1) and archived_at is null and purged_at is null`,
      [memberNo],
    );
    if (!row) throw new NotFoundError(`Member ${memberNo} was not found`);
    return row;
  }
}
