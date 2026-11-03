import mysql from 'mysql2/promise';
import { StarProfileMissing } from './star-errors.mjs';

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

const id = (value) => (value == null ? null : String(value));

function entryFrom(row) {
  return {
    id: String(row.id), childId: String(row.child_id), kind: row.kind, amount: Number(row.amount), attendanceId: id(row.attendance_id),
    bonusId: id(row.bonus_id), itemCode: row.item_code, idempotencyKey: row.idempotency_key, createdAt: ms(row.created_at),
  };
}

function bonusFrom(row) {
  if (!row) return null;
  return {
    id: String(row.id), childId: String(row.child_id), amount: Number(row.amount), reason: row.reason, createdByUserId: String(row.created_by_user_id),
    requestKey: row.request_key, requestHash: row.request_hash, createdAt: ms(row.created_at),
    revokedAt: ms(row.revoked_at), revokedByUserId: id(row.revoked_by_user_id), revokeReason: row.revoke_reason ?? null,
  };
}

const BONUS_SELECT = `SELECT b.*,r.created_at revoked_at,r.revoked_by_user_id,r.reason revoke_reason
  FROM game_staff_bonuses b LEFT JOIN game_staff_bonus_revokes r ON r.bonus_id=b.id`;

function starTx(connection, childId) {
  const q = (sql, params) => connection.query(sql, params);
  return {
    async wallet() {
      const [rows] = await q('SELECT balance,chest FROM game_star_wallets WHERE child_id=:childId', { childId });
      return { balance: Number(rows[0].balance), chest: Number(rows[0].chest) };
    },
    async setWallet({ balance, chest, now }) {
      await q('UPDATE game_star_wallets SET balance=:balance,chest=:chest,updated_at=:now WHERE child_id=:childId', { balance, chest, now: date(now), childId });
    },
    async entries() {
      const [rows] = await q('SELECT * FROM game_star_entries WHERE child_id=:childId ORDER BY id', { childId });
      return rows.map(entryFrom);
    },
    async findEntryByKey(key) {
      const [rows] = await q('SELECT * FROM game_star_entries WHERE idempotency_key=:key', { key });
      return rows[0] ? entryFrom(rows[0]) : null;
    },
    async insertEntry({ kind, amount, attendanceId = null, bonusId = null, itemCode = null, idempotencyKey, now }) {
      const [result] = await q(`INSERT INTO game_star_entries (child_id,kind,amount,attendance_id,bonus_id,item_code,idempotency_key,created_at)
        VALUES (:childId,:kind,:amount,:attendanceId,:bonusId,:itemCode,:idempotencyKey,:now)`, { childId, kind, amount, attendanceId, bonusId, itemCode, idempotencyKey, now: date(now) });
      return String(result.insertId);
    },
    async findBonusByKey(requestKey) {
      const [rows] = await q(`${BONUS_SELECT} WHERE b.request_key=:requestKey`, { requestKey });
      return bonusFrom(rows[0]);
    },
    async getBonus(bonusId) {
      const [rows] = await q(`${BONUS_SELECT} WHERE b.id=:bonusId`, { bonusId });
      return bonusFrom(rows[0]);
    },
    async bonuses() {
      const [rows] = await q(`${BONUS_SELECT} WHERE b.child_id=:childId ORDER BY b.id`, { childId });
      return rows.map(bonusFrom);
    },
    async insertBonus({ amount, reason, createdByUserId, requestKey, requestHash, now }) {
      const [result] = await q(`INSERT INTO game_staff_bonuses (child_id,amount,reason,created_by_user_id,request_key,request_hash,created_at)
        VALUES (:childId,:amount,:reason,:createdByUserId,:requestKey,:requestHash,:now)`, { childId, amount, reason, createdByUserId, requestKey, requestHash, now: date(now) });
      return String(result.insertId);
    },
    async insertRevoke({ bonusId, revokedByUserId, reason, now }) {
      await q('INSERT INTO game_staff_bonus_revokes (bonus_id,revoked_by_user_id,reason,created_at) VALUES (:bonusId,:revokedByUserId,:reason,:now)',
        { bonusId, revokedByUserId, reason, now: date(now) });
    },
    async insertChestOpen({ amount, now }) {
      await q('INSERT INTO game_star_chest_opens (child_id,amount,created_at) VALUES (:childId,:amount,:now)', { childId, amount, now: date(now) });
    },
  };
}

export function createMysqlStore(pool) {
  async function starAttempt(childId, operation) {
    // Кошелёк создаётся отдельным коротким запросом: внутри транзакции вставка рядом с блокировкой дала бы взаимоблокировки.
    await pool.query('INSERT IGNORE INTO game_star_wallets (child_id) SELECT child_id FROM game_profiles WHERE child_id=:childId', { childId });
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.query('SELECT child_id FROM game_star_wallets WHERE child_id=:childId FOR UPDATE', { childId });
      if (!rows.length) throw new StarProfileMissing();
      const result = await operation(starTx(connection, childId));
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback().catch(() => {});
      throw error;
    } finally {
      connection.release();
    }
  }

  return {
    async ping() { await pool.query('SELECT 1'); },

    async listProfileIds({ afterChildId = '0', limit = 100 } = {}) {
      const [rows] = await pool.query('SELECT child_id FROM game_profiles WHERE child_id>:afterChildId ORDER BY child_id LIMIT :limit', { afterChildId, limit: Number(limit) });
      return rows.map((row) => String(row.child_id));
    },

    async starTransaction(childId, operation) {
      try { return await starAttempt(String(childId), operation); } catch (error) {
        if (error?.code !== 'ER_LOCK_DEADLOCK') throw error;
        return starAttempt(String(childId), operation);
      }
    },

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
