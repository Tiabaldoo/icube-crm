import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { readFile } from 'node:fs/promises';
import { createSiteRentService, normalizeRentRate } from '../backend/src/site-rent.mjs';
import { createMysqlCatalog } from '../backend/src/catalog.mjs';
import { createDeletionService } from '../backend/src/deletion.mjs';
import { createApiRouter } from '../backend/src/routes.mjs';

function reportRow(overrides = {}) {
  return {
    lesson_id: 101,
    starts_at: '2026-09-05 17:00:00',
    ends_at: '2026-09-05 18:30:00',
    group_id: 7,
    group_name: 'Робототехника · Пт 17:00',
    direction_id_snapshot: 1,
    direction_name: 'Робототехника',
    site_id: 5,
    site_name: 'Школа №1',
    is_intro_group: 0,
    rent_rate: '300.00',
    ...overrides,
  };
}

test('rent rate validation accepts zero/decimals and rejects invalid values', () => {
  assert.equal(normalizeRentRate('0'), '0.00');
  assert.equal(normalizeRentRate('300'), '300.00');
  assert.equal(normalizeRentRate('300.5'), '300.50');
  assert.equal(normalizeRentRate('300.50'), '300.50');
  for (const invalid of ['-100', 'abc', 'NaN', 'Infinity', '1.234', '']) {
    assert.throws(() => normalizeRentRate(invalid), /Ставка аренды/);
  }
});

