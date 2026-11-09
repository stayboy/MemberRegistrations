import { describe, expect, it } from 'vitest';
import { showsUssdProductionNotice } from './PageFrame';

describe('USSD production notice', () => {
  it('shows on every USSD operator page in production except the Simulator', () => {
    expect(showsUssdProductionNotice('ussd', '/ussd/codes', true)).toBe(true);
    expect(showsUssdProductionNotice('ussd', '/ussd/headcount', true)).toBe(true);
    expect(showsUssdProductionNotice('ussd', '/ussd/simulator', true)).toBe(false);
    expect(showsUssdProductionNotice('members', '/members', true)).toBe(false);
    expect(showsUssdProductionNotice('ussd', '/ussd/codes', false)).toBe(false);
  });
});
