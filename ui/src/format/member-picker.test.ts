import { describe, expect, it } from 'vitest';
import { toMemberPickerOptions } from './member-picker';

describe('toMemberPickerOptions', () => {
  it('maps the list page to memberNo — name labels', () => {
    expect(
      toMemberPickerOptions([
        { memberNo: 'M-1001', firstName: 'Ama', lastName: 'Mensah' },
        { memberNo: 'M-1002', firstName: 'Kofi', lastName: 'Owusu' },
      ]),
    ).toEqual([
      { memberNo: 'M-1001', name: 'Ama Mensah', label: 'M-1001 — Ama Mensah' },
      { memberNo: 'M-1002', name: 'Kofi Owusu', label: 'M-1002 — Kofi Owusu' },
    ]);
  });

  it('falls back to other names and then the member number', () => {
    expect(
      toMemberPickerOptions([
        { memberNo: 'M-1003', firstName: '', lastName: '', otherNames: 'Akosua' },
        { memberNo: 'M-1004', firstName: '', lastName: '', otherNames: null },
      ]),
    ).toEqual([
      { memberNo: 'M-1003', name: 'Akosua', label: 'M-1003 — Akosua' },
      { memberNo: 'M-1004', name: '', label: 'M-1004' },
    ]);
  });

  it('caps the options at ten rows', () => {
    const members = Array.from({ length: 12 }, (_, index) => ({
      memberNo: `M-${1000 + index}`,
      firstName: 'Member',
      lastName: String(index),
    }));

    expect(toMemberPickerOptions(members)).toHaveLength(10);
  });

  it('excludes before the cap so an excluded member never costs a row', () => {
    const members = Array.from({ length: 11 }, (_, index) => ({
      memberNo: `M-${1000 + index}`,
      firstName: 'Member',
      lastName: String(index),
    }));

    const options = toMemberPickerOptions(members, 'M-1000');

    expect(options).toHaveLength(10);
    expect(options.map((option) => option.memberNo)).not.toContain('M-1000');
    expect(options.at(-1)?.memberNo).toBe('M-1010');
  });
});
