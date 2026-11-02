const DELETED_NAME = 'Удалённая игровая учётка';
const UNUSABLE_PASSWORD_HASH = '!';

// Вызывается в транзакции удаления ребёнка, до удаления строки child_user_accounts.
// Прогресс игры привязан к child_id и живёт в игровой базе; дата первого доступа остаётся в журнале.
export async function releaseChildGameAccount(connection, childId, actorUserId = null) {
  const [accounts] = await connection.query(`SELECT a.user_id,a.created_at FROM children c
    JOIN child_user_accounts a ON a.child_id=c.id WHERE c.id=:childId FOR UPDATE`, { childId });
  const account = accounts[0];
  if (!account) return;
  const userId = account.user_id;
  const [roles] = await connection.query(`SELECT r.code FROM user_roles ur JOIN roles r ON r.id=ur.role_id
    WHERE ur.user_id=:userId ORDER BY r.code`, { userId });
  const childOnly = roles.length === 1 && roles[0].code === 'child';
  await connection.query(`DELETE ur FROM user_roles ur JOIN roles r ON r.id=ur.role_id
    WHERE ur.user_id=:userId AND r.code='child'`, { userId });
  if (childOnly) {
    await connection.query(`UPDATE users SET status='blocked',deleted_at=COALESCE(deleted_at,NOW(6)),email=NULL,phone=NULL,
      display_name=:displayName,password_hash=:passwordHash,token_version=token_version+1 WHERE id=:userId`, {
      userId, displayName: DELETED_NAME, passwordHash: UNUSABLE_PASSWORD_HASH,
    });
    await connection.query('UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,NOW(6)) WHERE user_id=:userId', { userId });
  }
  await connection.query(`INSERT INTO audit_log (actor_user_id,action,entity_type,entity_id,before_data,after_data)
    VALUES (:actorId,'game_access.child_deleted','child',:childId,NULL,:after)`, {
    actorId: actorUserId, childId,
    after: JSON.stringify({ userId: String(userId), firstAccessOn: String(account.created_at).slice(0, 10), childOnly }),
  });
}
