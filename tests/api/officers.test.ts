import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OfficerRepository } from '../../src/repos/officers.js';
import { createTestApp, type TestApp } from '../helpers/app.js';

let harness: TestApp;
let officers: OfficerRepository;

beforeAll(async () => {
  harness = await createTestApp();
  officers = new OfficerRepository(harness.db);
});

afterAll(async () => {
  await harness.close();
});

describe('operator officer management', () => {
  it('adds an officer and lists them', async () => {
    const result = await officers.add({
      email: 'Operator@Church.org',
      name: 'Operator One',
      actorId: 'operator-1',
    });

    expect(result).toEqual({ email: 'operator@church.org', reactivated: false });
    const rows = await officers.list();
    expect(rows).toContainEqual({
      email: 'operator@church.org',
      name: 'Operator One',
      actorId: 'operator-1',
      active: true,
    });
  });

  it('re-adding an officer updates and reactivates them', async () => {
    await officers.add({
      email: 'returning@church.org',
      name: 'Returning Officer',
      actorId: 'returning-1',
    });
    await officers.deactivate('returning@church.org');

    const result = await officers.add({
      email: 'returning@church.org',
      name: 'Returning Officer',
      actorId: 'returning-2',
    });

    expect(result.reactivated).toBe(true);
    const officer = (await officers.list()).find((row) => row.email === 'returning@church.org');
    expect(officer).toMatchObject({ actorId: 'returning-2', active: true });
  });

  it('deactivates an officer and rejects an unknown address', async () => {
    await officers.add({
      email: 'gone@church.org',
      name: 'Gone Officer',
      actorId: 'gone',
    });

    await officers.deactivate('gone@church.org');
    const officer = (await officers.list()).find((row) => row.email === 'gone@church.org');
    expect(officer?.active).toBe(false);

    await expect(officers.deactivate('missing@church.org')).rejects.toThrow('No active officer');
  });

  it('rejects invalid input before touching the database', async () => {
    await expect(
      officers.add({ email: 'not-an-email', name: 'No', actorId: 'no' }),
    ).rejects.toThrow('Invalid email');
    await expect(
      officers.add({ email: 'valid@church.org', name: '  ', actorId: 'no' }),
    ).rejects.toThrow('Name is required');
  });
});
