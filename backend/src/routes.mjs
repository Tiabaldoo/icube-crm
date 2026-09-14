import { Router } from 'express';
import { authenticate, requirePermission } from './auth.mjs';
import { createMysqlCatalog } from './catalog.mjs';
import { createDeletionService } from './deletion.mjs';

function notImplemented(resource) {
  return (_request, response) => response.status(501).json({ error: { code: 'NOT_IMPLEMENTED', message: `${resource}: контракт подготовлен, серверная операция ещё не реализована` } });
}
const run = (handler, status = 200) => async (request, response, next) => {
  try { const data = await handler(request); return status === 204 ? response.status(204).end() : response.status(status).json({ data }); }
  catch (error) { return next(error); }
};

export function createApiRouter(pool, { catalog = createMysqlCatalog(pool), deletions = createDeletionService(pool), allowUnauthenticated = false } = {}) {
  const router = Router();
  router.get('/health', async (_request, response, next) => { try { await pool.query('SELECT 1'); response.json({ data: { status: 'ok' } }); } catch (error) { next(error); } });
  router.post('/auth/login', notImplemented('auth/login'));
  router.post('/auth/refresh', notImplemented('auth/refresh'));
  router.post('/auth/logout', notImplemented('auth/logout'));

  if (allowUnauthenticated) router.use((request, _response, next) => { request.auth = { roles: ['director'] }; next(); });
  router.use(authenticate);

  for (const resource of ['projects', 'directions', 'sites', 'teachers', 'groups', 'children']) {
    const permission = resource === 'projects' ? 'projects:read' : resource === 'groups' ? 'groups:read' : resource === 'children' ? 'children:read' : '*';
    router.get(`/${resource}`, requirePermission(permission), run(() => catalog.list(resource)));
    router.get(`/${resource}/:id`, requirePermission(permission), run((request) => catalog.get(resource, request.params.id)));
    if (resource !== 'projects') {
      router.post(`/${resource}`, requirePermission('*'), run((request) => catalog.create(resource, request.body), 201));
      router.patch(`/${resource}/:id`, requirePermission('*'), run((request) => catalog.update(resource, request.params.id, request.body)));
    }
  }
  router.delete('/sites/:id', requirePermission('*'), run((request) => deletions.deleteSite(request.params.id), 204));
  router.delete('/teachers/:id', requirePermission('*'), run((request) => deletions.deleteTeacher(request.params.id), 204));
  router.delete('/groups/:id', requirePermission('*'), run((request) => deletions.deleteGroup(request.params.id), 204));
  router.delete('/children/:id', requirePermission('*'), run((request) => catalog.deleteChild(request.params.id), 204));
  router.post('/children/:id/enrollments', requirePermission('*'), run((request) => catalog.createEnrollment(request.params.id, request.body), 201));
  router.patch('/enrollments/:id', requirePermission('*'), run((request) => catalog.updateEnrollment(request.params.id, request.body)));

  for (const resource of ['lessons', 'payments', 'refunds', 'balances', 'notifications']) {
    const permission = resource === 'lessons' ? 'lessons:read' : '*';
    router.get(`/${resource}`, requirePermission(permission), notImplemented(resource));
    router.get(`/${resource}/:id`, requirePermission(permission), notImplemented(`${resource}/:id`));
    if (['lessons', 'payments', 'refunds'].includes(resource)) router.post(`/${resource}`, requirePermission('*'), notImplemented(`POST ${resource}`));
    if (resource === 'lessons') router.patch(`/${resource}/:id`, requirePermission('*'), notImplemented(`PATCH ${resource}/:id`));
  }
  for (const resource of ['price-versions', 'salary-rate-versions', 'partner-agreement-versions']) {
    router.get(`/${resource}`, requirePermission('*'), notImplemented(resource));
    router.post(`/${resource}`, requirePermission('*'), notImplemented(`POST ${resource}`));
  }
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
