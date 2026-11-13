import { Button } from '@fluentui/react-components';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { EventOfferingItem } from '../../api/events';
import { MemberPicker } from '../../components/MemberPicker';
import { AnnouncedOffertoryForm, PledgeForm } from './OfferingGivingForms';

/**
 * The UI Vitest environment is node-only (`documents/rounds/members-list-ui.md`), so there is no
 * DOM and no React Testing Library here. These tests invoke the form functions directly with a
 * state store standing in for React's hook dispatcher, then drive the picker's `onChange`, the
 * amount input and the submit button through the element tree the form returns. That keeps the
 * assertion where it belongs — a picked member reaches the submitted payload — without changing
 * the component or adding a DOM dependency.
 */
const hookStore = vi.hoisted(() => {
  const cells: unknown[] = [];
  let cursor = 0;

  return {
    reset(): void {
      cells.length = 0;
      cursor = 0;
    },
    begin(): void {
      cursor = 0;
    },
    useState<T>(initial: T | (() => T)): [T, (next: T | ((previous: T) => T)) => void] {
      const at = cursor;
      cursor += 1;
      if (at >= cells.length) {
        cells[at] = typeof initial === 'function' ? (initial as () => T)() : initial;
      }
      const set = (next: T | ((previous: T) => T)): void => {
        const previous = cells[at] as T;
        cells[at] = typeof next === 'function' ? (next as (value: T) => T)(previous) : next;
      };
      return [cells[at] as T, set];
    },
  };
});

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return { ...actual, useState: hookStore.useState };
});

// Griffel's `makeStyles` hook reads React context; the form only uses the class names.
vi.mock('./ussd-styles', () => ({ useUssdStyles: () => ({}) }));

// The follow-up default needs the session and query providers, which this dispatcher harness does
// not mount. The existing cases cover a member whose shepherd is active: the officer stays
// optional. The states themselves are covered in the DOM lane.
vi.mock('../../hooks/useFollowUpDefault', () => ({
  useFollowUpDefault: () => ({
    status: 'ready',
    shepherd: {
      memberNo: 'M-1002',
      name: 'Kwesi Boateng',
      gender: 'male',
      age: 41,
    },
  }),
}));

const OFFERINGS: readonly EventOfferingItem[] = [
  {
    offeringId: 'offering-1',
    name: 'Tithe',
    availableUntil: null,
    expired: false,
    terms: {
      version: 1,
      name: 'Tithe',
      purpose: 'The regular tithe',
      kind: 'tithe',
      currency: 'GHS',
      targetMinor: null,
      defaultAmountMinor: null,
      startsOn: null,
      endsOn: null,
      availableUntil: null,
      scripture: null,
      gatewayAccount: null,
      gatewayMetadata: null,
      createdAt: '2026-01-01T09:00:00.000Z',
      createdBy: 'officer-1',
      reason: null,
    },
    exceptions: [],
    stats: {
      attachedEvents: 1,
      pledgedMinor: 0,
      paidMinor: 0,
      pendingMinor: 0,
      honorRate: 0,
      contributionCount: 0,
    },
  },
];

interface ElementNode {
  readonly type: unknown;
  readonly props: Record<string, unknown>;
}

function isElementNode(value: unknown): value is ElementNode {
  return typeof value === 'object' && value !== null && 'type' in value && 'props' in value;
}

function childNodes(node: unknown): unknown[] {
  return Array.isArray(node) ? node.flatMap(childNodes) : [node];
}

function findNodes(node: unknown, match: (candidate: ElementNode) => boolean): ElementNode[] {
  const found: ElementNode[] = [];
  for (const candidate of childNodes(node)) {
    if (!isElementNode(candidate)) continue;
    if (match(candidate)) found.push(candidate);
    found.push(...findNodes(candidate.props.children, match));
  }
  return found;
}

function onlyMatch(
  node: unknown,
  match: (candidate: ElementNode) => boolean,
  what: string,
): ElementNode {
  const matches = findNodes(node, match);
  if (matches.length !== 1) throw new Error(`expected one ${what}, found ${matches.length}`);
  return matches[0] as ElementNode;
}

interface FormHarness {
  /** The picker the caller labelled `label`, from the latest render. */
  picker(label: string): ElementNode;
  /** A selection handed to the picker, as the picker's `onChange` reports it. */
  select(label: string, memberNo: string | null): void;
  /** Text typed into the amount input. */
  typeAmount(value: string): void;
  /** Text typed into the instruction note, which is always rendered and optional. */
  typeNote(value: string): void;
  /** The pressed primary action of the latest render. */
  submit(): void;
}

function harness(render: () => ReactNode): FormHarness {
  let tree: unknown;
  const draw = (): void => {
    hookStore.begin();
    tree = render();
  };
  draw();

  return {
    picker(label) {
      return onlyMatch(
        tree,
        (node) => node.type === MemberPicker && node.props.label === label,
        `picker labelled ${label}`,
      );
    },
    select(label, memberNo) {
      const onChange = this.picker(label).props.onChange;
      if (typeof onChange !== 'function') throw new Error('the picker has no onChange');
      (onChange as (value: string | null) => void)(memberNo);
      draw();
    },
    typeAmount(value) {
      const input = onlyMatch(
        tree,
        (node) =>
          node.props.placeholder === 'e.g. 50.00' || node.props.placeholder === 'e.g. 100.00',
        'amount input',
      );
      const onChange = input.props.onChange;
      if (typeof onChange !== 'function') throw new Error('the amount input has no onChange');
      (onChange as (event: unknown, data: { value: string }) => void)({}, { value });
      draw();
    },
    typeNote(value) {
      const field = onlyMatch(
        tree,
        (node) => node.props.label === 'Note for the follow-up officer',
        'follow-up note field',
      );
      const input = onlyMatch(
        field.props.children,
        (node) => typeof node.props.onChange === 'function',
        'follow-up note input',
      );
      const onChange = input.props.onChange;
      if (typeof onChange !== 'function') throw new Error('the note input has no onChange');
      (onChange as (event: unknown, data: { value: string }) => void)({}, { value });
      draw();
    },
    submit() {
      const button = onlyMatch(
        tree,
        (node) => node.type === Button && node.props.appearance === 'primary',
        'primary action',
      );
      const onClick = button.props.onClick;
      if (typeof onClick !== 'function') throw new Error('the primary action has no onClick');
      (onClick as () => void)();
      draw();
    },
  };
}

