import { desc, eq } from 'drizzle-orm';
import type { Db } from '../db/sql.js';
import { shepherdingCalls } from '../db/schema.js';
import { ageInYears } from '../domain/age.js';
import { assertDate } from '../domain/contacts.js';
import {
  latestKnownStatus,
  summariseCalls,
  type CallOutcome,
  type StillInChurch,
} from '../domain/shepherding.js';
import { todayIn } from '../domain/series.js';
import {
  ConflictError,
  NotFoundError,
  ReassignmentRequiredError,
  ValidationError,
} from '../errors/domain-errors.js';
import { sqlState } from '../errors/sqlstate.js';
import { loadContacts, type ContactDto } from './contacts.js';
import type { Gender } from './members.js';

const UTC = 'UTC';

export interface AssignmentInput {
  officerMemberNo: string;
  memberNo: string;
  assignedOn?: string;
  replaceAssignmentId?: string;
  reason?: string | null;
}

export interface CallInput {
  calledOn?: string;
  outcome: CallOutcome;
  stillInChurch?: StillInChurch;
  feedback?: string | null;
  issue?: string | null;
}

export interface WindowInput {
  from?: string;
  to?: string;
}

export interface AssignmentDto {
  id: string;
  officerMemberNo: string;
  officerName: string;
  officerGender: Gender;
  officerAge: number | null;
  memberNo: string;
  memberName: string;
  memberGender: Gender;
  memberAge: number | null;
  assignedOn: string;
  endedOn: string | null;
  reason: string | null;
  endedReason: string | null;
}

export interface CallDto {
  id: string;
  assignmentId: string;
  calledOn: string;
  outcome: CallOutcome;
  stillInChurch: StillInChurch;
  feedback: string | null;
  issue: string | null;
  recordedBy: string;
  createdAt: string;
}

export interface RosterEntryDto {
  assignmentId: string;
  assignedOn: string;
  memberNo: string;
  name: string;
  gender: Gender;
  age: number | null;
  placeOfResidence: string | null;
  contacts: ContactDto[];
  attempts: number;
  conversations: number;
  lastCalledOn: string | null;
  lastOutcome: CallOutcome | null;
  stillInChurch: StillInChurch | null;
  latestFeedback: string | null;
  latestIssue: string | null;
}

export interface OfficerDto {
  memberNo: string;
  name: string;
  gender: Gender;
  age: number | null;
  assignedMembers: number;
  attempts: number;
  conversations: number;
  lastCalledOn: string | null;
  membersNeverCalled: number;
}

export interface MemberShepherdingDto {
  memberNo: string;
  name: string;
  gender: Gender;
  age: number | null;
  shepherd: {
    assignmentId: string;
    memberNo: string;
    name: string;
    gender: Gender;
    age: number | null;
    assignedOn: string;
  } | null;
  history: Array<{
    assignmentId: string;
    officerMemberNo: string;
    officerName: string;
    officerGender: Gender;
    officerAge: number | null;
    assignedOn: string;
    endedOn: string | null;
    reason: string | null;
    endedReason: string | null;
  }>;
  calls: { attempts: number; conversations: number; lastCalledOn: string | null };
  stillInChurch: StillInChurch | null;
  latestFeedback: string | null;
  latestIssue: string | null;
  recentCalls: Array<CallDto & { officerMemberNo: string }>;
}

export interface ReportDto {
  from: string | null;
  to: string | null;
  totals: {
    officers: number;
    activeMembers: number;
    assignedMembers: number;
    unassignedMembers: number;
    attempts: number;
    conversations: number;
    membersNeverCalled: number;
    stillInChurch: { yes: number; no: number; unknown: number; neverReported: number };
  };
  officers: OfficerDto[];
}

interface MemberRef {
  id: string;
  memberNo: string;
  firstName: string | null;
  lastName: string | null;
  gender: Gender;
  dob: string | Date | null;
}

/** Snake-case aliases keep `toCall` mapping for both the ORM and the raw join. */
interface CallRow {
  id: string;
  assignment_id: string;
  called_on: string;
  outcome: CallOutcome;
  still_in_church: StillInChurch;
  feedback: string | null;
  issue: string | null;
  recorded_by: string;
  created_at: Date | string;
}

function iso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

