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
  router.post('/auth/logout', notImplemented('auth/logout'));

  router.use(authenticate);
  const readResources = ['children', 'directions', 'groups', 'sites', 'teachers', 'projects', 'lessons', 'payments', 'refunds', 'balances', 'notifications'];
  const creatableResources = new Set(['children', 'directions', 'groups', 'sites', 'teachers', 'lessons', 'payments', 'refunds']);
  const patchableResources = new Set(['children', 'directions', 'groups', 'sites', 'teachers', 'lessons']);
  for (const resource of readResources) {
    const readPermission = resource === 'lessons' ? 'lessons:read' : resource === 'groups' ? 'groups:read' : resource === 'children' ? 'children:read' : resource === 'projects' ? 'projects:read' : '*';
    router.get(`/${resource}`, requirePermission(readPermission), notImplemented(resource));
    router.get(`/${resource}/:id`, requirePermission(readPermission), notImplemented(`${resource}/:id`));
    if (creatableResources.has(resource)) router.post(`/${resource}`, requirePermission('*'), notImplemented(`POST ${resource}`));
    if (patchableResources.has(resource)) router.patch(`/${resource}/:id`, requirePermission('*'), notImplemented(`PATCH ${resource}/:id`));
  }
  router.delete('/children/:id', requirePermission('*'), notImplemented('DELETE children/:id'));
  for(const resource of ['price-versions','salary-rate-versions','partner-agreement-versions']){
    router.get(`/${resource}`, requirePermission('*'), notImplemented(resource));
    router.post(`/${resource}`, requirePermission('*'), notImplemented(`POST ${resource}`));
  }
  router.post('/children/:id/enrollments', requirePermission('*'), notImplemented('child enrollment'));
  router.patch('/enrollments/:id', requirePermission('*'), notImplemented('enrollment'));
  router.post('/groups/:id/memberships', requirePermission('*'), notImplemented('group membership'));
  router.post('/lessons/:id/start', requirePermission('lessons:start'), notImplemented('lessons/:id/start'));
  router.put('/lessons/:id/attendance/:childId', requirePermission('lessons:attendance'), notImplemented('lesson attendance'));
  router.post('/lessons/:id/finish', requirePermission('lessons:finish'), notImplemented('lessons/:id/finish'));
  router.patch('/lessons/:id/teacher-details', requirePermission('lessons:update-assigned'), notImplemented('lesson teacher details'));
  router.post('/lessons/:id/cancel', requirePermission('lessons:cancel'), notImplemented('lessons/:id/cancel'));
  router.post('/lessons/:id/quick-child', requirePermission('lessons:quick-child'), notImplemented('lesson quick child'));
  router.post('/lessons/:id/extras', requirePermission('lessons:extras'), notImplemented('lesson extra child'));
  router.delete('/lessons/:id/extras/:childId', requirePermission('lessons:extras'), notImplemented('lesson extra child removal'));
  router.post('/lessons/:id/photos', requirePermission('lessons:photos'), notImplemented('lesson photo upload'));
  router.delete('/lessons/:id/photos/:photoId', requirePermission('lessons:photos'), notImplemented('lesson photo delete'));
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
