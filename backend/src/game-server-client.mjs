// Клиент обратного канала игры (решение Т4): 127.0.0.1:3101, тот же секрет GAME_INTERNAL_TOKEN.
// Код игры CRM не импортирует: только HTTP-контракт из трёх методов.
//
// Ответ: { ok: true, data } | { ok: false, status, code, message } (игра отказала)
//        | { ok: false, unavailable: true } (игра не ответила, выключена или настроена не так).
const TOKEN_HEADER = 'x-game-internal-token';

export function createGameServerClient({ baseUrl, token, fetchImpl = fetch, timeoutMs = 5_000, logger = console }) {
  async function call(method, path, body) {
    let response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        method,
        headers: { [TOKEN_HEADER]: token, ...(body ? { 'content-type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      return { ok: false, unavailable: true };
    }
    let payload = null;
    try { payload = await response.json(); } catch { /* не JSON — разберёмся по статусу */ }
    if (response.ok && payload && typeof payload === 'object' && 'data' in payload) return { ok: true, data: payload.data };
    const code = payload?.error?.code ?? null;
    // 404 без кода — неизвестный путь или неверный секрет: это настройка, а не отказ сотруднику.
    if (response.status === 404 && !String(code ?? '').startsWith('GAME_')) {
      logger.error('Обратный канал игры ответил 404: проверьте GAME_INTERNAL_TOKEN и адрес игры');
      return { ok: false, unavailable: true };
    }
    if (response.status >= 500 || !code) return { ok: false, unavailable: true };
    return { ok: false, status: response.status, code, message: payload?.error?.message ?? null };
  }

  const path = (value) => encodeURIComponent(String(value));
  return {
    grantBonus: (body) => call('POST', '/internal/bonuses', body),
    revokeBonus: (bonusId, body) => call('POST', `/internal/bonuses/${path(bonusId)}/revoke`, body),
    stars: (childId) => call('GET', `/internal/children/${path(childId)}/stars`),
  };
}