function isoTimestamp(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function fullName(first: string | null, last: string | null): string {
  return [first, last].filter(Boolean).join(' ');
}

function textOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeWindow(input?: WindowInput): { from: string | null; to: string | null } {
  const from = input?.from ? assertDate(input.from, 'from') : null;
  const to = input?.to ? assertDate(input.to, 'to') : null;
  if (from && to && from > to) throw new ValidationError('from must not be after to');
  return { from, to };
}

function reasonOf(value: string | null | undefined, required: boolean): string | null {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) {
    if (required) throw new ValidationError('reason is required when replacing an assignment');
    return null;
  }
  if (trimmed.length < 3 || trimmed.length > 500) {
    throw new ValidationError('reason must be 3-500 characters');
  }
  return trimmed;
}

export class ShepherdingRepository {
  constructor(private readonly db: Db) {}

  async assign(input: AssignmentInput, actor: string): Promise<AssignmentDto> {
    const officer = await this.requireOfficer(input.officerMemberNo);
    const member = await this.requireActiveMember(input.memberNo);
    if (officer.id === member.id) {
      throw new ValidationError('A member cannot shepherd themselves');
    }

    const today = todayIn(UTC);
    const assignedOn = input.assignedOn ? assertDate(input.assignedOn, 'assignedOn') : today;
    if (assignedOn > today) throw new ValidationError('assignedOn must not be in the future');
    const reason = reasonOf(input.reason, Boolean(input.replaceAssignmentId));

    try {
      const assignmentId = await this.db.transaction(async (tx) => {
        const [current] = await tx.query<{
          id: string;
          officer_member_id: string;
          assigned_on: string;
          officer_member_no: string;
        }>(
          `select a.id, a.officer_member_id, a.assigned_on, o.member_no as officer_member_no
           from shepherding_assignments a
           join members o on o.id = a.officer_member_id
           where a.member_id = $1 and a.ended_on is null
           for update of a`,
          [member.id],
        );

        if (current) {
          if (current.officer_member_id === officer.id) {
            throw new ConflictError(
              `Member ${member.memberNo} is already assigned to ${officer.memberNo}`,
            );
          }

          if (!input.replaceAssignmentId || input.replaceAssignmentId !== current.id) {
            throw new ReassignmentRequiredError(
              `Member ${member.memberNo} is already shepherded by ${current.officer_member_no}; supply replaceAssignmentId and a reason to reassign`,
              {
                id: current.id,
                officerMemberNo: current.officer_member_no,
                assignedOn: iso(current.assigned_on)!,
              },
            );
          }

          const previousStart = iso(current.assigned_on)!;
          if (assignedOn < previousStart) {
            throw new ValidationError(
              'assignedOn must not be before the assignment being replaced',
            );
          }

          await tx.query(
            `update shepherding_assignments
             set ended_on = $2, ended_by = $3, ended_reason = $4
             where id = $1`,
            [current.id, assignedOn, actor, reason],
          );
        } else if (input.replaceAssignmentId) {
          throw new ConflictError('No active assignment matches replaceAssignmentId');
        }

        const [created] = await tx.query<{ id: string }>(
          `insert into shepherding_assignments
             (officer_member_id, member_id, assigned_on, assigned_by, reason)
           values ($1,$2,$3,$4,$5)
           returning id`,
          [officer.id, member.id, assignedOn, actor, reason],
        );
        return created!.id;
      });

      return this.loadAssignment(assignmentId);
    } catch (error) {
      if (sqlState(error) === '23505') {
        throw new ConflictError('The member already has an active shepherd');
      }
      throw error;
    }
  }

  async endAssignment(assignmentId: string, actor: string): Promise<void> {
    const rows = await this.db.query<{ id: string }>(
      `update shepherding_assignments
       set ended_on = $2, ended_by = $3
       where id = $1 and ended_on is null
       returning id`,
      [assignmentId, todayIn(UTC), actor],
    );
    if (rows.length > 0) return;

    const [existing] = await this.db.query<{ ended_on: string | null }>(
      'select ended_on from shepherding_assignments where id = $1',
      [assignmentId],
    );
    if (!existing) throw new NotFoundError(`Assignment ${assignmentId} was not found`);
    throw new ConflictError('Assignment has already ended');
  }

