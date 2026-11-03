import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPgDb } from '../../src/db/pg.js';
import { migrate } from '../../src/db/migrate.js';
import type { Db } from '../../src/db/sql.js';
import { ConflictError, NotFoundError } from '../../src/errors/domain-errors.js';
import { MinistryRepository } from '../../src/repos/ministries.js';
import { createTestApp, readHeaders, writeHeaders, type TestApp } from '../helpers/app.js';

let harness: TestApp;
let ministries: MinistryRepository;

beforeAll(async () => {
  harness = await createTestApp();
  ministries = new MinistryRepository(harness.db);
});

afterAll(async () => {
  await harness.close();
});

describe('ministries through Drizzle', () => {
  it('serves the unchanged HTTP contract', async () => {
    const created = await request(harness.app)
      .post('/v1/ministries')
      .set(writeHeaders)
      .send({ code: 'drama', name: 'Drama', description: 'Stage team' });

    expect(created.status).toBe(201);
    expect(created.body).toEqual({
      code: 'DRAMA',
      name: 'Drama',
      description: 'Stage team',
      active: true,
    });

    const read = await request(harness.app).get('/v1/ministries/drama').set(readHeaders);
    expect(read.status).toBe(200);
    expect(read.body).toEqual(created.body);

    const listed = await request(harness.app).get('/v1/ministries').set(readHeaders);
    expect(listed.body.items).toContainEqual(created.body);

    const updated = await request(harness.app)
      .put('/v1/ministries/DRAMA')
      .set(writeHeaders)
      .send({ active: false });
    expect(updated.body.active).toBe(false);
  });

  it('maps a duplicate code to the existing conflict error', async () => {
    await ministries.create({ code: 'USHERS', name: 'Ushers' });

    await expect(
      ministries.create({ code: 'ushers', name: 'Ushers again' }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('maps a foreign-key conflict to the existing conflict error', async () => {
    await ministries.create({ code: 'YOUTH', name: 'Youth' });
    const [ministry] = await harness.db.query<{ id: string }>(
      'select id from ministries where code = $1',
      ['YOUTH'],
    );
    await harness.db.query(
      `insert into members (member_no, first_name, last_name, gender, created_by, updated_by)
       values ('M-9001', 'Test', 'Member', 'undisclosed', 'test', 'test')`,
    );
    const [member] = await harness.db.query<{ id: string }>(
      'select id from members where member_no = $1',
      ['M-9001'],
    );
    await harness.db.query(
      'insert into member_ministries (member_id, ministry_id) values ($1, $2)',
      [member!.id, ministry!.id],
    );

    await expect(ministries.remove('YOUTH')).rejects.toBeInstanceOf(ConflictError);
    expect(await ministries.get('YOUTH')).not.toBeNull();
  });

  it('rejects an unknown ministry with the existing not-found error', async () => {
    await expect(ministries.remove('MISSING')).rejects.toBeInstanceOf(NotFoundError);
    await expect(ministries.update('MISSING', { name: 'x' })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('binds the ORM to the transaction', async () => {
    await expect(
      harness.db.transaction(async (tx) => {
        await new MinistryRepository(tx).create({ code: 'ROLLBACK', name: 'Rollback' });
        throw new Error('roll back');
      }),
    ).rejects.toThrow('roll back');
    expect(await ministries.get('ROLLBACK')).toBeNull();
  });
});

/**
 * The same contract against the pooled `pg` driver. Set `TEST_DATABASE_URL` to a
 * scratch Neon branch (never production) to run it; skipped otherwise.
 */
const testDatabaseUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!testDatabaseUrl)('ministries through Drizzle on the pooled pg driver', () => {
  let pooled: Db;

  beforeAll(async () => {
    pooled = createPgDb(testDatabaseUrl!);
    await migrate(pooled);
  });

  afterAll(async () => {
    await pooled?.close();
  });

  it('runs the same CRUD and conflict mapping', async () => {
    const repo = new MinistryRepository(pooled);
    const code = `ORMT${Date.now().toString().slice(-8)}`;

    try {
      const created = await repo.create({ code, name: 'ORM contract' });
      expect(created).toEqual({ code, name: 'ORM contract', description: null, active: true });
      expect((await repo.get(code.toLowerCase()))?.code).toBe(code);

      await expect(
        repo.create({ code: code.toLowerCase(), name: 'duplicate' }),
      ).rejects.toBeInstanceOf(ConflictError);

      const updated = await repo.update(code, { active: false });
      expect(updated.active).toBe(false);

      await repo.remove(code);
      expect(await repo.get(code)).toBeNull();
    } finally {
      await pooled.query('delete from ministries where code = $1', [code]).catch(() => undefined);
    }
  });

  it('maps a foreign-key conflict to the existing conflict error', async () => {
    const repo = new MinistryRepository(pooled);
    const code = `ORMT${Date.now().toString().slice(-8)}`;
    const memberNo = `M-ORM${Date.now()}`;

    try {
      await repo.create({ code, name: 'ORM fk parity' });
      const [ministry] = await pooled.query<{ id: string }>(
        'select id from ministries where code = $1',
        [code],
      );
      await pooled.query(
        `insert into members (member_no, first_name, last_name, gender, created_by, updated_by)
         values ($1, 'Test', 'Member', 'undisclosed', 'test', 'test')`,
        [memberNo],
      );
      const [member] = await pooled.query<{ id: string }>(
        'select id from members where member_no = $1',
        [memberNo],
      );
      await pooled.query('insert into member_ministries (member_id, ministry_id) values ($1, $2)', [
        member!.id,
        ministry!.id,
      ]);

      await expect(repo.remove(code)).rejects.toBeInstanceOf(ConflictError);
      expect(await repo.get(code)).not.toBeNull();
    } finally {
      await pooled
        .query(
          'delete from member_ministries where ministry_id in (select id from ministries where code = $1)',
          [code],
        )
        .catch(() => undefined);
      await pooled
        .query('delete from members where member_no = $1', [memberNo])
        .catch(() => undefined);
      await pooled.query('delete from ministries where code = $1', [code]).catch(() => undefined);
    }
  });

  it('binds the ORM to the transaction', async () => {
    const repo = new MinistryRepository(pooled);
    const code = `ORMTX${Date.now().toString().slice(-8)}`;

    try {
      await expect(
        pooled.transaction(async (tx) => {
          await new MinistryRepository(tx).create({ code, name: 'ORM tx parity' });
          throw new Error('roll back');
        }),
      ).rejects.toThrow('roll back');
      expect(await repo.get(code)).toBeNull();
    } finally {
      await pooled.query('delete from ministries where code = $1', [code]).catch(() => undefined);
    }
  });
});
