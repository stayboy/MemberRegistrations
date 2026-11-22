import { describe, expect, it } from 'vitest';
import { showsUssdProductionNotice } from './PageFrame';

describe('USSD production notice', () => {
  it('shows on every USSD operator page in a deployed build except the Simulator', () => {
    expect(showsUssdProductionNotice('ussd', '/ussd/codes', true, false)).toBe(true);
    expect(showsUssdProductionNotice('ussd', '/ussd/headcount', true, false)).toBe(true);
    expect(showsUssdProductionNotice('ussd', '/ussd/simulator', true, false)).toBe(false);
    expect(showsUssdProductionNotice('members', '/members', true, false)).toBe(false);
    expect(showsUssdProductionNotice('ussd', '/ussd/codes', false, false)).toBe(false);
  });

  it('suppresses the notice in the local console build', () => {
    expect(showsUssdProductionNotice('ussd', '/ussd/codes', true, true)).toBe(false);
    expect(showsUssdProductionNotice('ussd', '/ussd/simulator', true, true)).toBe(false);
    expect(showsUssdProductionNotice('ussd', '/ussd/codes', false, true)).toBe(false);
  });
});