  async logCall(assignmentId: string, input: CallInput, actor: string): Promise<CallDto> {
    const [assignment] = await this.db.query<{
      id: string;
      assigned_on: string;
      ended_on: string | null;
    }>('select id, assigned_on, ended_on from shepherding_assignments where id = $1', [
      assignmentId,
    ]);
    if (!assignment) throw new NotFoundError(`Assignment ${assignmentId} was not found`);
    if (assignment.ended_on) {
      throw new ConflictError('This assignment has ended; no further calls can be logged');
    }

    const today = todayIn(UTC);
    const calledOn = input.calledOn ? assertDate(input.calledOn, 'calledOn') : today;
    if (calledOn > today) throw new ValidationError('calledOn must not be in the future');
    if (calledOn < iso(assignment.assigned_on)!) {
      throw new ValidationError('calledOn must not be before the assignment started');
    }
    if (input.outcome === 'reached' && !input.stillInChurch) {
      throw new ValidationError('stillInChurch is required when outcome is reached');
    }

    const [row] = await this.db.orm
      .insert(shepherdingCalls)
      .values({
        assignmentId,
        calledOn,
        outcome: input.outcome,
        stillInChurch: input.stillInChurch ?? 'unknown',
        feedback: textOrNull(input.feedback),
        issue: textOrNull(input.issue),
        recordedBy: actor,
      })
      .returning({ id: shepherdingCalls.id, createdAt: shepherdingCalls.createdAt });

    return {
      id: row!.id,
      assignmentId,
      calledOn,
      outcome: input.outcome,
      stillInChurch: input.stillInChurch ?? 'unknown',
      feedback: textOrNull(input.feedback),
      issue: textOrNull(input.issue),
      recordedBy: actor,
      createdAt: isoTimestamp(row!.createdAt),
    };
  }

  async listCalls(assignmentId: string): Promise<CallDto[]> {
    const [assignment] = await this.db.query<{ id: string }>(
      'select id from shepherding_assignments where id = $1',
      [assignmentId],
    );
    if (!assignment) throw new NotFoundError(`Assignment ${assignmentId} was not found`);

    const rows = await this.db.orm
      .select({
        id: shepherdingCalls.id,
        assignment_id: shepherdingCalls.assignmentId,
        called_on: shepherdingCalls.calledOn,
        outcome: shepherdingCalls.outcome,
        still_in_church: shepherdingCalls.stillInChurch,
        feedback: shepherdingCalls.feedback,
        issue: shepherdingCalls.issue,
        recorded_by: shepherdingCalls.recordedBy,
        created_at: shepherdingCalls.createdAt,
      })
      .from(shepherdingCalls)
      .where(eq(shepherdingCalls.assignmentId, assignmentId))
      .orderBy(desc(shepherdingCalls.calledOn), desc(shepherdingCalls.createdAt));

    return (rows as unknown as CallRow[]).map((row) => this.toCall(row));
  }

  async roster(officerMemberNo: string, window?: WindowInput): Promise<RosterEntryDto[]> {
    const officer = await this.requireOfficer(officerMemberNo);
    const { from, to } = normalizeWindow(window);

    const rows = await this.db.query<{
      assignment_id: string;
      assigned_on: string;
      member_id: string;
      member_no: string;
      first_name: string | null;
      last_name: string | null;
      gender: Gender;
      dob: string | Date | null;
      place_of_residence: string | null;
      attempts: number;
      conversations: number;
      last_called_on: string | null;
      last_outcome: CallOutcome | null;
      still_in_church: StillInChurch | null;
      feedback: string | null;
      issue: string | null;
    }>(
      `select a.id as assignment_id, a.assigned_on,
              m.id as member_id, m.member_no, m.first_name, m.last_name,
              m.gender, m.dob, m.place_of_residence,
              w.attempts, w.conversations, w.last_called_on,
              l.outcome as last_outcome,
              k.still_in_church,
              f.feedback, i.issue
       from shepherding_assignments a
       join members m on m.id = a.member_id
       left join lateral (
         select count(*)::int as attempts,
                count(*) filter (where c.outcome = 'reached')::int as conversations,
                max(c.called_on) as last_called_on
         from shepherding_calls c
         where c.assignment_id = a.id
           and ($2::date is null or c.called_on >= $2::date)
           and ($3::date is null or c.called_on <= $3::date)
       ) w on true
       left join lateral (
         select c.outcome
         from shepherding_calls c
         where c.assignment_id = a.id
         order by c.called_on desc, c.created_at desc
         limit 1
       ) l on true
       left join lateral (
         select c.still_in_church
         from shepherding_calls c
         where c.assignment_id = a.id and c.still_in_church <> 'unknown'
         order by c.called_on desc, c.created_at desc
         limit 1
       ) k on true
       left join lateral (
         select c.feedback
         from shepherding_calls c
         where c.assignment_id = a.id and c.feedback is not null
         order by c.called_on desc, c.created_at desc
         limit 1
       ) f on true
       left join lateral (
         select c.issue
         from shepherding_calls c
         where c.assignment_id = a.id and c.issue is not null
         order by c.called_on desc, c.created_at desc
         limit 1
       ) i on true
       where a.officer_member_id = $1 and a.ended_on is null
         and m.archived_at is null and m.purged_at is null
       order by lower(m.member_no)`,
      [officer.id, from, to],
    );

    const contacts = await loadContacts(
      this.db,
      rows.map((row) => row.member_id),
    );

    return rows.map((row) => ({
      assignmentId: row.assignment_id,
      assignedOn: iso(row.assigned_on)!,
      memberNo: row.member_no,
      name: fullName(row.first_name, row.last_name),
      gender: row.gender,
      age: ageInYears(iso(row.dob)),
      placeOfResidence: row.place_of_residence,
      contacts: contacts.get(row.member_id) ?? [],
      attempts: row.attempts,
      conversations: row.conversations,
      lastCalledOn: iso(row.last_called_on),
      lastOutcome: row.last_outcome,
      stillInChurch: row.still_in_church,
      latestFeedback: row.feedback,
      latestIssue: row.issue,
    }));
  }

