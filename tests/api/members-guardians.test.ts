import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from '../../src/db/migrate.js';
import { MemberRepository } from '../../src/repos/members.js';
import { PresbyterTitleRepository } from '../../src/repos/presbyter-titles.js';
import type { Db } from '../../src/db/sql.js';
import { createTestApp, readHeaders, writeHeaders, type TestApp } from '../helpers/app.js';
import { createScratchPgDb } from '../helpers/scratch-db.js';
import { reachableContacts, testPhone } from '../helpers/member-fixtures.js';

/**
 * Phase 1 of `documents/specs/member-registrations-member-record.md`:
 * the titles reference list, the title fields on create, reachability
 * (`no_contact_or_guardian`, `guardian_required`) and the guardian rules
 * (`guardian_not_eligible`, `guardian_chain_cycle`, `guardian_chain_unreachable`,
 * `guardian_chain_too_long`), the eligibility filter and the detail projection.
 * No migration is involved.
 */
let harness: TestApp;
let app: TestApp['app'];
let seq = 0;

const ADULT = '1990-01-01';

beforeAll(async () => {
  harness = await createTestApp();
  app = harness.app;
});

afterAll(async () => {
  await harness.close();
});

function memberNo(prefix = 'G'): string {
  seq += 1;
  return `${prefix}-${String(seq).padStart(4, '0')}`;
}

async function create(body: Record<string, unknown>): Promise<request.Response> {
  return request(app)
    .post('/v1/members')
    .set(writeHeaders)
    .send({ firstName: 'Test', lastName: 'Member', ...body });
}

/** A member with an own contact, so it can be a guardian. */
async function reachableAdult(extra: Record<string, unknown> = {}): Promise<string> {
  const number = memberNo('A');
  const response = await create({
    memberNo: number,
    dob: ADULT,
    contacts: reachableContacts(),
    ...extra,
  });
  expect(response.status).toBe(201);
  return number;
}

/** A member with no own contact and a guardian link, so it is reachable by chain. */
async function proxyMember(guardianMemberNo: string): Promise<string> {
  const number = memberNo('P');
  const response = await create({ memberNo: number, dob: ADULT, guardianMemberNo });
  expect(response.status).toBe(201);
  return number;
}

/** A member row written straight into the table, bypassing the create rules. */
async function legacyMember(options: {
  withContact?: boolean;
  dob?: string | null;
}): Promise<{ memberNo: string; id: string }> {
  const number = memberNo('L');
  const [row] = await harness.db.query<{ id: string }>(
    `insert into members (member_no, first_name, last_name, gender, dob, created_by, updated_by)
     values ($1, 'Legacy', 'Member', 'undisclosed', $2, 'seed', 'seed')
     returning id`,
    [number, options.dob ?? ADULT],
  );
  if (options.withContact) {
    await harness.db.query(
      `insert into member_contacts (member_id, kind, value, normalized_value, display_order)
       values ($1, 'phone', $2, $3, 1)`,
      [row!.id, testPhone(), `legacy${seq}`],
    );
  }
  return { memberNo: number, id: row!.id };
}

