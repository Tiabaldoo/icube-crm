import { Router } from 'express';
import { authenticate, requirePermission } from './auth.mjs';
import { clearSessionCookieOptions, createAuthService, parseSessionCookie, SESSION_COOKIE, sessionCookieOptions } from './auth-service.mjs';
import { ApiProblem, createMysqlCatalog } from './catalog.mjs';
import { createDeletionService } from './deletion.mjs';
import { createMysqlPayments } from './payments.mjs';
import { createMysqlRefunds } from './refunds.mjs';
import { createDirectionPriceVersions } from './price-versions.mjs';
import { createSalaryRateVersions } from './salary-rate-versions.mjs';
import { createPartnerAgreementVersions } from './partner-agreement-versions.mjs';
import { createMysqlLessons } from './lessons.mjs';
import { createBalanceTransfers } from './balance-transfers.mjs';
import { createPartnerSettlements } from './partner-settlements.mjs';
import { createStatistics } from './statistics.mjs';
import { assertOwned, partnerProjectId } from './project-scope.mjs';
import { createProjectTransfers } from './project-transfers.mjs';
import { createDailyDashboard } from './daily-dashboard.mjs';
import { createNotifications } from './notifications.mjs';

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
  refunds = createMysqlRefunds(pool),
  priceVersions = createDirectionPriceVersions(pool),
  salaryRateVersions = createSalaryRateVersions(pool),
  partnerAgreementVersions = createPartnerAgreementVersions(pool),
  lessons = createMysqlLessons(pool),
  balanceTransfers = createBalanceTransfers(pool),
  projectTransfers = createProjectTransfers(pool, balanceTransfers),
  dailyDashboard = createDailyDashboard(pool),
  notifications = createNotifications(pool),
  partnerSettlements = createPartnerSettlements(pool),
  statistics = createStatistics(pool),
  authService = createAuthService(pool),
  testAuth = null,
} = {}) {
  const router = Router();
  router.get('/health', async (_request, response, next) => { try { await pool.query('SELECT 1'); response.json({ data: { status: 'ok' } }); } catch (error) { next(error); } });
  router.post('/auth/login', async (request, response, next) => {
    try {
      const result = await authService.login(request.body, { userAgent: request.get('user-agent') });
      response.cookie(SESSION_COOKIE, result.sessionToken, sessionCookieOptions({ expires: result.expiresAt }));
      response.json({ data: result.profile });
    } catch (error) { next(error); }
  });
  router.post('/auth/refresh', notImplemented('auth/refresh'));

  if (testAuth) router.use(testAuth);
  else router.use((request, _response, next) => {
    request.authService = authService;
    request.sessionToken = parseSessionCookie(request.get('cookie'));
    next();
  }, authenticate);
  router.get('/auth/me', run((request) => ({ id: request.auth.userId, displayName: request.auth.displayName,
    roles: request.auth.roles, teacherId: request.auth.teacherId ?? null, projectIds: request.auth.projectIds ?? [] })));
  router.get('/dashboard/daily', requirePermission('children:read'), run((request) => dailyDashboard.get(request.auth)));
  router.post('/auth/logout', async (request, response, next) => {
    try {
      await authService.logout(request.auth.sessionId);
      response.clearCookie(SESSION_COOKIE, clearSessionCookieOptions());
      response.status(204).end();
    } catch (error) { next(error); }
  });
  router.get('/project-transfer-targets', requirePermission('enrollments:write'), run(async (request) => {
    const partnerProject = partnerProjectId(request.auth);
    const [rows] = await pool.query(`SELECT id,code,name FROM projects WHERE active=TRUE
      AND (:partnerProject IS NULL OR code='icube-robots') ORDER BY name`, { partnerProject });
    return rows.map((row) => ({ id: String(row.id), code: row.code, name: row.name }));
  }));
  router.get('/sites/venues', requirePermission('lessons:read'), run(async () => {
    const [rows] = await pool.query('SELECT id,name,active FROM sites WHERE active=TRUE AND deleted_at IS NULL ORDER BY name');
    return rows.map((row) => ({ id: String(row.id), name: row.name, active: Boolean(row.active) }));
  }));

  for (const resource of ['projects', 'directions', 'sites', 'teachers', 'groups', 'children']) {
    const permission = `${resource}:read`;
    router.get(`/${resource}`, requirePermission(permission), run((request) => catalog.list(resource, request.auth)));
    router.get(`/${resource}/:id`, requirePermission(permission), run((request) => catalog.get(resource, request.params.id, request.auth)));
    if (resource !== 'projects') {
      router.post(`/${resource}`, requirePermission(`${resource}:write`), run((request) => catalog.create(resource, request.body, request.auth), 201));
      router.patch(`/${resource}/:id`, requirePermission(`${resource}:write`), run((request) => catalog.update(resource, request.params.id, request.body, request.auth)));
    }
  }
  router.delete('/sites/:id', requirePermission('sites:write'), run(async (request) => { await assertOwned(pool, 'sites', request.params.id, request.auth); return deletions.deleteSite(request.params.id); }, 204));
  router.delete('/teachers/:id', requirePermission('teachers:write'), run(async (request) => { await assertOwned(pool, 'teachers', request.params.id, request.auth); if (partnerProjectId(request.auth)) throw new ApiProblem(403, 'FORBIDDEN', 'Партнёр может изменить доступность преподавателя, но не удалить глобальную запись'); return deletions.deleteTeacher(request.params.id); }, 204));
  router.delete('/groups/:id', requirePermission('groups:write'), run(async (request) => { await assertOwned(pool, 'groups', request.params.id, request.auth); return deletions.deleteGroup(request.params.id, request.auth); }, 204));
  router.delete('/children/:id', requirePermission('children:write'), run(async (request) => { await assertOwned(pool, 'children', request.params.id, request.auth, { exclusiveChild: true }); return catalog.deleteChild(request.params.id); }, 204));
  router.post('/children/:id/enrollments', requirePermission('enrollments:write'), run((request) => catalog.createEnrollment(request.params.id, request.body, request.auth), 201));
  router.patch('/enrollments/:id', requirePermission('enrollments:write'), run((request) => catalog.updateEnrollment(request.params.id, request.body, request.auth)));
  router.post('/enrollments/:id/project-transfer', requirePermission('enrollments:write'), run((request) => projectTransfers.create(request.params.id, request.body, request.auth), 201));
  router.delete('/enrollments/:id', requirePermission('enrollments:write'), run(async (request) => { await assertOwned(pool, 'enrollments', request.params.id, request.auth); return deletions.deleteEnrollment(request.params.id); }, 204));
  router.get('/teachers/:id/access', requirePermission('*'), run((request) => authService.getTeacherAccess(request.params.id)));
  router.post('/teachers/:id/access', requirePermission('*'), run((request) => authService.createTeacherAccess(request.params.id, request.body, request.auth.userId), 201));
  router.post('/teachers/:id/access/reset-password', requirePermission('*'), run((request) => authService.resetTeacherPassword(request.params.id, request.body)));
  router.delete('/teachers/:id/access', requirePermission('*'), run((request) => authService.disableTeacherAccess(request.params.id)));

  const projectFilters = (request) => ({ ...request.query, ...(partnerProjectId(request.auth) ? { projectId: partnerProjectId(request.auth) } : {}) });
  router.get('/payments', requirePermission('payments:read'), run((request) => payments.list(projectFilters(request))));
  router.get('/payments/:id', requirePermission('payments:read'), run(async (request) => { await assertOwned(pool, 'payments', request.params.id, request.auth); return payments.get(request.params.id); }));
  router.post('/payments', requirePermission('payments:write'), run(async (request) => { await assertOwned(pool, 'enrollments', request.body.enrollmentId, request.auth); return payments.create(request.body, {
    actorUserId: request.auth?.userId ?? null,
    idempotencyKey: request.get('Idempotency-Key') ?? null,
  }); }, 201));
  router.patch('/payments/:id', requirePermission('payments:write'), run(async (request) => { await assertOwned(pool, 'payments', request.params.id, request.auth); if (request.body.enrollmentId) await assertOwned(pool, 'enrollments', request.body.enrollmentId, request.auth); return payments.update(request.params.id, request.body, {
    actorUserId: request.auth?.userId ?? null,
  }); }));
  router.delete('/payments/:id', requirePermission('payments:write'), run(async (request) => { await assertOwned(pool, 'payments', request.params.id, request.auth); return payments.remove(request.params.id); }, 204));
  router.get('/balances', requirePermission('balances:read'), run((request) => payments.balances(projectFilters(request))));
  router.get('/refunds', requirePermission('refunds:read'), run((request) => refunds.list(projectFilters(request))));
  router.post('/refunds', requirePermission('refunds:write'), run(async (request) => { await assertOwned(pool, 'payments', request.body.paymentId, request.auth); return refunds.create(request.body, {
    actorUserId: request.auth?.userId ?? null,
    idempotencyKey: request.get('Idempotency-Key') ?? null,
  }); }, 201));
  router.delete('/refunds/:id', requirePermission('refunds:write'), run(async (request) => { await assertOwned(pool, 'refunds', request.params.id, request.auth); return refunds.remove(request.params.id); }, 204));

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

  const lessonContext = (request) => ({ userId: request.auth?.userId ?? null, roles: request.auth?.roles ?? [], teacherId: request.auth?.teacherId ?? null, projectIds: request.auth?.projectIds ?? [] });
  router.get('/lessons', requirePermission('lessons:read'), run((request) => lessons.list(request.query, lessonContext(request))));
  router.get('/lesson-deletions', requirePermission('lessons:read'), run((request) => lessons.deletedOccurrences(lessonContext(request))));
  router.get('/lessons/:id', requirePermission('lessons:read'), run((request) => lessons.get(request.params.id, lessonContext(request))));
  router.post('/lessons', requirePermission('lessons:create'), run((request) => lessons.create(request.body, lessonContext(request)), 201));
  router.patch('/lessons/:id', requirePermission('lessons:update-assigned'), run((request) => lessons.update(request.params.id, request.body, lessonContext(request))));
  router.delete('/lessons/:id', requirePermission('lessons:delete'), run((request) => lessons.remove(request.params.id, lessonContext(request)), 204));
  router.post('/groups/:id/memberships', requirePermission('*'), notImplemented('group membership'));
  router.post('/lessons/:id/start', requirePermission('lessons:start'), run((request) => lessons.start(request.params.id, request.body, lessonContext(request))));
  router.put('/lessons/:id/attendance/:childId', requirePermission('lessons:attendance'), run((request) => lessons.putAttendance(request.params.id, request.params.childId, request.body, lessonContext(request))));
  router.delete('/lessons/:id/attendance/:childId', requirePermission('lessons:attendance'), run((request) => lessons.removeAttendance(request.params.id, request.params.childId, lessonContext(request))));
  router.post('/lessons/:id/finish', requirePermission('lessons:finish'), run((request) => lessons.finish(request.params.id, request.body, lessonContext(request))));
  router.patch('/lessons/:id/teacher-details', requirePermission('lessons:update-assigned'), run((request) => lessons.update(request.params.id, request.body, lessonContext(request))));
  router.post('/lessons/:id/cancel', requirePermission('lessons:cancel'), run((request) => lessons.cancel(request.params.id, lessonContext(request))));
  router.post('/lessons/:id/empty-trip', requirePermission('lessons:empty-trip'), run((request) => lessons.emptyTrip(request.params.id, lessonContext(request))));
  router.post('/lessons/:id/quick-child', requirePermission('lessons:quick-child'), run((request) => lessons.quickChild(request.params.id, request.body, lessonContext(request)), 201));
  router.post('/lessons/:id/extras', requirePermission('lessons:extras'), run((request) => lessons.addExtra(request.params.id, request.body, lessonContext(request)), 201));
  router.delete('/lessons/:id/extras/:childId', requirePermission('lessons:extras'), run((request) => lessons.removeExtra(request.params.id, request.params.childId, lessonContext(request)), 200));
  router.post('/lessons/:id/photos', requirePermission('lessons:photos'), notImplemented('lesson photo upload'));
  router.delete('/lessons/:id/photos/:photoId', requirePermission('lessons:photos'), notImplemented('lesson photo delete'));
  router.get('/balance-transfers/preview', requirePermission('balance-transfers:read'), run(async (request) => { await assertOwned(pool, 'enrollments', request.query.sourceEnrollmentId, request.auth); await assertOwned(pool, 'enrollments', request.query.targetEnrollmentId, request.auth); return balanceTransfers.preview(request.query.sourceEnrollmentId, request.query.targetEnrollmentId); }));
  router.get('/balance-transfers', requirePermission('balance-transfers:read'), run((request) => balanceTransfers.list(projectFilters(request))));
  router.post('/balance-transfers', requirePermission('balance-transfers:write'), run(async (request) => { await assertOwned(pool, 'enrollments', request.body.sourceEnrollmentId, request.auth); await assertOwned(pool, 'enrollments', request.body.targetEnrollmentId, request.auth); return balanceTransfers.create(request.body, {
    actorUserId: request.auth?.userId ?? null,
    idempotencyKey: request.get('Idempotency-Key') ?? null,
  }); }, 201));
  router.delete('/balance-transfers/:id', requirePermission('balance-transfers:write'), run(async (request) => { await assertOwned(pool, 'transfers', request.params.id, request.auth); return balanceTransfers.remove(request.params.id); }, 204));
  router.post('/payments/:id/reverse', requirePermission('*'), notImplemented('payment reversal'));
  router.post('/refunds/:id/reverse', requirePermission('*'), notImplemented('refund reversal'));
  router.get('/children/:id/ledger', requirePermission('children:read'), notImplemented('child ledger'));
  router.get('/salary-accruals', requirePermission('salary:read'), run((request) => lessons.salaryAccruals(request.query, lessonContext(request))));
  router.get('/notifications', requirePermission('notifications:read'), run((request) => notifications.list(request.auth)));
  router.get('/notifications/:id', requirePermission('*'), notImplemented('notifications/:id'));
  router.get('/partner-settlements', requirePermission('partner-settlements:read'), run((request) => partnerSettlements.preview(request.query)));
  router.post('/partner-settlements', requirePermission('*'), notImplemented('partner-settlements'));
  router.get('/statistics', requirePermission('*'), run((request) => statistics.get(request.query)));
  router.post('/notifications/:id/read', requirePermission('notifications:read'), run((request) => notifications.markRead(request.params.id, request.auth)));
  return router;
}
