import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import bcrypt from 'bcryptjs';
import { createPasswordVerifier } from '../backend/src/game-password-verifier.mjs';

const hash = bcrypt.hashSync('right-password', 4);
const verifiers = [];
const check = async (subject, password, value) => {
  const slot = subject.reserve();
  try { return await slot.compare(password, value); } finally { slot.release(); }
};
const verifier = (options) => { const value = createPasswordVerifier(options); verifiers.push(value); return value; };
const stuckWorker = new URL('data:text/javascript,import { parentPort } from "node:worker_threads"; parentPort.on("message", () => {});');
const dyingWorker = new URL('data:text/javascript,process.exit(1);');

function silence() {
  const original = console.error;
  const lines = [];
  console.error = (text) => lines.push(String(text));
  return { lines, restore() { console.error = original; } };
}

after(() => Promise.all(verifiers.map((item) => item.close())));

test('проверяет пароль в отдельном потоке', async () => {
  const subject = verifier();
  assert.equal(await check(subject, 'right-password', hash), true);
  assert.equal(await check(subject, 'wrong', hash), false);
  assert.equal(subject.pendingCount(), 0);
});

test('очередь ограничена: лишний запрос сразу получает отказ, а не копится', async () => {
  const subject = verifier({ maxPending: 2, workerUrl: stuckWorker, timeoutMs: 60_000 });
  const first = check(subject, 'a', hash).catch((error) => error);
  const second = check(subject, 'b', hash).catch((error) => error);
  assert.throws(() => subject.reserve(), (error) => error.status === 429 && error.code === 'GAME_LOGIN_BUSY');
  assert.equal(subject.pendingCount(), 2);
  await subject.close();
  assert.equal((await first).code, 'GAME_LOGIN_UNAVAILABLE');
  assert.equal((await second).code, 'GAME_LOGIN_UNAVAILABLE');
});

test('зависший поток не держит запрос вечно', async () => {
  const subject = verifier({ workerUrl: stuckWorker, timeoutMs: 50 });
  const errors = silence();
  await assert.rejects(check(subject, 'a', hash), (error) => error.status === 503 && error.code === 'GAME_LOGIN_UNAVAILABLE');
  errors.restore();
  assert.match(errors.lines[0], /превышено время ожидания/);
  assert.doesNotMatch(errors.lines.join(' '), /right-password/);
  assert.equal(subject.pendingCount(), 0);
});

test('падение потока даёт отказ и не роняет процесс, следующий запрос запускает новый поток', async () => {
  const subject = verifier({ workerUrl: dyingWorker });
  const errors = silence();
  await assert.rejects(check(subject, 'a', hash), (error) => error.code === 'GAME_LOGIN_UNAVAILABLE');
  await assert.rejects(check(subject, 'a', hash), (error) => error.code === 'GAME_LOGIN_UNAVAILABLE');
  errors.restore();
  assert.equal(errors.lines.length, 2);
  assert.equal(subject.pendingCount(), 0);
});

test('сбой сравнения даёт отказ и попадает в журнал без хэша', async () => {
  const subject = verifier();
  const broken = `$2a$12$${'!'.repeat(53)}`;
  const errors = silence();
  await assert.rejects(check(subject, 'a', broken), (error) => error.code === 'GAME_LOGIN_UNAVAILABLE');
  errors.restore();
  assert.equal(errors.lines.length, 1);
  assert.equal(errors.lines[0].includes(broken), false);
});

test('повреждённый хэш не считается совпадением', async () => {
  const subject = verifier();
  assert.equal(await check(subject, 'a', 'not-a-hash'), false);
});