test('site rent report uses completed iCube lessons, effective site and historical rate in one detail query', async () => {
  let detailSql = '';
  let detailParams;
  const pool = {
    query: async (sql, params = {}) => {
      if (sql.includes('FROM lessons l')) {
        detailSql = sql;
        detailParams = params;
        return [[
          reportRow(),
          reportRow({ lesson_id: 102, starts_at: '2026-09-18 17:00:00', ends_at: '2026-09-18 18:30:00',
            site_id: 8, site_name: 'ДК «Океан»', is_intro_group: 1, rent_rate: '400.00' }),
        ]];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
  const result = await createSiteRentService(pool).report(
    { from: '2026-09-01', to: '2026-09-30' },
    { roles: ['director'] },
  );

  assert.match(detailSql, /p\.code='icube-robots'/);
  assert.match(detailSql, /l\.status='completed'/);
  assert.match(detailSql, /l\.is_empty_trip=FALSE/);
  assert.match(detailSql, /l\.deleted_at IS NULL/);
  assert.match(detailSql, /COALESCE\(l\.site_override_id,l\.site_id_snapshot\)/);
  assert.match(detailSql, /rr2\.valid_from<=l\.starts_at/);
  assert.match(detailSql, /rr2\.valid_to IS NULL OR rr2\.valid_to>l\.starts_at/);
  assert.match(detailSql, /DATE\(l\.starts_at\)>=:from/);
  assert.match(detailSql, /DATE\(l\.starts_at\)<=:to/);
  assert.doesNotMatch(detailSql, /completed_at.*valid_from|actual_starts_at.*valid_from/);
  assert.equal(detailParams.siteId, null);
  assert.equal(result.totalLessons, 2);
  assert.equal(result.totalAmount, '700.00');
  assert.equal(result.details[0].rentRate, '300.00');
  assert.equal(result.details[1].introGroup, true);
  assert.equal(result.details[1].amount, '400.00');
  assert.deepEqual(result.sites.map((site) => [site.siteName, site.lessonCount, site.amount]), [
    ['ДК «Океан»', 1, '400.00'],
    ['Школа №1', 1, '300.00'],
  ]);
});

test('free site lessons still count with zero rent', async () => {
  const service = createSiteRentService({
    query: async (sql) => {
      if (sql.includes('FROM lessons l')) return [[reportRow({ lesson_id: 201, rent_rate: '0.00' }), reportRow({ lesson_id: 202, rent_rate: '0.00' })]];
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  });
  const result = await service.report({ from: '2026-09-01', to: '2026-09-30' }, { roles: ['director'] });
  assert.equal(result.totalLessons, 2);
  assert.equal(result.totalAmount, '0.00');
  assert.equal(result.sites[0].lessonCount, 2);
  assert.equal(result.sites[0].amount, '0.00');
});

test('specific site filter returns successful zero summary when no lessons exist', async () => {
  const calls = [];
  const service = createSiteRentService({
    query: async (sql, params = {}) => {
      calls.push({ sql, params });
      if (sql.includes("p.code='icube-robots' LIMIT 1")) return [[{ id: 5, name: 'Школа №1' }]];
      if (sql.includes('FROM lessons l')) return [[]];
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  });
  const result = await service.report({ siteId: '5', from: '2026-09-01', to: '2026-09-30' }, { roles: ['director'] });
  assert.equal(result.selectedSiteId, '5');
  assert.equal(result.totalLessons, 0);
  assert.equal(result.totalAmount, '0.00');
  assert.deepEqual(result.sites, [{ siteId: '5', siteName: 'Школа №1', lessonCount: 0, amount: '0.00' }]);
  const detail = calls.find((call) => call.sql.includes('FROM lessons l'));
  assert.equal(detail.params.siteId, '5');
  assert.match(detail.sql, /:siteId IS NULL OR COALESCE\(l\.site_override_id,l\.site_id_snapshot\)=:siteId/);
});

test('rent report validates inclusive period and has no history horizon', async () => {
  let sql = '';
  const service = createSiteRentService({
    query: async (statement) => { sql = statement; return [[]]; },
  });
  await service.report({ from: '2025-01-01', to: '2026-09-30' }, { roles: ['director'] });
  assert.match(sql, /DATE\(l\.starts_at\)>=:from/);
  assert.match(sql, /DATE\(l\.starts_at\)<=:to/);
  assert.doesNotMatch(sql, /120|365|CURRENT_DATE|YEAR\(/);
  await assert.rejects(
    service.report({ from: '2026-10-01', to: '2026-09-30' }, { roles: ['director'] }),
    { status: 400, code: 'VALIDATION_ERROR', message: 'Дата начала периода должна быть не позже даты окончания' },
  );
});

test('partner and teacher cannot read rent report at service level', async () => {
  const service = createSiteRentService({ query: async () => [[]] });
  await assert.rejects(service.report({ from: '2026-09-01', to: '2026-09-30' }, { roles: ['partner'] }), { status: 403, code: 'FORBIDDEN' });
  await assert.rejects(service.report({ from: '2026-09-01', to: '2026-09-30' }, { roles: ['teacher'] }), { status: 403, code: 'FORBIDDEN' });
});

test('first rate for existing site is baseline, later change versions it, and same value is a no-op', async () => {
  const context = { roles: ['director'], userId: '1' };

  const baselineCalls = [];
  const baselineExecutor = {
    query: async (sql, params = {}) => {
      baselineCalls.push({ sql, params });
      if (sql.includes('FROM sites s JOIN projects')) return [[{ id: 5, project_code: 'icube-robots' }]];
      if (sql.includes('FROM site_rent_rate_versions') && sql.includes('FOR UPDATE')) return [[]];
      if (sql.startsWith('INSERT INTO site_rent_rate_versions')) return [{ insertId: 41 }];
      throw new Error(`Unexpected baseline SQL: ${sql}`);
    },
  };
  const service = createSiteRentService({ query: async () => [[]] });
  const baseline = await service.setRate(5, '300', context, { executor: baselineExecutor, baseline: true });
  assert.equal(baseline.changed, true);
  const baselineInsert = baselineCalls.find((call) => call.sql.startsWith('INSERT INTO site_rent_rate_versions'));
  assert.match(baselineInsert.sql, /VALUES \(:siteId,:rate,:validFrom,NULL,:actorId\)/);
  assert.equal(baselineInsert.params.validFrom, '1970-01-01 00:00:00');

  const changeCalls = [];
  const changeExecutor = {
    query: async (sql, params = {}) => {
      changeCalls.push({ sql, params });
      if (sql.includes('FROM sites s JOIN projects')) return [[{ id: 5, project_code: 'icube-robots' }]];
      if (sql.includes('FROM site_rent_rate_versions') && sql.includes('FOR UPDATE')) return [[{ id: 41, rate: '300.00', valid_from: '1970-01-01 00:00:00', valid_to: null }]];
      if (sql.startsWith('UPDATE site_rent_rate_versions')) return [{ affectedRows: 1 }];
      if (sql.startsWith('INSERT INTO site_rent_rate_versions')) return [{ insertId: 42 }];
      throw new Error(`Unexpected change SQL: ${sql}`);
    },
  };
  const changed = await service.setRate(5, '400', context, { executor: changeExecutor, baseline: true });
  assert.equal(changed.changed, true);
  assert.ok(changeCalls.some((call) => /SET valid_to=NOW\(6\)/.test(call.sql)));
  const nextInsert = changeCalls.find((call) => call.sql.startsWith('INSERT INTO site_rent_rate_versions'));
  assert.match(nextInsert.sql, /NOW\(6\)/);

  const noopCalls = [];
  const noopExecutor = {
    query: async (sql) => {
      noopCalls.push(sql);
      if (sql.includes('FROM sites s JOIN projects')) return [[{ id: 5, project_code: 'icube-robots' }]];
      if (sql.includes('FROM site_rent_rate_versions') && sql.includes('FOR UPDATE')) return [[{ id: 42, rate: '400.00', valid_from: '2026-10-15 12:00:00', valid_to: null }]];
      throw new Error(`Unexpected noop SQL: ${sql}`);
    },
  };
  const noop = await service.setRate(5, '400.00', context, { executor: noopExecutor, baseline: true });
  assert.equal(noop.changed, false);
  assert.equal(noopCalls.some((sql) => sql.startsWith('INSERT') || sql.startsWith('UPDATE')), false);
});

test('rent rates are director-only and cannot be configured for Zebra sites', async () => {
  const catalog = createMysqlCatalog({ getConnection: async () => { throw new Error('must not open transaction'); } });
  await assert.rejects(
    catalog.create('sites', { name: 'Зебра', shortName: 'Зебра', projectId: '2', rentPerLesson: '300' }, { roles: ['partner'], projectIds: ['2'] }),
    { status: 403, code: 'FORBIDDEN' },
  );

  const connection = {
    beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release() {},
    query: async (sql) => {
      if (sql.includes('SELECT id,code FROM projects WHERE id=')) return [[{ id: 2, code: 'zebra' }]];
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
  const zebraCatalog = createMysqlCatalog({ getConnection: async () => connection });
  await assert.rejects(
    zebraCatalog.create('sites', { name: 'Зебра', shortName: 'Зебра', projectId: '2', rentPerLesson: '300' }, { roles: ['director'], userId: '1' }),
    { status: 400, code: 'VALIDATION_ERROR', message: 'Аренда настраивается только для площадок iCube' },
  );
});

test('director site DTO contains rent data while partner site DTO omits it', async () => {
  const row = { id: 5, project_id: 1, name: 'Школа №1', short_name: 'Школа', type: 'Школа', address: '', note: '', active: 1,
    project_code: 'icube-robots', rent_per_lesson: '300.00', rent_configured: 1 };
  const pool = { query: async (sql) => {
    if (sql.includes('FROM sites s JOIN projects p')) return [[row]];
    if (sql.includes('FROM sites') && !sql.includes('JOIN projects')) return [[row]];
    throw new Error(`Unexpected SQL: ${sql}`);
  } };
  const catalog = createMysqlCatalog(pool, { siteRent: {} });
  const director = (await catalog.list('sites', { roles: ['director'] }))[0];
  assert.equal(director.rentPerLesson, '300.00');
  assert.equal(director.rentConfigured, true);
  const partner = (await catalog.list('sites', { roles: ['partner'], projectIds: ['1'] }))[0];
  assert.equal('rentPerLesson' in partner, false);
  assert.equal('rentConfigured' in partner, false);
});

test('rent history alone does not block physical site deletion', async () => {
  const statements = [];
  const service = createDeletionService({
    query: async (sql) => {
      statements.push(sql);
      if (sql.startsWith('SELECT id FROM sites')) return [[{ id: 5 }]];
      if (sql.includes('(SELECT COUNT(*) FROM study_groups')) return [[{ groupCount: 0, lessons: 0 }]];
      if (sql.startsWith('DELETE FROM sites')) return [{ affectedRows: 1 }];
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  });
  await service.deleteSite(5);
  assert.ok(statements.some((sql) => sql.startsWith('DELETE FROM sites')));
  assert.equal(statements.some((sql) => sql.includes('site_rent_rate_versions')), false);

  const migration = await readFile(new URL('../database/migrations/014_site_rent_rate_versions.sql', import.meta.url), 'utf8');
  assert.match(migration, /FOREIGN KEY \(site_id\) REFERENCES sites\(id\) ON DELETE CASCADE/);
  assert.match(migration, /UNIQUE KEY uq_site_rent_rate_current \(current_site_id\)/);
  assert.match(migration, /KEY idx_site_rent_rate_lookup \(site_id, valid_from, valid_to\)/);
});

async function withRentRoute(role, run) {
  let reportCalls = 0;
  const testAuth = (request, _response, next) => {
    request.auth = { userId: '1', roles: [role], projectIds: role === 'partner' ? ['2'] : [] };
    next();
  };
  const siteRent = { report: async () => { reportCalls += 1; return { totalLessons: 0, totalAmount: '0.00', sites: [], details: [] }; } };
  const app = express();
  app.use(express.json());
  app.use('/api/v1', createApiRouter({ query: async () => [[]] }, { testAuth, siteRent, catalog: { list: async () => [], get: async () => null } }));
  app.use((error, _request, response, _next) => response.status(error.status ?? 500).json({ error: { code: error.code ?? 'INTERNAL_ERROR', message: error.message } }));
  const server = await new Promise((resolve) => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  try {
    await run(`http://127.0.0.1:${server.address().port}/api/v1`, () => reportCalls);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('site-rent-report route is director-only', async () => {
  await withRentRoute('director', async (baseUrl, calls) => {
    const response = await fetch(`${baseUrl}/site-rent-report?from=2026-09-01&to=2026-09-30`);
    assert.equal(response.status, 200);
    assert.equal(calls(), 1);
  });
  for (const role of ['partner', 'teacher']) {
    await withRentRoute(role, async (baseUrl, calls) => {
      const response = await fetch(`${baseUrl}/site-rent-report?from=2026-09-01&to=2026-09-30`);
      assert.equal(response.status, 403);
      assert.equal(calls(), 0);
    });
  }
});