  async listOfficers(window?: WindowInput): Promise<OfficerDto[]> {
    return this.officerRows(window);
  }

  async report(window?: WindowInput): Promise<ReportDto> {
    const { from, to } = normalizeWindow(window);
    const officers = await this.officerRows(window);

    const [active] = await this.db.query<{ count: number }>(
      'select count(*)::int as count from members where archived_at is null and purged_at is null',
    );

    const statusRows = await this.db.query<{ still_in_church: StillInChurch; count: number }>(
      `select l.still_in_church, count(*)::int as count
       from shepherding_assignments a
       join members m on m.id = a.member_id
       join lateral (
         select c.still_in_church
         from shepherding_calls c
         where c.assignment_id = a.id
         order by c.called_on desc, c.created_at desc
         limit 1
       ) l on true
       where a.ended_on is null
         and m.archived_at is null and m.purged_at is null
       group by l.still_in_church`,
    );

    const assignedMembers = officers.reduce((total, officer) => total + officer.assignedMembers, 0);
    const attempts = officers.reduce((total, officer) => total + officer.attempts, 0);
    const conversations = officers.reduce((total, officer) => total + officer.conversations, 0);
    const membersNeverCalled = officers.reduce(
      (total, officer) => total + officer.membersNeverCalled,
      0,
    );

    const stillInChurch = { yes: 0, no: 0, unknown: 0, neverReported: 0 };
    for (const row of statusRows) stillInChurch[row.still_in_church] += row.count;
    stillInChurch.neverReported = Math.max(
      assignedMembers - stillInChurch.yes - stillInChurch.no - stillInChurch.unknown,
      0,
    );

    return {
      from,
      to,
      totals: {
        officers: officers.length,
        activeMembers: active?.count ?? 0,
        assignedMembers,
        unassignedMembers: Math.max((active?.count ?? 0) - assignedMembers, 0),
        attempts,
        conversations,
        membersNeverCalled,
        stillInChurch,
      },
      officers,
    };
  }

