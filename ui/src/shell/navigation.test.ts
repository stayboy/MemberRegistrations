import { describe, expect, it } from 'vitest';
import { navItemForPath, SECTIONS, sectionForPath } from './navigation';

describe('contextual section resolution', () => {
  it('maps a section route to its section and first submenu', () => {
    expect(sectionForPath('/members').id).toBe('members');
    expect(sectionForPath('/members/new').id).toBe('members');
    expect(navItemForPath('/members/new').label).toBe('Add member');
  });

  it('keeps All members active for a member detail route', () => {
    expect(navItemForPath('/members/M-1001').label).toBe('All members');
    expect(sectionForPath('/members/M-1001').id).toBe('members');
  });

  it('treats the connect gate and settings as Admin surfaces', () => {
    expect(sectionForPath('/connect').id).toBe('admin');
    expect(sectionForPath('/settings').id).toBe('admin');
    expect(navItemForPath('/connect').label).toBe('API connection');
  });

  it('maps each top-level section', () => {
    expect(sectionForPath('/events/series').id).toBe('events');
    expect(sectionForPath('/imports/attendance').id).toBe('imports');
    expect(sectionForPath('/shepherding/roster').id).toBe('shepherding');
    expect(sectionForPath('/admin/ministries').id).toBe('admin');
  });

  it('names the member database import and retires the event list', () => {
    expect(navItemForPath('/imports/members').label).toBe('Member database');
    expect(navItemForPath('/imports/batches').label).toBe('Batch lookup');

    const imports = SECTIONS.find((section) => section.id === 'imports');
    expect(imports?.items.map((item) => item.path)).not.toContain('/imports/events');
  });

  it('advertises no retired route (AC-51)', () => {
    const paths = SECTIONS.flatMap((section) => section.items.map((item) => item.path));
    // Attendance is imported from a session row and a series is an activity, so neither has a page.
    expect(paths).not.toContain('/imports/attendance');
    expect(paths).not.toContain('/events/series');
  });

  it('keeps headcount off the USSD section, because a count needs its activity', () => {
    const ussd = SECTIONS.find((section) => section.id === 'ussd');
    expect(ussd?.items.map((item) => item.path)).not.toContain('/ussd/headcount');
  });
});
