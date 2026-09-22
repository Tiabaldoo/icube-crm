import assert from 'node:assert/strict';
import test from 'node:test';
import { runMigration, splitSqlStatements } from '../database/migration-runner.mjs';

function fakeConnection() {
  const state = { applied: new Map(), runs: new Map(), steps: new Map(), calls: [], failSecond: true };
  return { state,
    async query(sql) {
      if (sql.startsWith('CREATE TABLE IF NOT EXISTS schema_')) return [{}];
      state.calls.push(sql);
      if (sql === 'STEP_TWO' && state.failSecond) { state.failSecond = false; throw new Error('simulated DDL failure'); }
      return [{}];
    },
    async execute(sql, params = []) {
      if (sql.startsWith('SELECT checksum FROM schema_migrations')) return [[state.applied.has(params[0]) ? { checksum: state.applied.get(params[0]) } : undefined].filter(Boolean)];
      if (sql.startsWith('SELECT checksum,status,current_step FROM schema_migration_runs')) return [[state.runs.get(params[0])].filter(Boolean)];
      if (sql.startsWith('INSERT INTO schema_migration_runs')) { state.runs.set(params[0], { checksum: params[1], status: 'running', current_step: null }); return [{}]; }
      if (sql.startsWith('SELECT statement_checksum,status FROM schema_migration_steps')) return [[state.steps.get(`${params[0]}:${params[1]}`)].filter(Boolean)];
      if (sql.startsWith('INSERT INTO schema_migration_steps')) { state.steps.set(`${params[0]}:${params[1]}`, { statement_checksum: params[2], status: 'started' }); return [{}]; }
      if (sql.startsWith("UPDATE schema_migration_steps SET status='completed'")) { state.steps.get(`${params[0]}:${params[1]}`).status = 'completed'; return [{}]; }
      if (sql.startsWith("UPDATE schema_migration_steps SET status='failed'")) { state.steps.get(`${params[1]}:${params[2]}`).status = 'failed'; return [{}]; }
      if (sql.startsWith("UPDATE schema_migration_runs SET status='running'")) { Object.assign(state.runs.get(params[1]), { status: 'running', current_step: params[0] }); return [{}]; }
      if (sql.startsWith("UPDATE schema_migration_runs SET status='failed'")) { state.runs.get(params[1]).status = 'failed'; return [{}]; }
      if (sql.startsWith('INSERT INTO schema_migrations')) { state.applied.set(params[0], params[1]); return [{}]; }
      if (sql.startsWith("UPDATE schema_migration_runs SET status='completed'")) { state.runs.get(params[0]).status = 'completed'; return [{}]; }
      throw new Error(`Unexpected metadata SQL: ${sql}`);
    } };
}

test('SQL splitter keeps semicolons inside strings and comments intact', () => {
  assert.deepEqual(splitSqlStatements("SELECT ';'; -- ignored ;\nSELECT 2;"), ["SELECT ';'", '-- ignored ;\nSELECT 2']);
});

test('failed migration resumes after its last completed statement and records completion only at the end', async () => {
  const connection = fakeConnection(); const input = { version: '999_test.sql', sql: 'STEP_ONE; STEP_TWO; STEP_THREE;', logger: { log() {} } };
  await assert.rejects(runMigration(connection, input), /simulated DDL failure/);
  assert.equal(connection.state.applied.size, 0);
  assert.deepEqual(connection.state.calls, ['STEP_ONE', 'STEP_TWO']);
  await runMigration(connection, input);
  assert.deepEqual(connection.state.calls, ['STEP_ONE', 'STEP_TWO', 'STEP_TWO', 'STEP_THREE']);
  assert.equal(connection.state.applied.has('999_test.sql'), true);
});

test('ambiguous started DDL step stops for manual schema verification instead of repeating it', async () => {
  const connection = fakeConnection(); const input = { version: '998_ambiguous.sql', sql: 'STEP_ONE; STEP_TWO;', logger: { log() {} } };
  await assert.rejects(runMigration(connection, input), /simulated DDL failure/);
  connection.state.steps.get('998_ambiguous.sql:1').status = 'started';
  const callsBeforeRetry = [...connection.state.calls];
  await assert.rejects(runMigration(connection, input), /прерван в неопределённом состоянии/);
  assert.deepEqual(connection.state.calls, callsBeforeRetry);
  assert.equal(connection.state.applied.size, 0);
});