  async forMember(memberNo: string): Promise<MemberShepherdingDto> {
    const member = await this.requireActiveMember(memberNo);

    const assignments = await this.db.query<{
      id: string;
      assigned_on: string;
      ended_on: string | null;
      reason: string | null;
      ended_reason: string | null;
      officer_member_no: string;
      first_name: string | null;
      last_name: string | null;
      gender: Gender;
      dob: string | Date | null;
    }>(
      `select a.id, a.assigned_on, a.ended_on, a.reason, a.ended_reason,
              o.member_no as officer_member_no, o.first_name, o.last_name, o.gender, o.dob
       from shepherding_assignments a
       join members o on o.id = a.officer_member_id
       where a.member_id = $1
       order by a.assigned_on desc, a.created_at desc`,
      [member.id],
    );

    const calls = await this.loadCallsForMember(member.id);
    const summary = summariseCalls(calls);
    const current = assignments.find((assignment) => assignment.ended_on === null);

    return {
      memberNo: member.memberNo,
      name: fullName(member.firstName, member.lastName),
      gender: member.gender,
      age: ageInYears(iso(member.dob)),
      shepherd: current
        ? {
            assignmentId: current.id,
            memberNo: current.officer_member_no,
            name: fullName(current.first_name, current.last_name),
            gender: current.gender,
            age: ageInYears(iso(current.dob)),
            assignedOn: iso(current.assigned_on)!,
          }
        : null,
      history: assignments.map((assignment) => ({
        assignmentId: assignment.id,
        officerMemberNo: assignment.officer_member_no,
        officerName: fullName(assignment.first_name, assignment.last_name),
        officerGender: assignment.gender,
        officerAge: ageInYears(iso(assignment.dob)),
        assignedOn: iso(assignment.assigned_on)!,
        endedOn: iso(assignment.ended_on),
        reason: assignment.reason,
        endedReason: assignment.ended_reason,
      })),
      calls: summary,
      stillInChurch: latestKnownStatus(calls),
      latestFeedback: calls.find((call) => call.feedback)?.feedback ?? null,
      latestIssue: calls.find((call) => call.issue)?.issue ?? null,
      recentCalls: calls.slice(0, 20).map((call) => ({
        id: call.id,
        assignmentId: call.assignmentId,
        calledOn: call.calledOn,
        outcome: call.outcome,
        stillInChurch: call.stillInChurch,
        feedback: call.feedback,
        issue: call.issue,
        recordedBy: call.recordedBy,
        createdAt: call.createdAt,
        officerMemberNo: call.officerMemberNo,
      })),
    };
  }

  // -- internals -----------------------------------------------------------

  private async officerRows(window?: WindowInput): Promise<OfficerDto[]> {
    const { from, to } = normalizeWindow(window);

    const rows = await this.db.query<{
      officer_member_no: string;
      first_name: string | null;
      last_name: string | null;
      gender: Gender;
      dob: string | Date | null;
      assigned_members: number;
      attempts: number;
      conversations: number;
      last_called_on: string | null;
      members_never_called: number;
    }>(
      `select o.member_no as officer_member_no, o.first_name, o.last_name, o.gender, o.dob,
              count(a.id) filter (where m.id is not null)::int as assigned_members,
              coalesce(sum(w.attempts) filter (where m.id is not null), 0)::int as attempts,
              coalesce(sum(w.conversations) filter (where m.id is not null), 0)::int as conversations,
              max(w.last_called_on) filter (where m.id is not null) as last_called_on,
              count(a.id) filter (
                where m.id is not null and coalesce(w.attempts, 0) = 0
              )::int as members_never_called
       from members o
       left join shepherding_assignments a
         on a.officer_member_id = o.id and a.ended_on is null
       left join members m
         on m.id = a.member_id and m.archived_at is null and m.purged_at is null
       left join lateral (
         select count(*)::int as attempts,
                count(*) filter (where c.outcome = 'reached')::int as conversations,
                max(c.called_on) as last_called_on
         from shepherding_calls c
         where c.assignment_id = a.id
           and ($1::date is null or c.called_on >= $1::date)
           and ($2::date is null or c.called_on <= $2::date)
       ) w on true
       where o.is_presbyter and o.archived_at is null and o.purged_at is null
       group by o.id
       order by lower(o.member_no)`,
      [from, to],
    );

    return rows.map((row) => ({
      memberNo: row.officer_member_no,
      name: fullName(row.first_name, row.last_name),
      gender: row.gender,
      age: ageInYears(iso(row.dob)),
      assignedMembers: row.assigned_members,
      attempts: row.attempts,
      conversations: row.conversations,
      lastCalledOn: iso(row.last_called_on),
      membersNeverCalled: row.members_never_called,
    }));
  }

