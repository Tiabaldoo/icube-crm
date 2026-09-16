import { partnerProjectId } from './project-scope.mjs';

const sakhalinDay = () => {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Sakhalin', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const value = (type) => parts.find((part) => part.type === type)?.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
};

export function createDailyDashboard(pool, { today = sakhalinDay } = {}) {
  async function get(context = {}) {
    const projectId = partnerProjectId(context);
    const day = today();
    const [projects] = await pool.query(`SELECT id,name FROM projects WHERE active=TRUE
      AND (:projectId IS NULL OR id=:projectId) ORDER BY name`, { projectId });
    const summaries = [];
    for (const project of projects) {
      const params = { projectId: project.id, day };
      const [[lessons], [present], [payments], [refunds], [children], [groups], [changes]] = await Promise.all([
        pool.query(`SELECT SUM(status='completed') completed, SUM(status IN ('scheduled','in_progress')) planned
          FROM lessons WHERE project_id_snapshot=:projectId AND DATE(starts_at)=:day AND deleted_at IS NULL`, params),
        pool.query(`SELECT COUNT(*) value FROM attendances a JOIN lessons l ON l.id=a.lesson_id
          WHERE l.project_id_snapshot=:projectId AND DATE(l.starts_at)=:day AND l.status='completed'
            AND l.deleted_at IS NULL AND a.present=TRUE`, params),
        pool.query(`SELECT COALESCE(SUM(amount),0) value FROM payments
          WHERE project_id_snapshot=:projectId AND paid_on=:day AND deleted_at IS NULL`, params),
        pool.query(`SELECT COALESCE(SUM(amount),0) value FROM refunds
          WHERE project_id_snapshot=:projectId AND refunded_on=:day AND deleted_at IS NULL`, params),
        pool.query(`SELECT COUNT(DISTINCT c.id) value FROM children c JOIN child_enrollments e ON e.child_id=c.id
          WHERE e.project_id=:projectId AND DATE(c.created_at)=:day AND c.deleted_at IS NULL`, params),
        pool.query('SELECT COUNT(*) value FROM study_groups WHERE project_id=:projectId AND DATE(created_at)=:day AND deleted_at IS NULL', params),
        pool.query(`SELECT
          (SELECT COUNT(*) FROM enrollment_project_transfers
            WHERE (source_project_id=:projectId OR target_project_id=:projectId) AND DATE(created_at)=:day)
          + (SELECT COUNT(*) FROM notifications WHERE recipient_project_id=:projectId
            AND notification_type='project_change' AND DATE(created_at)=:day) value`, params),
      ]);
      summaries.push({ projectId: String(project.id), projectName: project.name,
        completedLessons: Number(lessons[0]?.completed ?? 0), plannedLessons: Number(lessons[0]?.planned ?? 0),
        presentChildren: Number(present[0]?.value ?? 0), paymentsAmount: String(payments[0]?.value ?? '0.00'),
        refundsAmount: String(refunds[0]?.value ?? '0.00'), newChildren: Number(children[0]?.value ?? 0),
        newGroups: Number(groups[0]?.value ?? 0), importantChanges: Number(changes[0]?.value ?? 0) });
    }
    return { day, projects: summaries };
  }
  return { get };
}
