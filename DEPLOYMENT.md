# Будущее развёртывание

Этот документ описывает следующий этап. Сейчас ничего из него не выполняется: VPS, REG.RU, домены, FASTPANEL и настоящий MySQL не затрагиваются.

Существующий GitHub Pages workflow оставлен только как ручной preview прототипа (`workflow_dispatch`). Push в `main` больше не публикует страницу автоматически. Будущий test/production pipeline следует создавать после появления VPS и секретов окружений.

## Среды

| Среда | Ветка/сборка | База | Назначение |
| --- | --- | --- | --- |
| test | проверенная тестовая сборка | `icube_test` | миграции, интеграционные тесты, ручная регрессия |
| production | релизный commit/tag после test | `icube_prod` | реальные данные |

Обе базы получают отдельных пользователей с минимальными правами. API test не может знать пароль production, а production-процесс не получает пароль test. Frontend знает только URL API своей среды.

## Секреты

Все секреты находятся только в `.env` на сервере или в защищённом secret storage CI. `.env` исключён из Git. Репозиторий содержит только примеры `.env.test.example` и `.env.production.example` без настоящих значений.

Не помещать в frontend, GitHub Actions logs или GitHub Pages: пароль MySQL, session token, данные резервных копий, ключи почты/файлового хранилища. Браузер обращается к HTTPS API, а MySQL слушает localhost или закрыт firewall для внешней сети.

## Порядок релиза

1. Зафиксировать commit и пройти `npm test`/`npm run check`.
2. Создать резервную копию `icube_prod` перед любой production-миграцией.
3. Применить новые миграции к `icube_test`.
4. Выполнить smoke и полный чек-лист на test, включая финансовые операции и мобильный экран.
5. Применить те же неизменённые миграции к `icube_prod`.
6. Развернуть тот же commit API/frontend и проверить health/read-only сценарии.
7. Хранить журнал версии приложения, миграций и пути к проверенной резервной копии.

## Жёсткие правила production-БД

- Production-БД никогда автоматически не очищается и не пересоздаётся.
- Запрещены `DROP DATABASE`, `TRUNCATE` и автоматический запуск тестовых/demo seed-данных на production.
- Структура production меняется только миграциями, уже проверенными на `icube_test`, и только после свежей проверенной резервной копии.
- Применённые миграции не редактируются и не переименовываются.
- Откат данных выполняется отдельной проверенной операцией или восстановлением копии, а не разрушительным down-script.
- Автоматические тесты используют только отдельную test-БД и учётную запись без прав на `icube_prod`.

Runner дополнительно требует точное имя `icube_prod` для `APP_ENV=production` и `icube_test` для `APP_ENV=test`, но это страховка, а не замена резервной копии и разграничения прав.

## Предлагаемая схема VPS

Ubuntu 24.04 + FASTPANEL управляет доменами и TLS. Nginx/Apache проксирует `/api` на Node-процесс, слушающий `127.0.0.1:3000`; статический frontend обслуживается отдельно. API запускается под непривилегированным системным пользователем через systemd. MySQL Community не публикует порт 3306 наружу.

Минимальные меры до production: SSH-ключи без парольного root-входа, firewall, unattended security updates, ежедневная зашифрованная off-server копия MySQL, проверка восстановления, ротация журналов, мониторинг свободного места, uptime и ошибок API.

## Приватное хранилище фотографий

Задайте отдельный каталог вне web root и права только системному пользователю Node-процесса:

```dotenv
PHOTO_STORAGE_DIR=/var/lib/icube-crm/lesson-photos
PHOTO_RETENTION_DAYS=30
PHOTO_MAX_UPLOAD_MB=5
```

Для test используйте другой каталог, например `/var/lib/icube-crm-test/lesson-photos`. Каталог нельзя публиковать через Nginx/FASTPANEL как static files: скачивание идёт только через авторизованный API. Включите мониторинг свободного места и ошибок записи; каталог с файлами включите в политику резервного копирования с учётом 30-дневного retention.

Команда `npm run photos:cleanup` удаляет с диска просроченные и ранее помеченные удалёнными файлы, сохраняя metadata. Для автоматического запуска используйте systemd units из `deploy/`, описанные ниже.

После миграции `015_lesson_photo_storage.sql` до выкладки frontend проверьте запись в `PHOTO_STORAGE_DIR`, upload/download/delete на `icube_test` и успешный ручной запуск cleanup. Production не очищается миграцией: срок считается от `created_at` для уже существующей metadata.

### Автоматическая очистка фотографий

Units рассчитаны на установку приложения в `/opt/icube-crm` и запуск от системного пользователя `icube`. Они используют существующий `/opt/icube-crm/.env`, поэтому отдельные DB-пароли, имя базы или `PHOTO_STORAGE_DIR` в unit-файлы не вшиваются.

Установка:

```bash
cp deploy/icube-crm-photo-cleanup.service /etc/systemd/system/
cp deploy/icube-crm-photo-cleanup.timer /etc/systemd/system/

systemctl daemon-reload
systemctl enable --now icube-crm-photo-cleanup.timer
```

Проверка таймера:

```bash
systemctl status icube-crm-photo-cleanup.timer
systemctl list-timers | grep icube-crm-photo-cleanup
```

Ручной запуск очистки:

```bash
systemctl start icube-crm-photo-cleanup.service
```

Логи последнего и предыдущих запусков:

