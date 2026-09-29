import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { splitSqlStatements } from '../database/migration-runner.mjs';
import { createParentPortal } from '../backend/src/parent-portal.mjs';
import { parentConsentDocumentsHtml, parentDocumentViewerHtml, parentSettingsDocumentsHtml } from '../src/frontend/parent-portal.mjs';

const migration = await readFile(new URL('../database/migrations/021_parent_documents_production.sql', import.meta.url), 'utf8');
const revision = await readFile(new URL('../database/migrations/022_parent_documents_ui_revision.sql', import.meta.url), 'utf8');
const parent = { userId: '50', roles: ['parent'] };
const types = ['privacy_policy', 'personal_data_parent', 'personal_data_child_legal_representative'];

test('migration 021 inserts three active required production documents and only deactivates older versions', () => {
  const statements = splitSqlStatements(migration);
  assert.equal(statements.length, 2);
  assert.match(statements[0], /^INSERT INTO parent_documents/);
  assert.match(statements[1], /^UPDATE parent_documents/);
  for (const type of types) assert.match(statements[0], new RegExp(`'${type}'`));
  assert.equal((statements[0].match(/'2026-09-27'/g) ?? []).length, 3);
  assert.equal((statements[0].match(/TRUE,\s*TRUE/g) ?? []).length, 3);
  assert.match(statements[0], /'Политика обработки персональных данных'/);
  assert.match(statements[0], /'Согласие на обработку персональных данных родителя'/);
  assert.match(statements[0], /'Согласие законного представителя на обработку персональных данных ребёнка'/);
  assert.match(statements[1], /SET is_active = \(document_version = '2026-09-27'\)/);
  assert.doesNotMatch(migration, /DELETE\s+FROM\s+parent_documents|DELETE\s+FROM\s+parent_document_acceptances|TRUNCATE/i);
  assert.doesNotMatch(migration, /UPDATE\s+parent_document_acceptances/i);
});

