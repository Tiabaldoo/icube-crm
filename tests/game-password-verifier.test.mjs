import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import bcrypt from 'bcryptjs';
import { createPasswordVerifier } from '../backend/src/game-password-verifier.mjs';

const hash = bcrypt.hashSync('right-password', 4);
const verifiers = [];
const verifier = (options) => { const value = createPasswordVerifier(options); verifiers.push(value); return value; };
const stuckWorker = new URL('data:text/javascript,import { parentPort } from "node:worker_threads"; parentPort.on("message", () => {});');
const dyingWorker = new URL('data:text/javascript,process.exit(1);');

after(() => Promise.all(verifiers.map((item) => item.close())));

test('проверяет пароль в отдельном потоке', async () => {
  const subject = verifier();
  assert.equal(await subject.compare('right-password', hash), true);
  assert.equal(await subject.compare('wrong', hash), false);
  assert.equal(subject.pendingCount(), 0);
});

test('очередь ограничена: лишний запрос сразу получает отказ, а не копится', async () => {
  const subject = verifier({ maxPending: 2, workerUrl: stuckWorker, timeoutMs: 60_000 });
  const first = subject.compare('a', hash).catch((error) => error);
  const second = subject.compare('b', hash).catch((error) => error);
  assert.throws(() => subject.compare('c', hash), (error) => error.status === 429 && error.code === 'GAME_LOGIN_BUSY');
  assert.equal(subject.pendingCount(), 2);
  await subject.close();
  assert.equal((await first).code, 'GAME_LOGIN_UNAVAILABLE');
  assert.equal((await second).code, 'GAME_LOGIN_UNAVAILABLE');
});

test('зависший поток не держит запрос вечно', async () => {
  const subject = verifier({ workerUrl: stuckWorker, timeoutMs: 50 });
  await assert.rejects(subject.compare('a', hash), (error) => error.status === 503 && error.code === 'GAME_LOGIN_UNAVAILABLE');
  assert.equal(subject.pendingCount(), 0);
});

test('падение потока даёт отказ и не роняет процесс, следующий запрос запускает новый поток', async () => {
  const subject = verifier({ workerUrl: dyingWorker });
  await assert.rejects(subject.compare('a', hash), (error) => error.code === 'GAME_LOGIN_UNAVAILABLE');
  await assert.rejects(subject.compare('a', hash), (error) => error.code === 'GAME_LOGIN_UNAVAILABLE');
});

test('повреждённый хэш не считается совпадением', async () => {
  const subject = verifier();
  assert.equal(await subject.compare('a', 'not-a-hash'), false);
});
