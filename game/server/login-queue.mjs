import { isIP } from 'node:net';

// Очередь проверок пароля перед CRM. Пределы те же, что у CRM на этапе 2
// (всего 8 проверок, с одного адреса 3), поэтому группа детей за одним адресом
// ждёт своей очереди здесь, а не получает GAME_LOGIN_BUSY от CRM.
export const LOGIN_QUEUE_LIMITS = Object.freeze({
  maxActive: 8, maxActivePerIp: 3, maxWaiting: 200, maxWaitingPerIp: 30, waitTimeoutMs: 20_000,
});

export class LoginQueueFull extends Error {}

// IPv6 группируется по сети /64, как в CRM: иначе смена адресов внутри одной сети обходила бы предел на адрес.
export function queueKey(ip) {
  const text = String(ip ?? '').toLowerCase();
  if (isIP(text) !== 6) return text;
  if (/\d+\.\d+\.\d+\.\d+$/.test(text)) return text;
  const [head, tail = ''] = text.split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const groups = text.includes('::') ? [...left, ...Array(8 - left.length - right.length).fill('0'), ...right] : left;
  return `${groups.slice(0, 4).map((part) => part.padStart(4, '0')).join(':')}::/64`;
}

export function createLoginQueue(limits = LOGIN_QUEUE_LIMITS) {
  let active = 0;
  const activeByIp = new Map();
  const waiting = [];
  const waitingByIp = new Map();
  const add = (map, key, delta) => {
    const value = (map.get(key) ?? 0) + delta;
    if (value > 0) map.set(key, value); else map.delete(key);
  };
  const fits = (ip) => active < limits.maxActive && (activeByIp.get(ip) ?? 0) < limits.maxActivePerIp;

  function start(entry) {
    active += 1; add(activeByIp, entry.ip, 1);
    entry.resolve();
  }

  function pump() {
    for (let index = 0; index < waiting.length && active < limits.maxActive;) {
      const entry = waiting[index];
      if (!fits(entry.ip)) { index += 1; continue; }
      waiting.splice(index, 1); add(waitingByIp, entry.ip, -1);
      clearTimeout(entry.timer);
      start(entry);
    }
  }

  function acquire(ip) {
    if (fits(ip) && !waiting.some((entry) => entry.ip === ip)) { active += 1; add(activeByIp, ip, 1); return Promise.resolve(); }
    if (waiting.length >= limits.maxWaiting || (waitingByIp.get(ip) ?? 0) >= limits.maxWaitingPerIp) {
      return Promise.reject(new LoginQueueFull('Очередь входа переполнена'));
    }
    return new Promise((resolve, reject) => {
      const entry = { ip, resolve, reject, timer: null };
      entry.timer = setTimeout(() => {
        const index = waiting.indexOf(entry);
        if (index < 0) return;
        waiting.splice(index, 1); add(waitingByIp, ip, -1);
        reject(new LoginQueueFull('Очередь входа не дошла'));
      }, limits.waitTimeoutMs);
      entry.timer.unref?.();
      waiting.push(entry); add(waitingByIp, ip, 1);
    });
  }

  function release(ip) {
    active -= 1; add(activeByIp, ip, -1);
    pump();
  }

  async function run(ip, task) {
    const key = queueKey(ip);
    await acquire(key);
    try { return await task(); } finally { release(key); }
  }

  const size = () => ({ active, waiting: waiting.length });
  return { run, size };
}