test('production documents describe actual CRM processing without public photo or marketing consent', () => {
  for (const placeholder of [
    '[ПОЛНОЕ НАИМЕНОВАНИЕ ОПЕРАТОРА]', '[ИНН]', '[ОГРН]', '[АДРЕС]',
    '[EMAIL ДЛЯ ОБРАЩЕНИЙ ПО ПЕРСОНАЛЬНЫМ ДАННЫМ]',
  ]) assert.doesNotMatch(migration, new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.equal((migration.match(/Якубенко Иван Валерьевич/g) ?? []).length, 3);
  assert.equal((migration.match(/плательщик налога на профессиональный доход \(самозанятый\)/g) ?? []).length, 3);
  assert.equal((migration.match(/ИНН: 650403490282/g) ?? []).length, 3);
  assert.match(migration, /694020, Сахалинская область, г\. Корсаков,/);
  assert.match(migration, /ул\. Советская, д\. 57, кв\. 30/);
  assert.match(migration, /icuberobots@gmail\.com/);
  assert.equal((migration.match(/Телефон: \+7 \(995\) 604-11-20/g) ?? []).length, 3);
  assert.equal((migration.match(/Сайт: icubesakh\.ru/g) ?? []).length, 3);
  assert.doesNotMatch(migration, /\bОГРН(?:ИП)?\b/);
  assert.match(migration, /ребёнка или детей, профили которых связаны с моей учётной записью/);
  assert.match(migration, /Согласие распространяется на персональные данные ребёнка или детей, профили которых связаны с моей учётной записью/);
  assert.match(migration, /не публикуются на публичном сайте/);
  assert.match(migration, /не размещаются в социальных сетях/);
  assert.match(migration, /не используются в рекламе/);
  assert.match(migration, /не используется для маркетинговых рассылок|не используются для маркетинговых рассылок/);
  assert.match(migration, /не используется оператором для распознавания лица|не использует фотографии для распознавания лица/);
  assert.match(migration, /не является согласием на распространение/);
  assert.match(migration, /30 календарных дней с момента загрузки/);
});

test('migration 022 adds exactly three required active r2 documents and preserves immutable history', () => {
  const statements = splitSqlStatements(revision);
  assert.equal(statements.length, 2);
  assert.match(statements[0], /^INSERT INTO parent_documents/);
  assert.match(statements[1], /^UPDATE parent_documents/);
  for (const type of types) assert.match(statements[0], new RegExp(`'${type}'`));
  assert.equal((statements[0].match(/'2026-09-27-r2'/g) ?? []).length, 3);
  assert.equal((statements[0].match(/TRUE,\s*TRUE/g) ?? []).length, 3);
  assert.match(statements[1], /SET is_active = \(document_version = '2026-09-27-r2'\)/);
  assert.doesNotMatch(revision, /DELETE\s+FROM|TRUNCATE|parent_document_acceptances/i);
});

test('r2 documents keep operator contacts, omit parent email, and distinguish supplied and generated child data', () => {
  assert.equal((revision.match(/Якубенко Иван Валерьевич/g) ?? []).length, 3);
  assert.equal((revision.match(/плательщик налога на профессиональный доход \(самозанятый\)/g) ?? []).length, 3);
  assert.equal((revision.match(/ИНН: 650403490282/g) ?? []).length, 3);
  assert.match(revision, /694020, Сахалинская область, г\. Корсаков,/);
  assert.match(revision, /ул\. Советская, д\. 57, кв\. 30/);
  assert.match(revision, /icuberobots@gmail\.com/);
  assert.equal((revision.match(/Телефон: \+7 \(995\) 604-11-20/g) ?? []).length, 3);
  assert.equal((revision.match(/Сайт: icubesakh\.ru/g) ?? []).length, 3);
  assert.doesNotMatch(revision, /email, используемый|email и логин|адрес электронной почты родителя/i);
  assert.doesNotMatch(revision, /\b(?:ОГРН|ОГРНИП|ИП|ООО)\b/);
  assert.equal((revision.match(/предоставляемые родителем или законным представителем либо вводимые при создании карточки|предоставляемые мной либо вводимые при создании карточки ребёнка/g) ?? []).length, 2);
  assert.equal((revision.match(/Сведения, формируемые в процессе обучения и работы информационной системы АйКуб/g) ?? []).length, 2);
  assert.match(revision, /ребёнка или детей, законным представителем которых я являюсь и профили которых связаны с моей учётной записью/);
  assert.doesNotMatch(revision, /child_id|per-child|для каждого ребёнка отдельн/i);
  assert.match(revision, /не публикуются на публичном сайте/);
  assert.match(revision, /не размещаются в социальных сетях/);
  assert.match(revision, /не используются в рекламе/);
  assert.match(revision, /не предназначены для публичного распространения/);
  assert.match(revision, /не используется оператором для распознавания лица|не используются оператором для распознавания лица/);
  assert.match(revision, /биометрической идентификации/);
  assert.match(revision, /30 календарных дней с момента загрузки/);
});

function productionDocumentsFixture() {
  const documents = [
    ...types.map((document_type, index) => ({ id: index + 1, document_type, document_version: 'draft-2026-09',
      title: `Draft ${index + 1}`, body: 'Draft', document_url: null, is_required: 1, is_active: 0 })),
    ...types.map((document_type, index) => ({ id: index + 4, document_type, document_version: '2026-09-27',
      title: `Production ${index + 1}`, body: 'Production text', document_url: null, is_required: 1, is_active: 1 })),
  ];
  const accepted = new Set([1, 2, 3]);
  async function query(sql, params = {}) {
    if (sql.includes('FROM guardians g JOIN users u') && sql.includes('WHERE g.user_id=')) {
      return [[{ id: 5, user_id: 50, full_name: 'Родитель', phone: null, email: null, login: 'parent@example.test', status: 'active' }]];
    }
    if (sql.includes('FROM parent_documents d LEFT JOIN')) {
      return [documents.filter((document) => document.is_active).map((document) => ({
        ...document, accepted_at: accepted.has(document.id) ? '2026-09-27 10:00:00' : null,
      }))];
    }
    if (sql.startsWith('SELECT id FROM parent_documents')) {
      return [documents.filter((document) => document.is_active && String(document.id) === String(params.id)).map(({ id }) => ({ id }))];
    }
    if (sql.startsWith('INSERT INTO parent_document_acceptances')) {
      accepted.add(Number(params.documentId)); return [{ affectedRows: 1 }];
    }
    throw new Error(`Unexpected parent document SQL: ${sql}`);
  }
  return { accepted, service: createParentPortal({ query }) };
}

test('old acceptances do not accept the new version and all three new documents are accepted separately', async () => {
  const fixture = productionDocumentsFixture();
  const before = await fixture.service.documents(parent);
  assert.equal(before.consentRequired, true);
  assert.deepEqual(before.documents.map((document) => [document.type, document.version, document.required, document.acceptedAt]), [
    ['privacy_policy', '2026-09-27', true, null],
    ['personal_data_parent', '2026-09-27', true, null],
    ['personal_data_child_legal_representative', '2026-09-27', true, null],
  ]);
  await fixture.service.acceptDocument(4, parent);
  assert.equal((await fixture.service.documents(parent)).consentRequired, true);
  await fixture.service.acceptDocument(5, parent);
  assert.equal((await fixture.service.documents(parent)).consentRequired, true);
  const after = await fixture.service.acceptDocument(6, parent);
  assert.equal(after.consentRequired, false);
  assert.deepEqual([...fixture.accepted].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6]);
});

