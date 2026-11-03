import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLoginQueue, LoginQueueFull } from '../server/login-queue.mjs';

const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
const tick = () => new Promise((resolve) => setImmediate(resolve));

test('с одного адреса одновременно не больше 3 проверок, всего не больше 8', async () => {
  const queue = createLoginQueue({ maxActive: 8, maxActivePerIp: 3, maxWaiting: 100, maxWaitingPerIp: 30, waitTimeoutMs: 5000 });
  let running = 0; let peak = 0; let peakA = 0; let runningA = 0;
  const gates = [];
  const job = (ip) => queue.run(ip, async () => {
    running += 1; peak = Math.max(peak, running);
    if (ip === 'A') { runningA += 1; peakA = Math.max(peakA, runningA); }
    const gate = deferred(); gates.push(gate); await gate.promise;
    running -= 1; if (ip === 'A') runningA -= 1;
  });
  const jobs = [...Array(15)].map(() => job('A'));
  const others = ['B', 'C', 'D', 'E', 'F', 'G'].map(job);
  await tick();
  assert.deepEqual([runningA, running], [3, 8]);
  while (gates.length) { gates.shift().resolve(); await tick(); await tick(); }
  await Promise.all([...jobs, ...others]);
  assert.deepEqual([peakA, peak], [3, 8]);
});

test('адрес, у которого нет свободных мест, не задерживает другие адреса', async () => {
  const queue = createLoginQueue({ maxActive: 8, maxActivePerIp: 3, maxWaiting: 100, maxWaitingPerIp: 30, waitTimeoutMs: 5000 });
  const gate = deferred();
  const blocked = [...Array(5)].map(() => queue.run('A', () => gate.promise));
  await tick();
  let otherDone = false;
  await queue.run('B', async () => { otherDone = true; });
  assert.equal(otherDone, true);
  gate.resolve(); await Promise.all(blocked);
  assert.deepEqual(queue.size(), { active: 0, waiting: 0 });
});

test('переполнение очереди и долгое ожидание дают отказ, ошибка задачи освобождает место', async () => {
  const queue = createLoginQueue({ maxActive: 1, maxActivePerIp: 1, maxWaiting: 2, maxWaitingPerIp: 1, waitTimeoutMs: 30 });
  const gate = deferred();
  const first = queue.run('A', () => gate.promise);
  const waiting = queue.run('A', async () => {});
  await assert.rejects(queue.run('A', async () => {}), LoginQueueFull);
  await assert.rejects(waiting, LoginQueueFull);
  gate.resolve(); await first;
  await assert.rejects(queue.run('A', async () => { throw new Error('сбой'); }), /сбой/);
  assert.deepEqual(queue.size(), { active: 0, waiting: 0 });
});

test('IPv6 одной сети /64 делит один предел, как в CRM', async () => {
  const { queueKey } = await import('../server/login-queue.mjs');
  assert.equal(queueKey('2001:db8:1:2::1'), queueKey('2001:db8:1:2:aaaa:bbbb:cccc:dddd'));
  assert.notEqual(queueKey('2001:db8:1:2::1'), queueKey('2001:db8:1:3::1'));
  assert.equal(queueKey('203.0.113.7'), '203.0.113.7');
  const queue = createLoginQueue({ maxActive: 8, maxActivePerIp: 3, maxWaiting: 100, maxWaitingPerIp: 30, waitTimeoutMs: 5000 });
  const gate = deferred(); let running = 0; let peak = 0;
  const jobs = [...Array(6)].map((_, index) => queue.run(`2001:db8:1:2::${index + 1}`, async () => { running += 1; peak = Math.max(peak, running); await gate.promise; running -= 1; }));
  await tick();
  assert.equal(peak, 3);
  gate.resolve(); await Promise.all(jobs);
});
