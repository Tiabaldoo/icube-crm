export class ApiError extends Error {
  constructor(message, { status, code, details } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class ApiClient {
  constructor({ baseUrl = '/api/v1', getAccessToken = () => null, fetchImpl = globalThis.fetch } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.getAccessToken = getAccessToken;
    this.fetchImpl = fetchImpl;
  }

  async request(path, { method = 'GET', body, idempotencyKey, signal } = {}) {
    const token = await this.getAccessToken();
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
      signal,
    });
    const payload = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) {
      throw new ApiError(payload?.error?.message ?? 'Ошибка API', {
        status: response.status,
        code: payload?.error?.code,
        details: payload?.error?.details,
      });
    }
    return payload?.data ?? payload;
  }

  list(resource, query = '') { return this.request(`/${resource}${query}`); }
  get(resource, id) { return this.request(`/${resource}/${encodeURIComponent(id)}`); }
  create(resource, value, idempotencyKey) { return this.request(`/${resource}`, { method: 'POST', body: value, idempotencyKey }); }
  update(resource, id, value) { return this.request(`/${resource}/${encodeURIComponent(id)}`, { method: 'PATCH', body: value }); }
}
