import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, readHeaders, writeHeaders, type TestApp } from '../helpers/app.js';

let harness: TestApp;
let app: TestApp['app'];

beforeAll(async () => {
  harness = await createTestApp();
  app = harness.app;
});

afterAll(async () => {
  await harness.close();
});

async function create(memberNo: string, extra: Record<string, unknown> = {}) {
  const response = await request(app)
    .post('/v1/members')
    .set(writeHeaders)
    .send({
      memberNo,
      firstName: 'Ama',
      lastName: 'Mensah',
      gender: 'female',
      joinedOn: '2026-01-01',
      ...extra,
    });
  expect(response.status).toBe(201);
  return response;
}

async function read(memberNo: string) {
  const response = await request(app).get(`/v1/members/${memberNo}`).set(readHeaders);
  expect(response.status).toBe(200);
  return response.body;
}

function putTitle(memberNo: string, body: Record<string, unknown>) {
  return request(app).put(`/v1/members/${memberNo}`).set(writeHeaders).send(body);
}

function putPosition(memberNo: string, ministry: string, body: Record<string, unknown>) {
  return request(app)
    .put(`/v1/members/${memberNo}/ministries/${ministry}`)
    .set(writeHeaders)
    .send(body);
}

function tomorrow(): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

async function insertTitle(code: string, label: string, genderRestriction: string | null) {
  await harness.db.query(
    'insert into presbyter_titles (code, label, gender_restriction) values ($1,$2,$3)',
    [code, label, genderRestriction],
  );
}

async function insertPosition(code: string, label: string) {
  await harness.db.query('insert into ministry_positions (code, label) values ($1,$2)', [
    code,
    label,
  ]);
}

describe('wire contract', () => {
  it('publishes the title and position fields and the position route in OpenAPI', async () => {
    const response = await request(app).get('/openapi.json');
    expect(response.status).toBe(200);

    expect(response.body.paths['/v1/members/{memberNo}/ministries/{code}'].put).toBeTruthy();

    const detail = response.body.components.schemas.MemberDetail;
    expect(detail.properties.title).toBeTruthy();
    expect(detail.properties.ministries.items.properties.position).toBeTruthy();

    const update = response.body.components.schemas.UpdateMember;
    expect(update.properties.titleCode).toBeTruthy();
    expect(update.properties.titledOn).toBeTruthy();
  });
});