```bash
journalctl -u icube-crm-photo-cleanup.service
```

Таймер запускает oneshot-задачу ежедневно около 03:17. `Persistent=true` означает, что если сервер был выключен в запланированное время, пропущенный запуск будет выполнен после следующего старта systemd.

#### Безопасная проверка retention на test без ожидания 30 дней

Не меняйте `PHOTO_RETENTION_DAYS`, `uploaded_at` или сроки у нескольких строк. Для проверки используйте ровно одну специально загруженную фотографию на test-сервере.

1. Загрузите отдельное тестовое фото и выберите его `id`.
2. До любых изменений зафиксируйте `id`, `storage_key` и текущий срок:

```sql
SELECT id, lesson_id, child_id, storage_key, uploaded_at, expires_at, purged_at
FROM lesson_photos
WHERE id = <TEST_PHOTO_ID>;
```

3. Убедитесь на сервере, что файл существует по пути `$PHOTO_STORAGE_DIR/<storage_key>`.
4. Только для выбранной строки сделайте её просроченной на одну минуту:

```sql
UPDATE lesson_photos
SET expires_at = NOW(6) - INTERVAL 1 MINUTE
WHERE id = <TEST_PHOTO_ID>;
```

Сразу повторите `SELECT` по тому же `id` и убедитесь, что изменился только `expires_at`.

5. Запустите cleanup вручную:

```bash
systemctl start icube-crm-photo-cleanup.service
journalctl -u icube-crm-photo-cleanup.service
```

6. Проверьте metadata:

```sql
SELECT id, storage_key, uploaded_at, expires_at, purged_at
FROM lesson_photos
WHERE id = <TEST_PHOTO_ID>;
```

Ожидается: строка осталась, `expires_at` сохранён, `purged_at IS NOT NULL`. Файл в `$PHOTO_STORAGE_DIR/<storage_key>` должен отсутствовать, а запрос файла через API должен вернуть HTTP 410 (`PHOTO_EXPIRED` либо `PHOTO_FILE_MISSING`). Выберите ещё одну свежую контрольную фотографию и убедитесь, что её `purged_at` остался `NULL`: cleanup не должен затрагивать непросроченные файлы.

## Миграции

После создания пустой базы и пользователя в панели таблицы создаются автоматически:

```bash
set -a
. ./.env
set +a
npm run migrate
```

Команда запускается из релизного каталога. На production она не должна быть частью безусловного старта процесса: сначала отдельный контролируемый шаг с backup и результатами проверки test.

## Первый директор и Auth v1

После применения миграций первый director создаётся один раз из каталога релиза. Пароль передаётся только через переменную окружения процесса и не записывается в репозиторий:

```bash
DIRECTOR_PASSWORD='временный-сильный-пароль' npm run create-director -- --email director@example.com --name 'Имя Директора'
```

Скрипт откажется создавать дубликат email. После входа директор создаёт доступ преподавателям в их карточках: учётная запись не появляется автоматически вместе с записью teacher. Для test и production используются отдельные пользователи и сессии. HTTPS обязателен, поскольку session cookie всегда имеет флаг `Secure`; reverse proxy должен передавать `/api/v1` тому же origin frontend.

## Партнёр «Зебра»

После применения `013_partner_project_scope.sql` создайте партнёрскую учётную запись в нужной среде. Это отдельная операция после миграции, с паролем только в переменной окружения процесса:

```bash
PARTNER_PASSWORD='сильный-временный-пароль' npm run create-partner -- --email partner@example.com --name 'Имя Партнёра' --project zebra
```

Скрипт использует тот же bcrypt, что и директорский вход, связывает пользователя с существующим партнёром проекта или создаёт его при отсутствии, а для «Зебры» добавляет стартовую версию соглашения 4 / 40 / 60 только если активной версии ещё нет. Он не перезаписывает действующие условия. Сначала проверяйте миграцию и вход на `icube_test`; production применяйте только после backup по общему порядку релиза. Фронтенд и API должны быть одной версии: новая схема требуется до входа партнёра. MySQL не должен быть доступен браузеру напрямую.

## Родительский кабинет и ежедневные уведомления

Настройки связи и времени задаются только серверным `.env`:

```dotenv
APP_TIME_ZONE=Asia/Sakhalin
PARENT_MAX_URL=https://max.ru/example
PARENT_CONTACT_PHONE=+70000000000
PARENT_PAYMENT_QR_URL=https://example.invalid/payment-qr.png
```

URL QR пока является статической заглушкой и не создаёт оплату. До production замените три seeded документа `draft-2026-09` юридически проверенными версиями: создайте новые строки `parent_documents`, деактивируйте черновые только после проверки и не редактируйте уже принятую версию задним числом.

Напоминания накануне создаёт oneshot-задача `npm run parent-notifications:daily`. Она материализует только занятия следующего локального дня, проверяет текущий серверный баланс и использует уникальный dedup key. Units рассчитаны на `/opt/icube-crm`, пользователя `icube` и Сахалинское время:

```bash
cp deploy/icube-crm-parent-notifications.service /etc/systemd/system/
cp deploy/icube-crm-parent-notifications.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now icube-crm-parent-notifications.timer
systemctl list-timers | grep icube-crm-parent-notifications
```

До включения timer на production сначала примените `016_parent_portal.sql`, выполните команду вручную на test и проверьте созданные строки `notifications`. Timer не отправляет push и не обращается к внешним каналам.
