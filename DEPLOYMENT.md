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

Перед этой версией отдельно примените `018_project_teacher_and_current_invariants.sql` на `icube_test`. Её preflight завершится ошибкой, если уже существуют несколько одновременно текущих memberships, цен, ставок или соглашений одного контекста. В таком случае сначала исследуйте и исправьте конкретные конфликтующие строки вручную с сохранением истории, затем повторите runner: завершённые шаги будут пропущены. Не удаляйте записи `schema_migration_runs`/`schema_migration_steps` и не помечайте неоднозначный DDL-шаг завершённым без сверки реальной схемы.

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
PAYMENT_RECEIPT_STORAGE_DIR=/var/lib/icube-crm/payment-receipts
PAYMENT_RECEIPT_MAX_UPLOAD_MB=10
```

Миграция `021_parent_documents_production.sql` создаёт первую production-редакцию трёх обязательных документов. Следующая редакция `2026-09-27-r2` выпускается миграцией `022_parent_documents_ui_revision.sql`: она деактивирует прежние версии, не изменяя их тексты и историю принятия. Последующие изменения документов также выпускайте новой версией в отдельной миграции.

Напоминания накануне и адресные уведомления о днях рождения создаёт oneshot-задача `npm run parent-notifications:daily`. Она материализует только занятия следующего локального дня, проверяет текущий серверный баланс, вычисляет дни рождения по текущей дате `Asia/Sakhalin` и использует уникальные dedup key. Units рассчитаны на `/opt/icube-crm`, пользователя `icube` и Сахалинское время:

```bash
cp deploy/icube-crm-parent-notifications.service /etc/systemd/system/
cp deploy/icube-crm-parent-notifications.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now icube-crm-parent-notifications.timer
systemctl list-timers | grep icube-crm-parent-notifications
```

Перед выкладкой этой версии примените `017_parent_absence_notices.sql` на test, затем выполните команду вручную и проверьте строки `notifications` типов `reminder_day_before` и `child_birthday`. На production миграция применяется только после test и резервной копии. Timer не отправляет push и не обращается к внешним каналам.

## Игра «Остров чудиков»

По умолчанию выключена. На production закрыта в коде (`APP_ENV=production`, база `icube_prod`), настройками это не обходится.

На test `GAME_ENABLED` не включается, пока владелец не проверил реальный сервер и цепочку прокси по разделу 9 `GAME_PLAN.md`. Для включения нужны `GAME_ENABLED=true`, `GAME_INTERNAL_TOKEN` не короче 32 символов и свободный `GAME_INTERNAL_PORT` (по умолчанию 3001). Порт слушается только на `127.0.0.1` и не проксируется наружу. Откат: `GAME_ENABLED=false` и перезапуск CRM.

`GAME_LOGIN_GRANT_KEY` (не короче 32 символов, не равен `GAME_INTERNAL_TOKEN`) включает разрешения на вход: ребёнка с ним не блокируют чужие ошибки за тем же адресом. Ключ хранится только в `.env` CRM и в `.env` игры не копируется. Без ключа вход работает по правилам этапа 2. Смена ключа отзывает все разрешения сразу, пароли и сессии при этом не меняются.

### Игровой сервер на test (этап 3)

Выполняет владелец после этапа 0, по шагам, с проверкой каждого. Claude Code эти команды не запускает.

1. Отдельный пользователь и папка: `useradd --system --home /opt/icube-game-test icube-game`, свой checkout репозитория в `/opt/icube-game-test`, `cd game && npm ci --ignore-scripts --omit=dev`. У пользователя `icube-game` нет доступа к `/opt/icube-crm` и `.env` CRM.
2. База и пользователь MySQL только для игры:
   ```sql
   CREATE DATABASE icube_game_test CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
   CREATE USER 'icube_game_test_app'@'localhost' IDENTIFIED BY '<пароль>';
   GRANT SELECT, INSERT, UPDATE, CREATE, ALTER, INDEX, REFERENCES ON icube_game_test.* TO 'icube_game_test_app'@'localhost';
   ```
   Прав на `icube_test` и `icube_prod` у него нет (`SHOW GRANTS`).
3. `/opt/icube-game-test/game/.env` по образцу `game/.env.test.example`, права 600. `GAME_INTERNAL_TOKEN` совпадает с CRM, `GAME_LOGIN_GRANT_KEY` туда не входит.
4. Миграции игры: `cd /opt/icube-game-test/game && set -a && . ./.env && set +a && npm run migrate`. Раннер откажется работать с любой базой, кроме `icube_game_test`.
5. `deploy/icube-game-test.service` → `/etc/systemd/system/`, `systemctl daemon-reload && systemctl enable --now icube-game-test`, затем `npm run health`.
6. Nginx: `location /game/` по образцу `deploy/nginx-game-test.example.conf`. `X-Real-IP` должен перезаписываться значением `$remote_addr` настоящего клиента: если перед Nginx стоит ещё прокси, сначала выяснить это на этапе 0.
7. В CRM test: `GAME_ENABLED=true`, `GAME_INTERNAL_TOKEN`, `GAME_LOGIN_GRANT_KEY`, перезапуск CRM.

Этап 4 (звёзды): после обновления игры — `npm run migrate` в `/opt/icube-game-test/game` (миграция `002_game_stars.sql`, только `icube_game_test`), затем `systemctl restart icube-game-test` и `npm run health` (ожидается 7 таблиц). Игра дополнительно слушает обратный канал `127.0.0.1:3101` (`GAME_INTERNAL_PORT` в `.env` игры) для бонусов сотрудников: порт должен быть свободен и не проксироваться наружу. В `.env` CRM test — `GAME_SERVER_INTERNAL_URL=http://127.0.0.1:3101` (по умолчанию) и при желании `GAME_BONUS_MAX_STARS` (1–10). Миграций CRM в этапе 4 нет. Фоновая сверка звёзд идёт раз в 12 минут и при входе ребёнка; если CRM недоступна, звёзды не меняются. Игровой процесс должен быть один: не запускайте второй экземпляр `icube-game-test`.

Откат игры: `systemctl stop icube-game-test` и убрать `location /game/`. CRM от этого не меняется. Обновление игры — `git pull` в `/opt/icube-game-test` и `systemctl restart icube-game-test`; CRM при этом не перезапускается.

При выключенной игре в журнале запросов будет один `GET /children/:id/game-access` с ответом 404 на загрузку страницы директора или партнёра. Это ожидаемо. `deleteChild` выполняет дополнительный `SELECT ... FOR UPDATE` и обезличивает игровую учётку, если она есть.
