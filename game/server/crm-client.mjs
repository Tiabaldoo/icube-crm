// Клиент внутреннего API CRM (127.0.0.1:3001). Игра не знает ничего о базе CRM:
// только два метода этапа 2 — verify-child и status.
//
// Ответ: { ok: true, data } | { ok: false, status, code } (CRM ответила отказом)
//        | { ok: false, unavailable: true, reason } (CRM не ответила или настроена не так).
const TOKEN_HEADER = 'x-game-internal-token';

export function createCrmClient({ baseUrl, token, fetchImpl = fetch, verifyTimeoutMs = 15_000, statusTimeoutMs = 3_000, logger = console }) {
  async function call(method, path, body, timeoutMs) {
    let response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        method,
        headers: { [TOKEN_HEADER]: token, ...(body ? { 'content-type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      return { ok: false, unavailable: true, reason: error?.name === 'TimeoutError' ? 'timeout' : 'network' };
    }
    let payload = null;
    try { payload = await response.json(); } catch { /* тело не JSON — разберёмся по статусу */ }
    if (response.ok && payload && typeof payload === 'object' && 'data' in payload) return { ok: true, data: payload.data };
    const code = payload?.error?.code ?? null;
    // 404 без пути отдаёт и CRM с выключенным флагом, и CRM с другим секретом: это ошибка настройки, а не отказ ребёнку.
    if (response.status === 404) {
      logger.error('Внутренний API CRM ответил 404: проверьте GAME_ENABLED и GAME_INTERNAL_TOKEN');
      return { ok: false, unavailable: true, reason: 'not_found' };
    }
    if (response.status >= 500) return { ok: false, unavailable: true, reason: `http_${response.status}` };
    return { ok: false, status: response.status, code };
  }

  return {
    verifyChild: ({ login, password, clientIp }) => call('POST', '/internal/game/verify-child', { login, password, clientIp }, verifyTimeoutMs),
    status: (childId) => call('GET', `/internal/game/children/${encodeURIComponent(childId)}/status`, null, statusTimeoutMs),
  };
}
