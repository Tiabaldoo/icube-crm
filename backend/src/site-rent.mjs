const problem = (status, code, message, details) => {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  if (details !== undefined) error.details = details;
  return error;
};

const numericId = (value, field = 'id') => {
  const result = String(value ?? '').trim();
  if (!/^[1-9]\d*$/.test(result)) throw problem(400, 'VALIDATION_ERROR', `Некорректное поле ${field}`);
  return result;
};

const dateOnly = (value, field) => {
  const result = String(value ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || Number.isNaN(Date.parse(`${result}T00:00:00Z`))) {
    throw problem(400, 'VALIDATION_ERROR', `Некорректное поле ${field}`);
  }
  return result;
};

const isoDateTime = (value) => {
  if (value == null) return null;
  if (typeof value !== 'string') return value.toISOString();
  return `${value.slice(0, 10)}T${value.slice(11, 19)}Z`;
};

export function normalizeRentRate(value) {
  const raw = String(value ?? '').trim();
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(raw)) {
    throw problem(400, 'VALIDATION_ERROR', 'Ставка аренды должна быть неотрицательным числом с точностью до копеек');
  }
  const [whole, fraction = ''] = raw.split('.');
  return `${BigInt(whole)}.${fraction.padEnd(2, '0')}`;
}

const decimalCents = (value) => {
  const normalized = normalizeRentRate(value);
  const [whole, fraction] = normalized.split('.');
  return BigInt(whole) * 100n + BigInt(fraction);
};

const centsDecimal = (value) => {
  const whole = value / 100n;
  const fraction = String(value % 100n).padStart(2, '0');
  return `${whole}.${fraction}`;
};

const directorOnly = (context = {}) => {
  if (!(context.roles ?? []).includes('director')) throw problem(403, 'FORBIDDEN', 'Расчёты аренды доступны только директору');
};