test('parent document UI is compact, hides versions, and opens escaped full text in one viewer', async () => {
  const [frontend, css, index, worker] = await Promise.all([
    readFile(new URL('../src/frontend/parent-portal.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/ui/parent-portal.css', import.meta.url), 'utf8'),
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../service-worker.js', import.meta.url), 'utf8'),
  ]);
  const body = 'Первая строка\n<script>alert("xss")</script>';
  const pending = { id: 7, title: 'Политика', body, version: '2026-09-27-r2', acceptedAt: null };
  const accepted = { ...pending, id: 8, acceptedAt: '2026-09-27T10:00:00' };
  const consent = parentConsentDocumentsHtml([pending, accepted]);
  assert.match(consent, /Политика/);
  assert.equal((consent.match(/Открыть документ/g) ?? []).length, 2);
  assert.match(consent, /data-action="accept" data-id="7">Принять/);
  assert.match(consent, /class="accepted">Принято/);
  assert.doesNotMatch(consent, /Первая строка|script|Версия|2026-09-27-r2/);

  const settings = parentSettingsDocumentsHtml([accepted]);
  assert.match(settings, /Принято 27\.09\.2026/);
  assert.match(settings, /Открыть документ/);
  assert.doesNotMatch(settings, /Первая строка|Версия|2026-09-27-r2/);
  const linked = parentSettingsDocumentsHtml([{ id: 9, title: 'Ссылка', body: '', url: 'https://example.test/doc', acceptedAt: null }]);
  assert.match(linked, /href="https:\/\/example\.test\/doc" target="_blank" rel="noopener">Открыть документ<\/a>/);

  const viewer = parentDocumentViewerHtml(pending);
  assert.match(viewer, /role="dialog"/);
  assert.match(viewer, /Первая строка\n&lt;script&gt;alert\(&quot;xss&quot;\)&lt;\/script&gt;/);
  assert.match(viewer, /data-action="document-close">Закрыть/);
  assert.doesNotMatch(viewer, /<script>/);
  assert.match(frontend, /action === 'document-open'[\s\S]*state\.documentViewer = documents\.find/);
  assert.match(frontend, /action === 'document-close'[\s\S]*state\.documentViewer = null; renderDocumentContext\(\)/);
  assert.doesNotMatch(frontend, /Версия \$\{escapeHtml\(document\.version\)\}/);
  assert.match(css, /\.parent-document-body\{white-space:pre-wrap/);
  assert.match(css, /\.parent-document-viewer\{/);

  assert.doesNotMatch(index, /\?v=20260927-5/);
  const versions = [...index.matchAll(/\?v=([^"']+)/g)].map((match) => match[1]);
  assert.ok(versions.length > 0);
  assert.ok(versions.every((version) => version === '20260929-5'));
  assert.match(worker, /CACHE_NAME = 'icube-crm-shell-v2-20260929-5'/);
});
