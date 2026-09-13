export const permissions = Object.freeze({
  director: new Set(['*']),
  teacher: new Set([
    'children:read',
    'groups:read',
    'lessons:read',
    'lessons:start',
    'lessons:attendance',
    'lessons:finish',
    'lessons:photos',
    'lessons:extras',
    'lessons:quick-child',
    'lessons:update-assigned',
    'lessons:cancel',
  ]),
  partner: new Set(['partner-settlements:read', 'projects:read']),
  parent: new Set(['own-children:read', 'own-payments:read', 'own-attendance:read']),
  child: new Set(['own-profile:read', 'own-attendance:read']),
});

export function requirePermission(permission) {
  return function permissionMiddleware(request, response, next) {
    const roles = request.auth?.roles ?? [];
    const allowed = roles.some((role) => permissions[role]?.has('*') || permissions[role]?.has(permission));
    if (!allowed) return response.status(403).json({ error: { code: 'FORBIDDEN', message: 'Недостаточно прав' } });
    next();
  };
}

export function authenticate(request, response, next) {
  // Точка расширения для проверки короткоживущего access token и token_version.
  // До реализации входа сервер намеренно не принимает поддельную роль из заголовка.
  if (!request.auth) return response.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Требуется вход' } });
  next();
}
