import { Router } from 'express';
import { authenticate, requirePermission } from './auth.mjs';
import { createMysqlCatalog } from './catalog.mjs';
import { createDeletionService } from './deletion.mjs';
import { createMysqlPayments } from './payments.mjs';
import { createDirectionPriceVersions } from './price-versions.mjs';
import { createSalaryRateVersions } from './salary-rate-versions.mjs';
import { createPartnerAgreementVersions } from './partner-agreement-versions.mjs';
import { createMysqlLessons } from './lessons.mjs';

function notImplemented(resource) {
  return (_request, response) => response.status(501).json({ error: { code: 'NOT_IMPLEMENTED', message: `${resource}: контракт подготовлен, серверная операция ещё не реализована` } });
}
const run = (handler, status = 200) => async (request, response, next) => {
  try { const data = await handler(request); return status === 204 ? response.status(204).end() : response.status(status).json({ data }); }
  catch (error) { return next(error); }
};

export function createApiRouter(pool, {
  catalog = createMysqlCatalog(pool),
  deletions = createDeletionService(pool),
  payments = createMysqlPayments(pool),
  priceVersions = createDirectionPriceVersions(pool),
  salaryRateVersions = createSalaryRateVersions(pool),
  partnerAgreementVersions = createPartnerAgreementVersions(pool),
  lessons = createMysqlLessons(pool),
  allowUnauthenticated = false,
} = {}) {
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
  router.delete('/enrollments/:id', requirePermission('*'), run((request) => deletions.deleteEnrollment(request.params.id), 204));

  router.get('/payments', requirePermission('*'), run((request) => payments.list(request.query)));
  router.get('/payments/:id', requirePermission('*'), run((request) => payments.get(request.params.id)));
  router.post('/payments', requirePermission('*'), run((request) => payments.create(request.body, {
    actorUserId: request.auth?.userId ?? null,
    idempotencyKey: request.get('Idempotency-Key') ?? null,
  }), 201));
  router.patch('/payments/:id', requirePermission('*'), run((request) => payments.update(request.params.id, request.body, {
    actorUserId: request.auth?.userId ?? null,
  })));
  router.delete('/payments/:id', requirePermission('*'), run((request) => payments.remove(request.params.id), 204));
  router.get('/balances', requirePermission('*'), run((request) => payments.balances(request.query)));

  router.get('/price-versions', requirePermission('*'), run(() => priceVersions.list()));
  router.post('/price-versions', requirePermission('*'), run((request) => priceVersions.create(request.body, {
    actorUserId: request.auth?.userId ?? null,
  }), 201));
  router.get('/salary-rate-versions', requirePermission('*'), run(() => salaryRateVersions.list()));
  router.post('/salary-rate-versions', requirePermission('*'), run((request) => salaryRateVersions.create(request.body, {
    actorUserId: request.auth?.userId ?? null,
  }), 201));
  router.get('/partner-agreement-versions', requirePermission('*'), run(() => partnerAgreementVersions.list()));
  router.post('/partner-agreement-versions', requirePermission('*'), run((request) => partnerAgreementVersions.create(request.body, {
    actorUserId: request.auth?.userId ?? null,
  }), 201));

  for (const resource of ['refunds', 'notifications']) {
    const permission = '*';
    router.get(`/${resource}`, requirePermission(permission), notImplemented(resource));
    router.get(`/${resource}/:id`, requirePermission(permission), notImplemented(`${resource}/:id`));
    if (resource === 'refunds') router.post(`/${resource}`, requirePermission('*'), notImplemented(`POST ${resource}`));
  }
  const lessonContext = (request) => ({ userId: request.auth?.userId ?? null, roles: request.auth?.roles ?? [] });
  router.get('/lessons', requirePermission('lessons:read'), run((request) => lessons.list(request.query, lessonContext(request))));
  router.get('/lessons/:id', requirePermission('lessons:read'), run((request) => lessons.get(request.params.id, lessonContext(request))));
  router.post('/lessons', requirePermission('*'), run((request) => lessons.create(request.body, lessonContext(request)), 201));
  router.patch('/lessons/:id', requirePermission('lessons:update-assigned'), run((request) => lessons.update(request.params.id, request.body, lessonContext(request))));
  router.post('/groups/:id/memberships', requirePermission('*'), notImplemented('group membership'));
  router.post('/lessons/:id/start', requirePermission('lessons:start'), run((request) => lessons.start(request.params.id, request.body, lessonContext(request))));
  router.put('/lessons/:id/attendance/:childId', requirePermission('lessons:attendance'), run((request) => lessons.putAttendance(request.params.id, request.params.childId, request.body, lessonContext(request))));
  router.post('/lessons/:id/finish', requirePermission('lessons:finish'), run((request) => lessons.finish(request.params.id, request.body, lessonContext(request))));
  router.patch('/lessons/:id/teacher-details', requirePermission('lessons:update-assigned'), run((request) => lessons.update(request.params.id, request.body, lessonContext(request))));
  router.post('/lessons/:id/cancel', requirePermission('lessons:cancel'), run((request) => lessons.cancel(request.params.id, lessonContext(request))));
  router.post('/lessons/:id/empty-trip', requirePermission('*'), run((request) => lessons.emptyTrip(request.params.id, lessonContext(request))));
  router.post('/lessons/:id/quick-child', requirePermission('lessons:quick-child'), run((request) => lessons.quickChild(request.params.id, request.body, lessonContext(request)), 201));
  router.post('/lessons/:id/extras', requirePermission('lessons:extras'), run((request) => lessons.addExtra(request.params.id, request.body, lessonContext(request)), 201));
  router.delete('/lessons/:id/extras/:childId', requirePermission('lessons:extras'), run((request) => lessons.removeExtra(request.params.id, request.params.childId, lessonContext(request)), 200));
  router.post('/lessons/:id/photos', requirePermission('lessons:photos'), notImplemented('lesson photo upload'));
  router.delete('/lessons/:id/photos/:photoId', requirePermission('lessons:photos'), notImplemented('lesson photo delete'));
  router.post('/balance-transfers', requirePermission('*'), notImplemented('balance-transfers'));
  router.post('/payments/:id/reverse', requirePermission('*'), notImplemented('payment reversal'));
  router.post('/refunds/:id/reverse', requirePermission('*'), notImplemented('refund reversal'));
  router.get('/children/:id/ledger', requirePermission('children:read'), notImplemented('child ledger'));
  router.get('/salary-accruals', requirePermission('*'), run((request) => lessons.salaryAccruals(request.query, lessonContext(request))));
  router.get('/partner-settlements', requirePermission('partner-settlements:read'), notImplemented('partner-settlements'));
  router.post('/partner-settlements', requirePermission('*'), notImplemented('partner-settlements'));
  router.get('/statistics', requirePermission('*'), notImplemented('statistics'));
  router.post('/notifications/:id/read', requirePermission('*'), notImplemented('notification read'));
  return router;
}