export function createSiteRentService(pool) {
  async function currentRate(siteId, executor = pool) {
    const [rows] = await executor.query(`SELECT id,site_id,rate,valid_from,valid_to
      FROM site_rent_rate_versions WHERE site_id=:siteId AND valid_to IS NULL
      ORDER BY valid_from DESC,id DESC LIMIT 1`, { siteId: numericId(siteId, 'siteId') });
    return rows[0] ?? null;
  }

  async function setRate(siteId, rawRate, context = {}, { executor = pool, baseline = false } = {}) {
    directorOnly(context);
    const normalizedSiteId = numericId(siteId, 'siteId');
    const rate = normalizeRentRate(rawRate);
    const [siteRows] = await executor.query(`SELECT s.id,p.code project_code FROM sites s JOIN projects p ON p.id=s.project_id
      WHERE s.id=:siteId AND s.deleted_at IS NULL LIMIT 1 FOR UPDATE`, { siteId: normalizedSiteId });
    const site = siteRows[0];
    if (!site) throw problem(404, 'NOT_FOUND', 'Площадка не найдена');
    if (site.project_code !== 'icube-robots') throw problem(400, 'VALIDATION_ERROR', 'Аренда настраивается только для площадок iCube');

    const [historyRows] = await executor.query(`SELECT id,rate,valid_from,valid_to FROM site_rent_rate_versions
      WHERE site_id=:siteId ORDER BY valid_from DESC,id DESC FOR UPDATE`, { siteId: normalizedSiteId });
    const current = historyRows.find((row) => row.valid_to == null) ?? null;
    if (current && normalizeRentRate(current.rate) === rate) {
      return { changed: false, rate, configured: true, versionId: String(current.id) };
    }

    if (current) {
      await executor.query('UPDATE site_rent_rate_versions SET valid_to=NOW(6) WHERE id=:id AND valid_to IS NULL', { id: current.id });
    }
    const firstVersion = historyRows.length === 0;
    const validFrom = firstVersion && baseline ? '1970-01-01 00:00:00' : null;
    const [result] = await executor.query(`INSERT INTO site_rent_rate_versions
      (site_id,rate,valid_from,valid_to,created_by_user_id)
      VALUES (:siteId,:rate,${validFrom ? ':validFrom' : 'NOW(6)'},NULL,:actorId)`, {
      siteId: normalizedSiteId, rate, validFrom, actorId: context.userId ?? null,
    });
    return { changed: true, rate, configured: true, versionId: String(result.insertId) };
  }

  async function report(filters = {}, context = {}) {
    directorOnly(context);
    const from = dateOnly(filters.from, 'from');
    const to = dateOnly(filters.to, 'to');
    if (from > to) throw problem(400, 'VALIDATION_ERROR', 'Дата начала периода должна быть не позже даты окончания');
    const siteId = filters.siteId == null || filters.siteId === '' ? null : numericId(filters.siteId, 'siteId');

    let selectedSite = null;
    if (siteId) {
      const [selectedRows] = await pool.query(`SELECT s.id,s.name FROM sites s JOIN projects p ON p.id=s.project_id
        WHERE s.id=:siteId AND s.deleted_at IS NULL AND p.code='icube-robots' LIMIT 1`, { siteId });
      selectedSite = selectedRows[0] ?? null;
      if (!selectedSite) throw problem(404, 'NOT_FOUND', 'Площадка iCube не найдена');
    }

    const [rows] = await pool.query(`SELECT
        l.id lesson_id,l.starts_at,l.ends_at,l.group_id,g.name group_name,
        l.direction_id_snapshot,d.name direction_name,
        COALESCE(l.site_override_id,l.site_id_snapshot) site_id,
        es.name site_name,l.is_intro_group,
        COALESCE(rr.rate,0.00) rent_rate
      FROM lessons l
      JOIN projects p ON p.id=l.project_id_snapshot AND p.code='icube-robots'
      JOIN study_groups g ON g.id=l.group_id
      JOIN directions d ON d.id=l.direction_id_snapshot
      JOIN sites es ON es.id=COALESCE(l.site_override_id,l.site_id_snapshot)
      LEFT JOIN site_rent_rate_versions rr ON rr.id=(
        SELECT rr2.id FROM site_rent_rate_versions rr2
        WHERE rr2.site_id=COALESCE(l.site_override_id,l.site_id_snapshot)
          AND rr2.valid_from<=l.starts_at
          AND (rr2.valid_to IS NULL OR rr2.valid_to>l.starts_at)
        ORDER BY rr2.valid_from DESC,rr2.id DESC LIMIT 1
      )
      WHERE l.status='completed'
        AND l.is_empty_trip=FALSE
        AND l.deleted_at IS NULL
        AND DATE(l.starts_at)>=:from
        AND DATE(l.starts_at)<=:to
        AND (:siteId IS NULL OR COALESCE(l.site_override_id,l.site_id_snapshot)=:siteId)
      ORDER BY es.name,l.starts_at,l.id`, { from, to, siteId });

    const details = rows.map((row) => {
      const rentRate = normalizeRentRate(row.rent_rate ?? '0');
      return {
        lessonId: String(row.lesson_id),
        startsAt: isoDateTime(row.starts_at),
        endsAt: isoDateTime(row.ends_at),
        groupId: String(row.group_id),
        groupName: row.group_name,
        directionId: String(row.direction_id_snapshot),
        directionName: row.direction_name,
        siteId: String(row.site_id),
        siteName: row.site_name,
        introGroup: Boolean(row.is_intro_group),
        rentRate,
        amount: rentRate,
      };
    });

    const summaries = new Map();
    let totalAmountCents = 0n;
    for (const detail of details) {
      const amountCents = decimalCents(detail.amount);
      totalAmountCents += amountCents;
      const current = summaries.get(detail.siteId) ?? {
        siteId: detail.siteId, siteName: detail.siteName, lessonCount: 0, amountCents: 0n,
      };
      current.lessonCount += 1;
      current.amountCents += amountCents;
      summaries.set(detail.siteId, current);
    }
    if (selectedSite && !summaries.has(String(selectedSite.id))) {
      summaries.set(String(selectedSite.id), {
        siteId: String(selectedSite.id), siteName: selectedSite.name, lessonCount: 0, amountCents: 0n,
      });
    }
    const sites = [...summaries.values()]
      .sort((left, right) => left.siteName.localeCompare(right.siteName, 'ru'))
      .map((item) => ({
        siteId: item.siteId, siteName: item.siteName, lessonCount: item.lessonCount, amount: centsDecimal(item.amountCents),
      }));

    return {
      period: { from, to },
      selectedSiteId: siteId,
      totalLessons: details.length,
      totalAmount: centsDecimal(totalAmountCents),
      sites,
      details,
    };
  }

  return { currentRate, setRate, report };
}