function offertoryForm(onSubmit: (input: unknown) => void): FormHarness {
  return harness(() =>
    AnnouncedOffertoryForm({
      offerings: OFFERINGS,
      defaultSessionDate: '2026-11-01',
      currency: 'GHS',
      pending: false,
      notice: null,
      error: null,
      onSubmit,
      onCancel: () => {},
    }),
  );
}

function pledgeForm(onSubmit: (input: unknown) => void): FormHarness {
  return harness(() =>
    PledgeForm({
      offerings: OFFERINGS,
      currency: 'GHS',
      pending: false,
      notice: null,
      error: null,
      onSubmit,
      onCancel: () => {},
    }),
  );
}

describe('AnnouncedOffertoryForm', () => {
  it('the offertory form picks a member by name', () => {
    hookStore.reset();
    const onSubmit = vi.fn();
    const form = offertoryForm(onSubmit);

    // The shared picker carries the member's accessible name; its option label is the picker's own
    // concern, so nothing here pins the label text.
    expect(form.picker('Member').type).toBe(MemberPicker);

    form.select('Member', 'M-1001');
    expect(form.picker('Member').props.value).toBe('M-1001');

    form.typeAmount('50.00');
    form.submit();

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      memberNo: 'M-1001',
      offeringId: 'offering-1',
      sessionDate: '2026-11-01',
      amountMinor: 5000,
    });
  });

  it('the offertory form requires a picked member and shows it when cleared', () => {
    hookStore.reset();
    const onSubmit = vi.fn();
    const form = offertoryForm(onSubmit);

    form.typeAmount('50.00');
    form.submit();

    expect(onSubmit).not.toHaveBeenCalled();
    expect(form.picker('Member').props.validationState).toBe('error');
    expect(form.picker('Member').props.validationMessage).toBe('Pick the member.');

    form.select('Member', 'M-1001');
    expect(form.picker('Member').props.validationState).toBeUndefined();

    form.select('Member', null);
    expect(form.picker('Member').props.validationState).toBe('error');
  });
});

describe('PledgeForm', () => {
  it('the pledge form picks a member by name', () => {
    hookStore.reset();
    const onSubmit = vi.fn();
    const form = pledgeForm(onSubmit);

    expect(form.picker('Member').type).toBe(MemberPicker);

    form.select('Member', 'M-1001');
    expect(form.picker('Member').props.value).toBe('M-1001');

    form.typeAmount('100.00');
    form.submit();

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      memberNo: 'M-1001',
      offeringId: 'offering-1',
      amountMinor: 10_000,
    });
  });

  it('the pledge form requires a picked member and shows it when cleared', () => {
    hookStore.reset();
    const onSubmit = vi.fn();
    const form = pledgeForm(onSubmit);

    form.typeAmount('100.00');
    form.submit();

    expect(onSubmit).not.toHaveBeenCalled();
    expect(form.picker('Member').props.validationState).toBe('error');
    expect(form.picker('Member').props.validationMessage).toBe('Pick the member.');

    form.select('Member', 'M-1001');
    expect(form.picker('Member').props.validationState).toBeUndefined();
  });

  it('the pledge form picks the follow-up officer', () => {
    hookStore.reset();
    const onSubmit = vi.fn();
    const form = pledgeForm(onSubmit);

    // The follow-up officer is optional (FR-26: the API falls back to the shepherd), so a clear
    // field is not an error; a picked officer must reach the payload, and the note written with it
    // travels as the optional instruction note.
    expect(form.picker('Follow-up officer').type).toBe(MemberPicker);

    form.select('Member', 'M-1001');
    form.select('Follow-up officer', 'M-1002');
    expect(form.picker('Follow-up officer').props.value).toBe('M-1002');

    form.typeAmount('100.00');
    form.typeNote('Called the member');
    form.submit();

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      memberNo: 'M-1001',
      officerMemberNo: 'M-1002',
      officerReason: 'Called the member',
    });
  });

  it('the pledge form submits the note without a follow-up officer', () => {
    hookStore.reset();
    const onSubmit = vi.fn();
    const form = pledgeForm(onSubmit);

    // The note is an instruction to the member's shepherd just as much as to a named presbyter, so
    // it stands alone: sent without `officerMemberNo`.
    form.select('Member', 'M-1001');
    form.typeAmount('100.00');
    form.typeNote('Visit planned for Sunday');
    form.submit();

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const payload = onSubmit.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload).toMatchObject({ officerReason: 'Visit planned for Sunday' });
    expect(payload).not.toHaveProperty('officerMemberNo');
  });

  it('the pledge form submits without a follow-up officer', () => {
    hookStore.reset();
    const onSubmit = vi.fn();
    const form = pledgeForm(onSubmit);

    form.select('Member', 'M-1001');
    form.typeAmount('100.00');
    form.submit();

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const payload = onSubmit.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('officerMemberNo');
    expect(payload).not.toHaveProperty('officerReason');
  });
});
