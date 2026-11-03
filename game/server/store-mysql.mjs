import mysql from 'mysql2/promise';

// Время в базе — UTC (timezone: 'Z'), в коде — миллисекунды.
export function createGamePool(database) {
  return mysql.createPool({
    ...database, charset: 'utf8mb4', timezone: 'Z', dateStrings: ['DATE'],
    namedPlaceholders: true, connectionLimit: 10, waitForConnections: true, queueLimit: 100,
  });
}

const ms = (value) => (value == null ? null : new Date(value).getTime());
const date = (value) => (value == null ? null : new Date(value));

function sessionFrom(row) {
  if (!row) return null;
  return {
    id: String(row.id), tokenHash: row.token_hash, childId: String(row.child_id), tokenVersion: Number(row.token_version),
    createdAt: ms(row.created_at), expiresAt: ms(row.expires_at), lastSeenAt: ms(row.last_seen_at), checkedAt: ms(row.checked_at),
    revokedAt: ms(row.revoked_at), revokeReason: row.revoke_reason,
  };
}

export function createMysqlStore(pool) {
  return {
    async ping() { await pool.query('SELECT 1'); },

    async getProfile(childId) {
      const [rows] = await pool.query('SELECT child_id,nickname,first_access_on FROM game_profiles WHERE child_id=:childId', { childId });
      const row = rows[0];
      return row ? { childId: String(row.child_id), nickname: row.nickname, firstAccessOn: String(row.first_access_on) } : null;
    },

    async insertProfile({ childId, nickname, firstAccessOn }) {
      try {
        await pool.query('INSERT INTO game_profiles (child_id,nickname,first_access_on) VALUES (:childId,:nickname,:firstAccessOn)', { childId, nickname, firstAccessOn });
        return 'created';
      } catch (error) {
        if (error?.code !== 'ER_DUP_ENTRY') throw error;
        return /uq_game_profiles_nickname/.test(error.sqlMessage ?? error.message) ? 'nickname_taken' : 'child_exists';
      }
    },

    async createSession({ tokenHash, childId, tokenVersion, now, expiresAt }) {
      const [result] = await pool.query(`INSERT INTO game_sessions (token_hash,child_id,token_version,created_at,expires_at,last_seen_at,checked_at)
        VALUES (:tokenHash,:childId,:tokenVersion,:now,:expiresAt,:now,:now)`, { tokenHash, childId, tokenVersion, now: date(now), expiresAt: date(expiresAt) });
      return String(result.insertId);
    },

    async findSession(tokenHash) {
      const [rows] = await pool.query('SELECT * FROM game_sessions WHERE token_hash=:tokenHash', { tokenHash });
      return sessionFrom(rows[0]);
    },

    async markChecked(id, now) {
      await pool.query('UPDATE game_sessions SET checked_at=:now,last_seen_at=:now WHERE id=:id AND revoked_at IS NULL', { id, now: date(now) });
    },

    async markSeen(id, now) {
      await pool.query('UPDATE game_sessions SET last_seen_at=:now WHERE id=:id AND revoked_at IS NULL', { id, now: date(now) });
    },

    async revokeSession(id, reason, now) {
      await pool.query('UPDATE game_sessions SET revoked_at=:now,revoke_reason=:reason WHERE id=:id AND revoked_at IS NULL', { id, reason, now: date(now) });
    },

    async revokeChildSessions(childId, reason, now, { keepTokenVersion = null } = {}) {
      const [result] = await pool.query(`UPDATE game_sessions SET revoked_at=:now,revoke_reason=:reason
        WHERE child_id=:childId AND revoked_at IS NULL${keepTokenVersion != null ? ' AND token_version<>:keepTokenVersion' : ''}`,
      { childId, reason, now: date(now), keepTokenVersion });
      return result.affectedRows;
    },
  };
}
