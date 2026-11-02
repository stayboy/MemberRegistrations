import { randomUUID } from 'node:crypto';
import { ConflictError, NotFoundError, ValidationError } from '../errors/domain-errors.js';

export const CONTACT_CHANNELS = ['email', 'phone', 'whatsapp', 'other'] as const;
export type ContactChannel = (typeof CONTACT_CHANNELS)[number];

export const SUBSCRIPTION_KINDS = ['life-insurance', 'credit-union'] as const;
export type SubscriptionKind = (typeof SUBSCRIPTION_KINDS)[number];

export const MINISTRIES = ['pemem', 'women-ministry', 'choir', 'prayer'] as const;
export type Ministry = (typeof MINISTRIES)[number];

export interface Contact {
  id: string;
  channel: ContactChannel;
  value: string;
  label?: string;
  preferred: boolean;
}

export interface Subscription {
  kind: SubscriptionKind;
  status: 'active' | 'inactive';
  since?: string;
}

export interface AttendanceEntry {
  eventNo: string;
  eventName: string;
  date: string;
  ministry?: string;
}

export interface MemberSnapshot {
  memberNo: string;
  firstName: string;
  lastName: string;
  otherNames?: string;
  maidenName?: string;
  alias?: string;
  dateOfBirth?: string;
  gender?: string;
  placeOfResidence?: string;
  contacts: Contact[];
  subscriptions: Subscription[];
  ministries: Ministry[];
  attendance: AttendanceEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface ContactInput {
  id?: string;
  channel: ContactChannel;
  value: string;
  label?: string;
  preferred?: boolean;
}

export interface CreateMemberInput {
  memberNo: string;
  firstName: string;
  lastName: string;
  otherNames?: string;
  maidenName?: string;
  alias?: string;
  dateOfBirth?: string;
  gender?: string;
  placeOfResidence?: string;
  contacts?: ContactInput[];
  subscriptions?: SubscriptionKind[];
  ministries?: Ministry[];
}

export type UpdateMemberInput = Partial<Omit<CreateMemberInput, 'memberNo'>>;

export interface AttendanceSummaryItem {
  eventName: string;
  attendances: number;
  lastDate: string;
}

const MEMBER_NO_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function requiredText(value: string, field: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new ValidationError(`${field} is required`);
  return trimmed;
}

function optionalText(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function validateDate(value: string | undefined, field: string): string | undefined {
  if (value === undefined || value === '') return undefined;
  if (!DATE_PATTERN.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new ValidationError(`${field} must be an ISO date (YYYY-MM-DD)`);
  }
  return value;
}

function now(): string {
  return new Date().toISOString();
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

/**
 * Behaviour-rich member aggregate. All state transitions go through a method so
 * invariants (unique contacts, unique ministries, one attendance per event/date)
 * cannot be bypassed by an anemic caller writing properties directly.
 */
export class Member {
  private constructor(private readonly data: MemberSnapshot) {}

  static create(input: CreateMemberInput): Member {
    const memberNo = requiredText(input.memberNo, 'memberNo');
    if (!MEMBER_NO_PATTERN.test(memberNo)) {
      throw new ValidationError(
        'memberNo must be 1-32 characters and contain only letters, digits, hyphens or underscores',
      );
    }

    const timestamp = now();
    const member = new Member({
      memberNo,
      firstName: requiredText(input.firstName, 'firstName'),
      lastName: requiredText(input.lastName, 'lastName'),
      otherNames: optionalText(input.otherNames),
      maidenName: optionalText(input.maidenName),
      alias: optionalText(input.alias),
      dateOfBirth: validateDate(input.dateOfBirth, 'dateOfBirth'),
      gender: optionalText(input.gender),
      placeOfResidence: optionalText(input.placeOfResidence),
      contacts: [],
      subscriptions: [],
      ministries: [],
      attendance: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    member.replaceContacts(input.contacts ?? []);
    member.replaceSubscriptions(input.subscriptions ?? []);
    member.replaceMinistries(input.ministries ?? []);
    return member;
  }

  static fromSnapshot(snapshot: MemberSnapshot): Member {
    const member = new Member(clone(snapshot));
    if (!MEMBER_NO_PATTERN.test(member.data.memberNo)) {
      throw new ValidationError('Stored memberNo is invalid');
    }
    return member;
  }

  get memberNo(): string {
    return this.data.memberNo;
  }

  get firstName(): string {
    return this.data.firstName;
  }

  get lastName(): string {
    return this.data.lastName;
  }

  get otherNames(): string | undefined {
    return this.data.otherNames;
  }

  get alias(): string | undefined {
    return this.data.alias;
  }

  get contacts(): readonly Contact[] {
    return this.data.contacts;
  }

  get subscriptions(): readonly Subscription[] {
    return this.data.subscriptions;
  }

  get ministries(): readonly Ministry[] {
    return this.data.ministries;
  }

  get attendance(): readonly AttendanceEntry[] {
    return this.data.attendance;
  }

  get createdAt(): string {
    return this.data.createdAt;
  }

  get updatedAt(): string {
    return this.data.updatedAt;
  }

  update(input: UpdateMemberInput): void {
    let changed = false;

    if (input.firstName !== undefined) {
      this.data.firstName = requiredText(input.firstName, 'firstName');
      changed = true;
    }
    if (input.lastName !== undefined) {
      this.data.lastName = requiredText(input.lastName, 'lastName');
      changed = true;
    }
    if (input.otherNames !== undefined) {
      this.data.otherNames = optionalText(input.otherNames);
      changed = true;
    }
    if (input.maidenName !== undefined) {
      this.data.maidenName = optionalText(input.maidenName);
      changed = true;
    }
    if (input.alias !== undefined) {
      this.data.alias = optionalText(input.alias);
      changed = true;
    }
    if (input.dateOfBirth !== undefined) {
      this.data.dateOfBirth = validateDate(input.dateOfBirth, 'dateOfBirth');
      changed = true;
    }
    if (input.gender !== undefined) {
      this.data.gender = optionalText(input.gender);
      changed = true;
    }
    if (input.placeOfResidence !== undefined) {
      this.data.placeOfResidence = optionalText(input.placeOfResidence);
      changed = true;
    }
    if (input.contacts !== undefined) {
      this.replaceContacts(input.contacts);
      changed = true;
    }
    if (input.subscriptions !== undefined) {
      this.replaceSubscriptions(input.subscriptions);
      changed = true;
    }
    if (input.ministries !== undefined) {
      this.replaceMinistries(input.ministries);
      changed = true;
    }

    if (!changed) throw new ValidationError('No fields to update');
    this.touch();
  }

  addContact(input: ContactInput): Contact {
    const contact: Contact = {
      id: randomUUID(),
      channel: input.channel,
      value: requiredText(input.value, 'contact value'),
      label: optionalText(input.label),
      preferred: input.preferred ?? this.data.contacts.length === 0,
    };

    this.assertUniqueContacts([...this.data.contacts, contact]);
    if (contact.preferred) {
      for (const existing of this.data.contacts) existing.preferred = false;
    }
    this.data.contacts.push(contact);
    this.touch();
    return contact;
  }

  removeContact(contactId: string): void {
    const index = this.data.contacts.findIndex((contact) => contact.id === contactId);
    if (index === -1) throw new NotFoundError(`Contact ${contactId} was not found`);

    const [removed] = this.data.contacts.splice(index, 1);
    if (removed?.preferred && this.data.contacts.length > 0) {
      this.data.contacts[0].preferred = true;
    }
    this.touch();
  }

  subscribe(kind: SubscriptionKind): void {
    if (this.data.subscriptions.some((item) => item.kind === kind && item.status === 'active')) {
      throw new ConflictError(`Member is already subscribed to ${kind}`);
    }

    const existing = this.data.subscriptions.find((item) => item.kind === kind);
    if (existing) {
      existing.status = 'active';
      existing.since = now();
    } else {
      this.data.subscriptions.push({ kind, status: 'active', since: now() });
    }
    this.touch();
  }

  unsubscribe(kind: SubscriptionKind): void {
    const subscription = this.data.subscriptions.find(
      (item) => item.kind === kind && item.status === 'active',
    );
    if (!subscription) throw new NotFoundError(`No active ${kind} subscription was found`);

    subscription.status = 'inactive';
    this.touch();
  }

  assignMinistry(ministry: Ministry): void {
    if (this.data.ministries.includes(ministry)) {
      throw new ConflictError(`Member already serves in ${ministry}`);
    }
    this.data.ministries.push(ministry);
    this.touch();
  }

  removeMinistry(ministry: Ministry): void {
    const index = this.data.ministries.indexOf(ministry);
    if (index === -1) throw new NotFoundError(`Member does not serve in ${ministry}`);
    this.data.ministries.splice(index, 1);
    this.touch();
  }

  recordAttendance(entry: AttendanceEntry): void {
    const eventNo = requiredText(entry.eventNo, 'eventNo');
    const eventName = requiredText(entry.eventName, 'eventName');
    const date = validateDate(entry.date, 'date');
    if (!date) throw new ValidationError('date is required');

    const duplicate = this.data.attendance.some(
      (item) => item.eventNo === eventNo && item.date === date,
    );
    if (duplicate) {
      throw new ConflictError(`Attendance for event ${eventNo} on ${date} already exists`);
    }

    this.data.attendance.push({
      eventNo,
      eventName,
      date,
      ministry: optionalText(entry.ministry),
    });
    this.touch();
  }

  attendanceSummary(): AttendanceSummaryItem[] {
    const summary = new Map<string, AttendanceSummaryItem>();
    for (const entry of this.data.attendance) {
      const current = summary.get(entry.eventName);
      if (!current) {
        summary.set(entry.eventName, {
          eventName: entry.eventName,
          attendances: 1,
          lastDate: entry.date,
        });
        continue;
      }
      current.attendances += 1;
      if (entry.date > current.lastDate) current.lastDate = entry.date;
    }

    return [...summary.values()].sort((left, right) =>
      left.eventName.localeCompare(right.eventName),
    );
  }

  toJSON(): MemberSnapshot {
    return clone(this.data);
  }

  private replaceContacts(inputs: ContactInput[]): void {
    const next: Contact[] = inputs.map((input) => {
      const existing = input.id
        ? this.data.contacts.find((contact) => contact.id === input.id)
        : undefined;
      return {
        id: existing?.id ?? randomUUID(),
        channel: input.channel,
        value: requiredText(input.value, 'contact value'),
        label: optionalText(input.label),
        preferred: input.preferred ?? existing?.preferred ?? false,
      };
    });

    this.assertUniqueContacts(next);
    if (next.length > 0 && !next.some((contact) => contact.preferred)) {
      next[0].preferred = true;
    }
    this.data.contacts = next;
    this.touch();
  }

  private replaceSubscriptions(kinds: SubscriptionKind[]): void {
    const unique = [...new Set(kinds)];
    this.data.subscriptions = unique.map((kind) => {
      const existing = this.data.subscriptions.find((item) => item.kind === kind);
      return existing ?? { kind, status: 'active' as const, since: now() };
    });
    this.touch();
  }

  private replaceMinistries(ministries: Ministry[]): void {
    this.data.ministries = [...new Set(ministries)];
    this.touch();
  }

  private assertUniqueContacts(contacts: Contact[]): void {
    const seen = new Set<string>();
    for (const contact of contacts) {
      const key = `${contact.channel}:${contact.value.toLowerCase()}`;
      if (seen.has(key)) {
        throw new ConflictError(`Duplicate contact ${contact.channel}: ${contact.value}`);
      }
      seen.add(key);
    }
  }

  private touch(): void {
    this.data.updatedAt = now();
  }
}
