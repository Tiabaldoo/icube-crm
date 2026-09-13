import { Router } from 'express';
import { authenticate, requirePermission } from './auth.mjs';

function notImplemented(resource) {
  return (_request, response) => response.status(501).json({
    error: { code: 'NOT_IMPLEMENTED', message: `${resource}: контракт подготовлен, серверная операция ещё не реализована` },
  });
}

export function createApiRouter(pool) {
  const router = Router();
  router.get('/health', async (_request, response, next) => {
    try {
      await pool.query('SELECT 1');
      response.json({ data: { status: 'ok' } });
    } catch (error) { next(error); }
  });
  router.post('/auth/login', notImplemented('auth/login'));
  router.post('/auth/refresh', notImplemented('auth/refresh'));

  router.use(authenticate);
  const readResources = ['children', 'directions', 'groups', 'sites', 'teachers', 'lessons', 'payments', 'refunds', 'balances', 'notifications'];
  const editableResources = new Set(['children', 'directions', 'groups', 'sites', 'teachers', 'lessons', 'payments', 'refunds']);
  for (const resource of readResources) {
    const readPermission = resource === 'lessons' ? 'lessons:read' : resource === 'groups' ? 'groups:read' : resource === 'children' ? 'children:read' : '*';
    router.get(`/${resource}`, requirePermission(readPermission), notImplemented(resource));
    router.get(`/${resource}/:id`, requirePermission(readPermission), notImplemented(`${resource}/:id`));
    if (editableResources.has(resource)) {
      router.post(`/${resource}`, requirePermission('*'), notImplemented(`POST ${resource}`));
      router.patch(`/${resource}/:id`, requirePermission('*'), notImplemented(`PATCH ${resource}/:id`));
    }
  }
  router.post('/children/:id/enrollments', requirePermission('*'), notImplemented('child enrollment'));
  router.patch('/enrollments/:id', requirePermission('*'), notImplemented('enrollment'));
  router.post('/groups/:id/memberships', requirePermission('*'), notImplemented('group membership'));
  router.post('/lessons/:id/start', requirePermission('lessons:conduct'), notImplemented('lessons/:id/start'));
  router.post('/lessons/:id/finish', requirePermission('lessons:conduct'), notImplemented('lessons/:id/finish'));
  router.post('/lessons/:id/cancel', requirePermission('*'), notImplemented('lessons/:id/cancel'));
  router.put('/lessons/:id/attendance/:childId', requirePermission('lessons:conduct'), notImplemented('lesson attendance'));
  router.post('/balance-transfers', requirePermission('*'), notImplemented('balance-transfers'));
  router.post('/payments/:id/reverse', requirePermission('*'), notImplemented('payment reversal'));
  router.post('/refunds/:id/reverse', requirePermission('*'), notImplemented('refund reversal'));
  router.get('/children/:id/ledger', requirePermission('children:read'), notImplemented('child ledger'));
  router.get('/salary-accruals', requirePermission('*'), notImplemented('salary-accruals'));
  router.get('/partner-settlements', requirePermission('partner-settlements:read'), notImplemented('partner-settlements'));
  router.post('/partner-settlements', requirePermission('*'), notImplemented('partner-settlements'));
  router.get('/statistics', requirePermission('*'), notImplemented('statistics'));
  router.post('/notifications/:id/read', requirePermission('*'), notImplemented('notification read'));
  return router;
}
