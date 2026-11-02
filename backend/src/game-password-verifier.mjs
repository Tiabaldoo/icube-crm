import { Worker } from 'node:worker_threads';
import { ApiProblem } from './catalog.mjs';

const WORKER_URL = new URL('./game-password-worker.mjs', import.meta.url);
const unavailable = () => new ApiProblem(503, 'GAME_LOGIN_UNAVAILABLE', 'Вход временно недоступен. Повторите позже');

// bcryptjs считает в потоке вызова, поэтому детский вход идёт в отдельном потоке:
// сколько бы запросов ни пришло, основной API CRM продолжает отвечать.
export function createPasswordVerifier({ maxPending = 8, timeoutMs = 10_000, workerUrl = WORKER_URL } = {}) {
  let worker = null;
  let nextId = 0;
  let slots = 0;
  const pending = new Map();

  function settle(id, finish) {
    const entry = pending.get(id);
    if (!entry) return;
    clearTimeout(entry.timer);
    pending.delete(id);
    if (!pending.size) worker?.unref();
    finish(entry);
  }

  function reset(reason) {
    if (reason) console.error(`Проверка паролей игры сброшена: ${reason}`);
    const failed = worker;
    worker = null;
    failed?.terminate().catch(() => {});
    for (const id of [...pending.keys()]) settle(id, ({ reject }) => reject(unavailable()));
  }

  function start() {
    if (worker) return;
    const created = new Worker(workerUrl);
    worker = created;
    created.unref();
    created.on('message', ({ id, matches, failed }) => settle(id, ({ resolve, reject }) => (failed ? reject(unavailable()) : resolve(matches))));
    created.on('error', (error) => { if (worker === created) reset(error?.message ?? 'ошибка потока'); });
    created.on('exit', (code) => { if (worker === created) reset(`поток завершился с кодом ${code}`); });
  }

  function compare(password, hash) {
    start();
    worker.ref();
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reset('превышено время ожидания'), timeoutMs);
      timer.unref();
      pending.set(id, { resolve, reject, timer });
      worker.postMessage({ id, password, hash });
    });
  }

  // Место занимается до запроса к базе: при переполнении вход не нагружает пул соединений CRM.
  function reserve() {
    if (slots >= maxPending) throw new ApiProblem(429, 'GAME_LOGIN_BUSY', 'Сервер занят. Повторите вход через несколько секунд');
    slots += 1;
    let held = true;
    return { compare, release() { if (held) { held = false; slots -= 1; } } };
  }

  async function close() {
    const current = worker;
    worker = null;
    for (const id of [...pending.keys()]) settle(id, ({ reject }) => reject(unavailable()));
    await current?.terminate();
  }

  return { reserve, close, pendingCount: () => slots };
}
