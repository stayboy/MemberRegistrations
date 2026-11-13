import { describe, expect, it } from 'vitest';
import { memberPickerIdentity, toMemberPickerOptions } from './member-picker';

describe('memberPickerIdentity', () => {
  it('uses the one-letter gender code', () => {
    expect(memberPickerIdentity('male', 144)).toBe('M, 12y');
    expect(memberPickerIdentity('female', 26)).toBe('F, 2y');
    expect(memberPickerIdentity('other', 0)).toBe('O, 0m');
    expect(memberPickerIdentity('undisclosed', 12)).toBe('–, 1y');
  });

  it('says months below a year and completed years from twelve', () => {
    expect(memberPickerIdentity('female', 8)).toBe('F, 8m');
    expect(memberPickerIdentity('female', 11)).toBe('F, 11m');
    expect(memberPickerIdentity('female', 12)).toBe('F, 1y');
    expect(memberPickerIdentity('male', 143)).toBe('M, 11y');
  });

  it('shows a dash where a part is unknown', () => {
    expect(memberPickerIdentity('male', null)).toBe('M, –');
    expect(memberPickerIdentity(undefined, 8)).toBe('–, 8m');
    expect(memberPickerIdentity(undefined, null)).toBe('–, –');
  });
});

describe('toMemberPickerOptions', () => {
  it('maps the list page to memberNo · identity labels', () => {
    expect(
      toMemberPickerOptions([
        {
          memberNo: 'M-1001',
          firstName: 'Ama',
          lastName: 'Mensah',
          gender: 'female',
          ageMonths: 384,
        },
        { memberNo: 'M-1002', firstName: 'Kofi', lastName: 'Owusu', gender: 'male', ageMonths: 8 },
      ]),
    ).toEqual([
      {
        memberNo: 'M-1001',
        name: 'Ama Mensah',
        label: 'M-1001 · Ama Mensah (F, 32y)',
      },
      {
        memberNo: 'M-1002',
        name: 'Kofi Owusu',
        label: 'M-1002 · Kofi Owusu (M, 8m)',
      },
    ]);
  });

  it('keeps the plain name composition and dashes the unknown parts', () => {
    expect(
      toMemberPickerOptions([
        { memberNo: 'M-1003', firstName: '', lastName: '', otherNames: 'Akosua' },
        { memberNo: 'M-1004', firstName: '', lastName: '', otherNames: null },
      ]),
    ).toEqual([
      { memberNo: 'M-1003', name: 'Akosua', label: 'M-1003 · Akosua (–, –)' },
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