describe('GET /v1/presbyter-titles', () => {
  it('lists the active reference titles ordered by label, behind the bearer', async () => {
    const response = await request(app).get('/v1/presbyter-titles').set(readHeaders).expect(200);

    expect(response.body.items.map((item: { code: string }) => item.code)).toEqual([
      'apostle',
      'deacon',
      'deaconess',
      'elder',
      'pastor',
    ]);
    expect(response.body.items).toContainEqual({
      code: 'elder',
      label: 'Elder',
      genderRestriction: 'male',
      active: true,
    });
    expect(response.body.items).toContainEqual({
      code: 'pastor',
      label: 'Pastor',
      genderRestriction: null,
      active: true,
    });
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('requires the bearer token', async () => {
    await request(app).get('/v1/presbyter-titles').expect(401);
  });
});

describe('create with the title and the card', () => {
  it('stores title, date and card on create and returns them on the detail', async () => {
    const number = memberNo('T');
    const created = await create({
      memberNo: number,
      gender: 'male',
      titleCode: 'elder',
      titledOn: '2020-02-03',
      membershipCardNo: 'MC-1001',
      contacts: reachableContacts(),
    });

    expect(created.status).toBe(201);
    expect(created.body.title).toEqual({ code: 'elder', label: 'Elder', titledOn: '2020-02-03' });
    expect(created.body.membershipCardNo).toBe('MC-1001');

    const detail = await request(app).get(`/v1/members/${number}`).set(readHeaders).expect(200);
    expect(detail.body.title).toEqual({ code: 'elder', label: 'Elder', titledOn: '2020-02-03' });
  });

  it('keeps both null when no title is chosen, and refuses a future date', async () => {
    const plain = await create({ memberNo: memberNo('T'), contacts: reachableContacts() });
    expect(plain.status).toBe(201);
    expect(plain.body.title).toBeNull();

    const future = new Date();
    future.setUTCFullYear(future.getUTCFullYear() + 1);
    const refused = await create({
      memberNo: memberNo('T'),
      gender: 'male',
      titleCode: 'elder',
      titledOn: future.toISOString().slice(0, 10),
      contacts: reachableContacts(),
    });
    expect(refused.status).toBe(422);
    expect(refused.body.code).toBe('validation_error');
    expect(refused.body.detail).toContain('titledOn');
  });

  it('refuses a title the gender forbids and a titledOn without a title', async () => {
    const wrongGender = await create({
      memberNo: memberNo('T'),
      gender: 'male',
      titleCode: 'deaconess',
      contacts: reachableContacts(),
    });
    expect(wrongGender.status).toBe(422);
    expect(wrongGender.body.code).toBe('validation_error');
    expect(wrongGender.body.detail).toContain('Deaconess');

    const orphanDate = await create({
      memberNo: memberNo('T'),
      titledOn: '2020-01-01',
      contacts: reachableContacts(),
    });
    expect(orphanDate.status).toBe(422);
    expect(orphanDate.body.code).toBe('validation_error');

    const unknown = await create({
      memberNo: memberNo('T'),
      titleCode: 'bishop',
      contacts: reachableContacts(),
    });
    expect(unknown.status).toBe(422);
  });
});

describe('create reachability', () => {
  it('refuses a create with no contact and no guardian, and writes nothing', async () => {
    const number = memberNo('R');
    const response = await create({ memberNo: number });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('no_contact_or_guardian');
    await request(app).get(`/v1/members/${number}`).set(readHeaders).expect(404);
  });

  it('writes the member, its contacts and the guardian link in one create', async () => {
    const guardian = await reachableAdult();
    const number = memberNo('R');

    const created = await create({
      memberNo: number,
      guardianMemberNo: guardian,
      contacts: [],
    });

    expect(created.status).toBe(201);
    expect(created.body.contacts).toEqual([]);
    expect(created.body.guardian).toMatchObject({ memberNo: guardian, via: [] });
    expect(created.body.relationships).toEqual([
      expect.objectContaining({ memberNo: guardian, type: 'guardian', isDependent: true }),
    ]);
  });

  it('rolls the member back when the guardian is not eligible', async () => {
    const minor = await reachableAdult({
      dob: new Date(Date.now() - 10 * 365 * 24 * 3600 * 1000).toISOString().slice(0, 10),
    });
    const number = memberNo('R');

    const response = await create({ memberNo: number, guardianMemberNo: minor });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('guardian_not_eligible');
    await request(app).get(`/v1/members/${number}`).set(readHeaders).expect(404);
  });

  it('creates nothing when the named guardian does not exist', async () => {
    const number = memberNo('R');
    const response = await create({ memberNo: number, guardianMemberNo: 'NO-SUCH-MEMBER' });

    expect(response.status).toBe(404);
    await request(app).get(`/v1/members/${number}`).set(readHeaders).expect(404);
  });

  it('refuses an update that would leave a legacy record unreachable', async () => {
    const legacy = await legacyMember({ withContact: false });

    const response = await request(app)
      .put(`/v1/members/${legacy.memberNo}`)
      .set(writeHeaders)
      .send({ placeOfResidence: 'Accra' });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('no_contact_or_guardian');
  });
});

describe('guardian links', () => {
  it('always marks a guardian link dependent and refuses one to itself', async () => {
    const dependent = await reachableAdult();
    const guardian = await reachableAdult();

    const linked = await request(app)
      .post(`/v1/members/${dependent}/relationships`)
      .set(writeHeaders)
      .send({ relatedMemberNo: guardian, type: 'guardian', isDependent: false });
    expect(linked.status).toBe(201);

    const detail = await request(app).get(`/v1/members/${dependent}`).set(readHeaders);
    const edge = detail.body.relationships.find(
      (item: { memberNo: string }) => item.memberNo === guardian,
    );
    expect(edge.isDependent).toBe(true);

    const self = await request(app)
      .post(`/v1/members/${dependent}/relationships`)
      .set(writeHeaders)
      .send({ relatedMemberNo: dependent, type: 'guardian' });
    expect(self.status).toBe(422);
    expect(self.body.code).toBe('guardian_not_eligible');
  });

  it('refuses an under-age guardian and a descendant guardian', async () => {
    const minor = await reachableAdult({
      dob: new Date(Date.now() - 12 * 365 * 24 * 3600 * 1000).toISOString().slice(0, 10),
    });
    const dependent = await reachableAdult();

    const young = await request(app)
      .post(`/v1/members/${dependent}/relationships`)
      .set(writeHeaders)
      .send({ relatedMemberNo: minor, type: 'guardian' });
    expect(young.status).toBe(422);
    expect(young.body.code).toBe('guardian_not_eligible');

    // A proxy member whose chain runs through `dependent` cannot shepherd it back.
    const proxy = await proxyMember(dependent);
    const descendant = await request(app)
      .post(`/v1/members/${dependent}/relationships`)
      .set(writeHeaders)
      .send({ relatedMemberNo: proxy, type: 'guardian' });
    expect(descendant.status).toBe(422);
    expect(descendant.body.code).toBe('guardian_not_eligible');
  });

  it('accepts a direct guardian, a two-link chain and a three-link chain', async () => {
    // A holds a contact; B depends on A, C on B, D on C.
    const a = await reachableAdult();
    const b = await proxyMember(a);
    const c = await proxyMember(b);
    const d = await proxyMember(c);

    const detail = await request(app).get(`/v1/members/${d}`).set(readHeaders).expect(200);
    expect(detail.body.guardian.memberNo).toBe(c);
    expect(detail.body.guardian.via).toEqual([expect.any(String), expect.any(String)]);
  });

  it('refuses a fourth link with guardian_chain_too_long', async () => {
    const a = await reachableAdult();
    const b = await proxyMember(a);
    const c = await proxyMember(b);
    const d = await proxyMember(c);
    const candidate = await reachableAdult();

    // d's chain is three links (d→c→b→a), so a new link would make four.
    const response = await request(app)
      .post(`/v1/members/${candidate}/relationships`)
      .set(writeHeaders)
      .send({ relatedMemberNo: d, type: 'guardian' });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('guardian_chain_too_long');
  });

  it('refuses an unreachable guardian with guardian_chain_unreachable', async () => {
    const dependent = await reachableAdult();
    const stranded = await legacyMember({ withContact: false });

    const response = await request(app)
      .post(`/v1/members/${dependent}/relationships`)
      .set(writeHeaders)
      .send({ relatedMemberNo: stranded.memberNo, type: 'guardian' });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('guardian_chain_unreachable');
  });

  it('refuses a guardian chain that cycles with guardian_chain_cycle', async () => {
    // Legacy rows can hold a cycle that no API call could create (a pair is
    // unique in either direction, so the smallest is three edges); the guard
    // still has to answer the contract's own code.
    const first = await legacyMember({ withContact: false });
    const second = await legacyMember({ withContact: false });
    const third = await legacyMember({ withContact: false });
    await harness.db.query(
      `insert into member_relationships (member_id, related_member_id, type, is_dependent, created_by)
       values ($1,$2,'guardian',true,'seed'), ($2,$3,'guardian',true,'seed'),
              ($3,$1,'guardian',true,'seed')`,
      [first.id, second.id, third.id],
    );

    const dependent = await reachableAdult();
    const response = await request(app)
      .post(`/v1/members/${dependent}/relationships`)
      .set(writeHeaders)
      .send({ relatedMemberNo: first.memberNo, type: 'guardian' });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('guardian_chain_cycle');
  });
});

describe('reachability on removal', () => {
  it('refuses the last guardian of a member with no own contact', async () => {
    const guardian = await reachableAdult();
    const dependent = await proxyMember(guardian);

    const detail = await request(app).get(`/v1/members/${dependent}`).set(readHeaders);
    const edge = detail.body.relationships[0];

    const refused = await request(app)
      .delete(`/v1/members/${dependent}/relationships/${edge.id}`)
      .set(writeHeaders);
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe('guardian_required');

    const after = await request(app).get(`/v1/members/${dependent}`).set(readHeaders);
    expect(after.body.relationships).toHaveLength(1);
  });

  it('refuses a link a dependant relies on', async () => {
    const top = await reachableAdult();
    const middle = await proxyMember(top);
    const leaf = await proxyMember(middle);

    const detail = await request(app).get(`/v1/members/${middle}`).set(readHeaders);
    const edge = detail.body.relationships.find(
      (item: { memberNo: string }) => item.memberNo === top,
    );

    const refused = await request(app)
      .delete(`/v1/members/${middle}/relationships/${edge.id}`)
      .set(writeHeaders);
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe('guardian_required');

    // The leaf is still reachable through the intact link.
    const leafDetail = await request(app).get(`/v1/members/${leaf}`).set(readHeaders);
    expect(leafDetail.body.guardian.memberNo).toBe(middle);
  });

  it('removes a guardian from a member that keeps its own contact', async () => {
    const guardian = await reachableAdult();
    const member = memberNo('M');
    const created = await create({
      memberNo: member,
      contacts: reachableContacts(),
      guardianMemberNo: guardian,
    });
    expect(created.status).toBe(201);

    const detail = await request(app).get(`/v1/members/${member}`).set(readHeaders);
    const edge = detail.body.relationships.find(
      (item: { type: string }) => item.type === 'guardian',
    );

    await request(app)
      .delete(`/v1/members/${member}/relationships/${edge.id}`)
      .set(writeHeaders)
      .expect(204);

    const after = await request(app).get(`/v1/members/${member}`).set(readHeaders);
    expect(after.body.guardian).toBeNull();
  });

  it('refuses the last own contact of a member with no guardian', async () => {
    const number = memberNo('C');
    const created = await create({ memberNo: number, contacts: reachableContacts() });
    const contactId = created.body.contacts[0].id as string;

    const refused = await request(app)
      .delete(`/v1/members/${number}/contacts/${contactId}`)
      .set(writeHeaders);
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe('guardian_required');
  });

  it('removes a contact when a guardian still reaches the member', async () => {
    const guardian = await reachableAdult();
    const number = memberNo('C');
    const created = await create({
      memberNo: number,
      contacts: reachableContacts(),
      guardianMemberNo: guardian,
    });
    const contactId = created.body.contacts[0].id as string;

    await request(app)
      .delete(`/v1/members/${number}/contacts/${contactId}`)
      .set(writeHeaders)
      .expect(204);

    const after = await request(app).get(`/v1/members/${number}`).set(readHeaders);
    expect(after.body.contacts).toEqual([]);
    expect(after.body.guardian.memberNo).toBe(guardian);
  });
});

describe('guardian eligibility filter and projection', () => {
  it('lists only reachable adults, excluding the member and its descendants', async () => {
    const subject = await reachableAdult();
    const subjectMinor = await proxyMember(subject);
    const stranger = await reachableAdult();
    const chained = await proxyMember(stranger);

    const response = await request(app)
      .get('/v1/members')
      .query({ guardianEligible: 'true', forMemberNo: subject })
      .set(readHeaders)
      .expect(200);

    const numbers = response.body.items.map((item: { memberNo: string }) => item.memberNo);
    expect(numbers).not.toContain(subject);
    expect(numbers).not.toContain(subjectMinor);
    expect(numbers).toContain(stranger);
    // An adult reached through a chain is eligible, and the chain is named.
    expect(response.body.items).toContainEqual(
      expect.objectContaining({
        memberNo: chained,
        contactMasked: expect.stringMatching(/^\*\*\*\d{2}$/),
        via: [expect.any(String)],
      }),
    );
    // Every candidate is an adult with a resolved contact.
    for (const item of response.body.items as Array<{ contactMasked: string }>) {
      expect(item.contactMasked).not.toBe('');
    }
  });

  it('projects the guardian, its masked contact and the intermediates on the detail', async () => {
    const top = await reachableAdult();
    const middle = await proxyMember(top);

    const direct = await request(app).get(`/v1/members/${middle}`).set(readHeaders).expect(200);
    expect(direct.body.guardian).toMatchObject({
      memberNo: top,
      name: 'Test Member',
      contactMasked: expect.stringMatching(/^\*\*\*\d{2}$/),
      via: [],
    });

    const leaf = await proxyMember(middle);
    const chained = await request(app).get(`/v1/members/${leaf}`).set(readHeaders).expect(200);
    expect(chained.body.guardian.memberNo).toBe(middle);
    // `via` names the members the chain passes after the guardian.
    expect(chained.body.guardian.via).toEqual(['Test Member']);
  });

  it('keeps both a contact and a guardian on a member that has both', async () => {
    const guardian = await reachableAdult();
    const number = memberNo('B');
    const created = await create({
      memberNo: number,
      contacts: reachableContacts(),
      guardianMemberNo: guardian,
    });

    expect(created.status).toBe(201);
    expect(created.body.contacts).toHaveLength(1);
    expect(created.body.guardian.memberNo).toBe(guardian);
  });
});

/**
 * The same rules through the repository on the pooled `pg` driver. Set
 * `TEST_DATABASE_URL` to a scratch server (never production); the block migrates
 * a database of its own and drops it afterwards. Skipped otherwise.
 */
const testDatabaseUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!testDatabaseUrl)('guardians through the pooled pg driver', () => {
  let pooled: Db;
  let repo: MemberRepository;

  beforeAll(async () => {
    pooled = await createScratchPgDb(testDatabaseUrl!);
    await migrate(pooled);
    repo = new MemberRepository(pooled);
  });

  afterAll(async () => {
    await pooled?.close();
  });

  it('refuses an unreachable create and stores a guarded one with its link', async () => {
    await expect(
      repo.create({ memberNo: 'PG-R-1', firstName: 'No', lastName: 'Contact' }, 'seed'),
    ).rejects.toMatchObject({ code: 'no_contact_or_guardian' });
    expect(await repo.get('PG-R-1')).toBeNull();

    const guardian = await repo.create(
      {
        memberNo: 'PG-A-1',
        firstName: 'Guardian',
        lastName: 'Adult',
        dob: ADULT,
        contacts: [{ kind: 'phone', value: testPhone() }],
      },
      'seed',
    );

    const dependent = await repo.create(
      { memberNo: 'PG-P-1', firstName: 'Proxy', lastName: 'Member', guardianMemberNo: 'PG-A-1' },
      'seed',
    );

    expect(dependent.contacts).toEqual([]);
    expect(dependent.guardian).toMatchObject({ memberNo: guardian.memberNo, via: [] });
    expect(dependent.relationships[0]).toMatchObject({ type: 'guardian', isDependent: true });
  });

  it('refuses the last guardian and lists the eligibility filter', async () => {
    const detail = await repo.get('PG-P-1');
    const edge = detail!.relationships[0]!;

    await expect(repo.removeRelationship('PG-P-1', edge.id, 'seed')).rejects.toMatchObject({
      code: 'guardian_required',
    });

    const candidates = await repo.guardianCandidates('PG-P-1');
    expect(candidates.map((candidate) => candidate.memberNo)).toEqual(['PG-A-1']);

    expect(await new PresbyterTitleRepository(pooled).listActive()).toHaveLength(5);
  });
});