  private async loadAssignment(id: string): Promise<AssignmentDto> {
    const [row] = await this.db.query<{
      id: string;
      assigned_on: string;
      ended_on: string | null;
      reason: string | null;
      ended_reason: string | null;
      officer_member_no: string;
      officer_first: string | null;
      officer_last: string | null;
      officer_gender: Gender;
      officer_dob: string | Date | null;
      member_no: string;
      member_first: string | null;
      member_last: string | null;
      member_gender: Gender;
      member_dob: string | Date | null;
    }>(
      `select a.id, a.assigned_on, a.ended_on, a.reason, a.ended_reason,
              o.member_no as officer_member_no, o.first_name as officer_first,
              o.last_name as officer_last, o.gender as officer_gender, o.dob as officer_dob,
              m.member_no, m.first_name as member_first, m.last_name as member_last,
              m.gender as member_gender, m.dob as member_dob
       from shepherding_assignments a
       join members o on o.id = a.officer_member_id
       join members m on m.id = a.member_id
       where a.id = $1`,
      [id],
    );
    if (!row) throw new NotFoundError(`Assignment ${id} was not found`);

    return {
      id: row.id,
      officerMemberNo: row.officer_member_no,
      officerName: fullName(row.officer_first, row.officer_last),
      officerGender: row.officer_gender,
      officerAge: ageInYears(iso(row.officer_dob)),
      memberNo: row.member_no,
      memberName: fullName(row.member_first, row.member_last),
      memberGender: row.member_gender,
      memberAge: ageInYears(iso(row.member_dob)),
      assignedOn: iso(row.assigned_on)!,
      endedOn: iso(row.ended_on),
      reason: row.reason,
      endedReason: row.ended_reason,
    };
  }

  private async loadCallsForMember(
    memberId: string,
  ): Promise<Array<CallDto & { officerMemberNo: string }>> {
    const rows = await this.db.query<{
      id: string;
      assignment_id: string;
      called_on: string;
      outcome: CallOutcome;
      still_in_church: StillInChurch;
      feedback: string | null;
      issue: string | null;
      recorded_by: string;
      created_at: Date | string;
      officer_member_no: string;
    }>(
      `select c.id, c.assignment_id, c.called_on, c.outcome, c.still_in_church,
              c.feedback, c.issue, c.recorded_by, c.created_at,
              o.member_no as officer_member_no
       from shepherding_calls c
       join shepherding_assignments a on a.id = c.assignment_id
       join members o on o.id = a.officer_member_id
       where a.member_id = $1
       order by c.called_on desc, c.created_at desc`,
      [memberId],
    );

    return rows.map((row) => ({
      ...this.toCall(row),
      officerMemberNo: row.officer_member_no,
    }));
  }

  private toCall(row: CallRow): CallDto {
    return {
      id: row.id,
      assignmentId: row.assignment_id,
      calledOn: iso(row.called_on)!,
      outcome: row.outcome,
      stillInChurch: row.still_in_church,
      feedback: row.feedback,
      issue: row.issue,
      recordedBy: row.recorded_by,
      createdAt: isoTimestamp(row.created_at),
    };
  }

  private async requireOfficer(memberNo: string): Promise<MemberRef> {
    const [row] = await this.db.query<{
      id: string;
      member_no: string;
      first_name: string | null;
      last_name: string | null;
      gender: Gender;
      dob: string | Date | null;
      is_presbyter: boolean;
    }>(
      `select id, member_no, first_name, last_name, gender, dob, is_presbyter
       from members
       where lower(member_no) = lower($1) and archived_at is null and purged_at is null`,
      [memberNo],
    );
    if (!row) throw new NotFoundError(`Member ${memberNo} was not found`);
    if (!row.is_presbyter) {
      throw new ValidationError(`Member ${memberNo} is not a presbyter`);
    }
    return {
      id: row.id,
      memberNo: row.member_no,
      firstName: row.first_name,
      lastName: row.last_name,
      gender: row.gender,
      dob: row.dob,
    };
  }

  private async requireActiveMember(memberNo: string): Promise<MemberRef> {
    const [row] = await this.db.query<{
      id: string;
      member_no: string;
      first_name: string | null;
      last_name: string | null;
      gender: Gender;
      dob: string | Date | null;
    }>(
      `select id, member_no, first_name, last_name, gender, dob
       from members
       where lower(member_no) = lower($1) and archived_at is null and purged_at is null`,
      [memberNo],
    );
    if (!row) throw new NotFoundError(`Member ${memberNo} was not found`);
    return {
      id: row.id,
      memberNo: row.member_no,
      firstName: row.first_name,
      lastName: row.last_name,
      gender: row.gender,
      dob: row.dob,
    };
  }
}