describe('presbyter titles', () => {
  it('returns the title code, label and date it was taken', async () => {
    await create('M-T101', { gender: 'male' });

    const updated = await putTitle('M-T101', { titleCode: 'pastor', titledOn: '2024-05-12' });
    expect(updated.status).toBe(200);
    expect(updated.body.title).toEqual({
      code: 'pastor',
      label: 'Pastor',
      titledOn: '2024-05-12',
    });
    expect(updated.body.isPresbyter).toBe(false);

    const detail = await read('M-T101');
    expect(detail.title).toEqual({ code: 'pastor', label: 'Pastor', titledOn: '2024-05-12' });

    const list = await request(app).get('/v1/members').query({ q: 'M-T101' }).set(readHeaders);
    expect(list.body.items[0].title).toEqual({
      code: 'pastor',
      label: 'Pastor',
      titledOn: '2024-05-12',
    });
  });

  it('returns title: null, not a missing key, for a member with no title', async () => {
    await create('M-T102');

    const detail = await read('M-T102');
    expect(detail).toHaveProperty('title');
    expect(detail.title).toBeNull();

    const list = await request(app).get('/v1/members').query({ q: 'M-T102' }).set(readHeaders);
    expect(list.body.items[0]).toHaveProperty('title');
    expect(list.body.items[0].title).toBeNull();
  });

  it('stores an undated title and returns a null date', async () => {
    await create('M-T103', { gender: 'female' });

    const updated = await putTitle('M-T103', { titleCode: 'deaconess' });
    expect(updated.status).toBe(200);
    expect(updated.body.title).toEqual({
      code: 'deaconess',
      label: 'Deaconess',
      titledOn: null,
    });
    expect(updated.body.isPresbyter).toBe(false);
  });

  it('refuses a future titledOn and writes nothing', async () => {
    await create('M-T104', { gender: 'male' });

    const refused = await putTitle('M-T104', { titleCode: 'deacon', titledOn: tomorrow() });
    expect(refused.status).toBe(422);
    expect(refused.body.code).toBe('validation_error');
    expect(refused.body.detail).toContain('future');

    const detail = await read('M-T104');
    expect(detail.title).toBeNull();
    expect(detail.isPresbyter).toBe(false);
  });

  it('refuses a title whose gender restriction excludes the member, naming the title', async () => {
    await create('M-T105', { gender: 'female' });

    const refused = await putTitle('M-T105', { titleCode: 'elder' });
    expect(refused.status).toBe(422);
    expect(refused.body.code).toBe('validation_error');
    expect(refused.body.detail).toBe('Elder is restricted to male members');

    const detail = await read('M-T105');
    expect(detail.title).toBeNull();
    expect(detail.isPresbyter).toBe(false);

    const accepted = await putTitle('M-T105', { titleCode: 'deaconess' });
    expect(accepted.status).toBe(200);
    expect(accepted.body.title.code).toBe('deaconess');
  });

  it('clears the title and its date but keeps the presbyter flag', async () => {
    await create('M-T106', { gender: 'male' });

    const titled = await putTitle('M-T106', {
      titleCode: 'deacon',
      titledOn: '2023-02-01',
      isPresbyter: true,
    });
    expect(titled.status).toBe(200);
    expect(titled.body.isPresbyter).toBe(true);

    const cleared = await putTitle('M-T106', { titleCode: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.title).toBeNull();
    expect(cleared.body.isPresbyter).toBe(true);

    const detail = await read('M-T106');
    expect(detail.title).toBeNull();
    expect(detail.isPresbyter).toBe(true);

    const [stored] = await harness.db.query<{ titled_on: string | null }>(
      'select titled_on from members where member_no = $1',
      ['M-T106'],
    );
    expect(stored!.titled_on).toBeNull();

    const flagAlone = await putTitle('M-T106', { isPresbyter: false });
    expect(flagAlone.status).toBe(200);
    expect(flagAlone.body.isPresbyter).toBe(false);
  });

  it('keeps the presbyter flag independent of the title', async () => {
    await create('M-T112', { gender: 'male' });

    const titled = await putTitle('M-T112', { titleCode: 'deacon', isPresbyter: false });
    expect(titled.status).toBe(200);
    expect(titled.body.title).toEqual({ code: 'deacon', label: 'Deacon', titledOn: null });
    expect(titled.body.isPresbyter).toBe(false);

    const storedNow = await read('M-T112');
    expect(storedNow.title).toEqual({ code: 'deacon', label: 'Deacon', titledOn: null });
    expect(storedNow.isPresbyter).toBe(false);

    const flagged = await putTitle('M-T112', { isPresbyter: true });
    expect(flagged.status).toBe(200);
    expect(flagged.body.isPresbyter).toBe(true);
    expect(flagged.body.title).toEqual({ code: 'deacon', label: 'Deacon', titledOn: null });

    const cleared = await putTitle('M-T112', { titleCode: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.title).toBeNull();
    expect(cleared.body.isPresbyter).toBe(true);

    const [stored] = await harness.db.query<{ is_presbyter: boolean; title_code: string | null }>(
      'select is_presbyter, title_code from members where member_no = $1',
      ['M-T112'],
    );
    expect(stored!.is_presbyter).toBe(true);
    expect(stored!.title_code).toBeNull();
  });

  it('refuses a titledOn when the member holds no title', async () => {
    await create('M-T107', { gender: 'male' });

    const refused = await putTitle('M-T107', { titledOn: '2023-02-01' });
    expect(refused.status).toBe(422);
    expect(refused.body.code).toBe('validation_error');
    expect(refused.body.detail).toContain('titledOn');
  });

  it('refuses an unknown or retired title for a new assignment', async () => {
    await insertTitle('bishop', 'Bishop', null);
    await create('M-T108', { gender: 'male' });

    await putTitle('M-T108', { titleCode: 'bishop' }).expect(200);
    await harness.db.query("update presbyter_titles set active = false where code = 'bishop'");

    // A retired title keeps rendering on the member who already holds it.
    expect((await read('M-T108')).title).toEqual({
      code: 'bishop',
      label: 'Bishop',
      titledOn: null,
    });

    await create('M-T109', { gender: 'male' });
    const refused = await putTitle('M-T109', { titleCode: 'bishop' });
    expect(refused.status).toBe(422);
    expect(refused.body.code).toBe('validation_error');
    expect(refused.body.detail).toContain('Unknown title');
    expect((await read('M-T109')).title).toBeNull();

    const unknown = await putTitle('M-T109', { titleCode: 'cardinal' });
    expect(unknown.status).toBe(422);
    expect(unknown.body.detail).toContain('Unknown title');
  });

  it('takes a new title as a row, not code', async () => {
    await insertTitle('evangelist', 'Evangelist', null);
    await create('M-T110', { gender: 'female' });

    const updated = await putTitle('M-T110', { titleCode: 'evangelist' });
    expect(updated.status).toBe(200);
    expect(updated.body.title).toEqual({ code: 'evangelist', label: 'Evangelist', titledOn: null });

    expect((await read('M-T110')).title.label).toBe('Evangelist');
  });
});

describe('ministry positions', () => {
  it('stores one position per ministry and replaces it in place', async () => {
    await create('M-T201', { gender: 'male', ministries: ['CHOIR', 'PRAYER'] });

    const leader = await putPosition('M-T201', 'CHOIR', { positionCode: 'leader' });
    expect(leader.status).toBe(200);
    expect(leader.body).toMatchObject({
      code: 'CHOIR',
      position: { code: 'leader', label: 'Ministry Leader' },
    });

    const secretary = await putPosition('M-T201', 'PRAYER', { positionCode: 'secretary' });
    expect(secretary.status).toBe(200);
    expect(secretary.body.position).toEqual({ code: 'secretary', label: 'Secretary' });

    const detail = await read('M-T201');
    expect(detail.ministries).toEqual([
      { code: 'CHOIR', name: 'Choir', position: { code: 'leader', label: 'Ministry Leader' } },
      { code: 'PRAYER', name: 'Prayer', position: { code: 'secretary', label: 'Secretary' } },
    ]);

    const replaced = await putPosition('M-T201', 'CHOIR', { positionCode: 'assistant-leader' });
    expect(replaced.status).toBe(200);
    expect(replaced.body.position).toEqual({ code: 'assistant-leader', label: 'Asst. Leader' });

    const rows = await harness.db.query<{ position_code: string | null }>(
      `select mm.position_code
         from member_ministries mm
         join members m on m.id = mm.member_id
         join ministries mi on mi.id = mm.ministry_id
        where m.member_no = $1 and mi.code = $2`,
      ['M-T201', 'CHOIR'],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.position_code).toBe('assistant-leader');

    const [count] = await harness.db.query<{ count: number }>(
      `select count(*)::int as count
         from member_ministries mm
         join members m on m.id = mm.member_id
        where m.member_no = $1`,
      ['M-T201'],
    );
    expect(count!.count).toBe(2);

    const cleared = await putPosition('M-T201', 'CHOIR', { positionCode: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.position).toBeNull();
    expect((await read('M-T201')).ministries[0]).toMatchObject({ code: 'CHOIR', position: null });
  });

  it('answers 404 for a ministry the member does not serve in and 422 for an unknown position', async () => {
    await create('M-T202', { gender: 'male', ministries: ['CHOIR'] });

    const notAMember = await putPosition('M-T202', 'PRAYER', { positionCode: 'leader' });
    expect(notAMember.status).toBe(404);
    expect(notAMember.body.code).toBe('not_found');

    const unknown = await putPosition('M-T202', 'CHOIR', { positionCode: 'chief' });
    expect(unknown.status).toBe(422);
    expect(unknown.body.code).toBe('validation_error');
    expect(unknown.body.detail).toContain('Unknown position');

    const detail = await read('M-T202');
    expect(detail.ministries[0].position).toBeNull();
  });

  it('renders a retired position on its holder and refuses it for a new assignment', async () => {
    await insertPosition('coordinator', 'Coordinator');
    await create('M-T203', { gender: 'male', ministries: ['CHOIR', 'PRAYER'] });

    await putPosition('M-T203', 'CHOIR', { positionCode: 'coordinator' }).expect(200);
    await harness.db.query(
      "update ministry_positions set active = false where code = 'coordinator'",
    );

    const detail = await read('M-T203');
    expect(detail.ministries[0].position).toEqual({ code: 'coordinator', label: 'Coordinator' });

    const refused = await putPosition('M-T203', 'PRAYER', { positionCode: 'coordinator' });
    expect(refused.status).toBe(422);
    expect(refused.body.detail).toContain('Unknown position');
  });
});
