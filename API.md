# API `/api/v1`

Backend — единственный компонент с доступом к MySQL. Ответы имеют вид `{ "data": ... }`, ошибки — `{ "error": { "code", "message", "details" } }`. Денежные суммы и другие точные DECIMAL, включая дробные количества занятий, передаются строками; даты — ISO 8601, идентификаторы — строками. UI преобразует значения только для отображения. Backend-математика денег и точных количеств не использует обычный бинарный JavaScript `Number`.

## Авторизация и роли

Auth v1 использует серверные сессии. Временного назначения роли `director` для test/development больше нет: все среды требуют вход. Заголовки, query/body-поля и frontend-state с ролью или `teacherId` источником прав не являются.

- `POST /auth/login` принимает `{ "login": "user@example.com", "password": "..." }`, нормализует email через trim/lowercase и при успехе устанавливает 30-дневную session cookie.
- `GET /auth/me` возвращает `{ "id", "displayName", "roles", "teacherId", "projectIds" }`.
- `POST /auth/logout` отзывает текущую сессию и очищает cookie.
- `POST /auth/refresh` в Auth v1 не используется и пока возвращает `501`.
- `director`: полный доступ к рабочим сущностям и настройкам.
- `teacher`: чтение назначенных групп/детей/занятий; отдельные permissions на старт, посещаемость, завершение, фотографии, quick child, изменение даты/времени и фактического преподавателя, отмену занятия.
- `partner`: вход в общий интерфейс с проектным ограничением по активной связи `partner_users → partners → projects`; сейчас один активный проект на сессию. Несколько пользователей одного партнёра допустимы.
- `parent`, `child`: заложены в permission-модели, но вход и кабинеты этих ролей не реализованы.

Cookie содержит случайный непрозрачный token; в `auth_sessions` хранится только его SHA-256 hash. Middleware на каждом запросе проверяет срок, `revoked_at`, активный статус user и совпадение session/user `token_version`, после чего загружает роли и связанную запись `teachers.user_id`. Cookie имеет `HttpOnly`, `Secure`, `SameSite=Lax` и недоступна JavaScript.

Permission преподавателя не даёт доступ к любому занятию. Service-layer для каждого teacher-маршрута проверяет, что авторизованный преподаватель назначен на конкретное занятие или иначе связан с ним по разрешённому правилу. Нельзя доверять `teacherId` или роли из браузера. Аналогично роль `partner` недостаточна: сервер фильтрует данные через `partner_users → partners → projects` и отклоняет подстановку чужого `projectId`.

## Ресурсы

| Область | Основные маршруты |
| --- | --- |
| Дети | `GET/POST /children`, `GET/PATCH/DELETE /children/:id` |
| Направления ребёнка | `POST /children/:id/enrollments`, `PATCH/DELETE /enrollments/:id`, `POST /enrollments/:id/project-transfer` с `{ "projectId" }` |
| Перенос | `GET /balance-transfers`, `GET /balance-transfers/preview`, `POST /balance-transfers`, `DELETE /balance-transfers/:id` |
| Группы | `GET/POST /groups`, `GET/PATCH /groups/:id`, `POST /groups/:id/memberships` |
| Справочники | `/directions`, `/sites`, `/teachers`, `/projects`; `GET /sites/venues` — только названия активных физических площадок для выбора места занятия |
| Главная | `GET /dashboard/daily` — сводка за текущий день по проектам текущей роли |
| Цель переноса проекта | `GET /project-transfer-targets` — разрешённые проекты назначения |
| Доступ преподавателя | директорские `GET/POST/DELETE /teachers/:id/access`, `POST /teachers/:id/access/reset-password` |
| Версии настроек | `GET/POST /price-versions`, `GET/POST /salary-rate-versions`, `GET/POST /partner-agreement-versions` |
| Календарь | `GET /lessons?from=&to=&teacherId=&projectId=` |
| Занятие | `GET /lessons/:id`, директорские `PATCH/DELETE /lessons/:id`, teacher `PATCH /lessons/:id/teacher-details`, `POST /lessons/:id/start`, `POST /lessons/:id/cancel`, директорский `POST /lessons/:id/empty-trip` |
| Посещение | `PUT /lessons/:id/attendance/:childId`, директорский `DELETE /lessons/:id/attendance/:childId` для ошибочной записи |
| Завершение | `POST /lessons/:id/finish` |
| Quick child | `POST /lessons/:id/quick-child` — ФИО обязательно, контакт родителя необязателен |
| Дополнительный ребёнок | `POST /lessons/:id/extras` с `childId`, `DELETE /lessons/:id/extras/:childId` |
| Фотографии | `POST /lessons/:id/photos`, `DELETE /lessons/:id/photos/:photoId` |
| Оплаты | `GET/POST/PATCH/DELETE /payments`, `GET /payments/:id` |
| Возвраты | `GET/POST /refunds`, `DELETE /refunds/:id` |
| Балансы | `GET /balances`, `GET /children/:id/ledger` |
| Зарплата | `GET /salary-accruals?teacherId=&from=&to=` |
| Партнёр | live calculation `GET /partner-settlements?projectId=&from=&to=`; фиксация `POST /partner-settlements` пока не реализована |
| Статистика | `GET /statistics?from=&to=&projectId=all&directionId=all` |
| Уведомления | `GET /notifications`; `POST /notifications/:id/read` пока возвращает `501` |

Партнёру разрешены рабочие CRUD-операции только своего проекта: дети и их текущие направления, группы, площадки, преподаватели, оплаты, возвраты, балансы, занятия и зарплата. `GET /lessons` и `GET /lessons/:id` для чужого проекта возвращают только календарный read-only DTO: время, группа, преподаватель, проект и фактическая площадка. Любая мутация такого занятия отклоняется `403`. Статистика, настройки, управление аккаунтами преподавателей и директорский партнёрский расчёт партнёру недоступны. `GET /sites/venues` не даёт права редактировать чужую площадку: она служит только физическим местом конкретного занятия.

`POST /enrollments/:id/project-transfer` транзакционно закрывает старый enrollment, снимает текущую группу, создаёт новый enrollment того же ребёнка и направления в целевом проекте, переносит положительный денежный остаток через существующий FIFO balance transfer и создаёт уведомление для проекта назначения. Партнёр может переносить только своё направление в iCubeRobots; директор — в обе стороны. Старые платежи, возвраты, занятия и зарплата сохраняют исходные проектные снимки. Новый enrollment до назначения группы имеет `groupId=null`. При отрицательном балансе перенос отклоняется; сначала нужно закрыть долг.

Проект существующей группы не редактируется: `PATCH /groups/:id` с другим `projectId` возвращает `409`. Если директор удаляет группу партнёрского проекта без блокирующей истории, партнёру записывается уведомление `project_change`.

Реально подключённый каталоговый срез: чтение проектов; чтение и изменение направлений, площадок, преподавателей, групп и детей; создание/изменение направлений ребёнка.

Финансовый срез реализует `GET/POST/PATCH/DELETE /payments`, `GET /balances`, `GET/POST/DELETE /refunds` и перенос всего положительного остатка между направлениями. `DELETE /balance-transfers/:id` отменяет перенос одной транзакцией только пока созданный target lot не использован. Исходные lots восстанавливаются по сохранённым фактическим изменениям, включая поглощение старого долга; старые переносы без этой истории безопасно отклоняются.

Срез занятий реализует материализацию occurrence из расписания групп, `GET/POST/PATCH/DELETE /lessons`, start/cancel/empty-trip/finish, attendance, extras, quick child и чтение `salary-accruals`. `POST /lessons` создаёт только один явно выбранный occurrence, в том числе в прошлом, после проверки даты по расписанию группы; остальные пропущенные занятия не материализуются. Start фиксирует основной roster в `lesson_roster_members`; последующие изменения группы его не меняют. Finish обычного или ознакомительного занятия требует хотя бы одного реально присутствующего ребёнка; при пустом составе используются cancel или директорский empty-trip. Обычное присутствие списывает один урок по FIFO из `balance_lots`, а нехватка оплаченных lots оставляет разрешённый отрицательный баланс. Исправление проведённого attendance создаёт reversal исходного ledger effect, восстанавливает те же lots и создаёт новый эффект при необходимости. Директорское удаление ошибочного attendance после reversal физически очищает его технический ledger; явно отмеченное отсутствие остаётся историей. Директорское удаление занятия обращает активные списания, очищает attendance, roster, фотографии и зарплату, затем сохраняет tombstone, поэтому occurrence не материализуется повторно. Зарплата начисляется фактическому преподавателю по versioned rate; прежнее начисление помечается `reversed_at`, новое ссылается на него через `supersedes_accrual_id`.

`GET /partner-settlements` агрегирует оплаты, возвраты, наличные и актуальную зарплату по историческому `project_id_snapshot` и возвращает live calculation без записи в `partner_settlements`. Маршруты фотографий и фиксации партнёрского расчёта через `POST /partner-settlements` пока возвращают `501 NOT_IMPLEMENTED`.

`GET /statistics` возвращает директорский read model за период: проведённые занятия, обычные посещения и явные пропуски, первых обычных посетителей, последние события pause/finish, текущих активных детей и заполненность активных групп. Исторические показатели фильтруются по snapshots занятия или статусного события; current-state показатели — по текущей активной membership.

`DELETE /children/:id` доступен директору, а партнёру — только для ребёнка без текущих направлений чужого проекта. Удаление возможно лишь при отсутствии активных оплат, возвратов, отмеченных посещений, переносов (включая межпроектные), ненулевого баланса и невозмещённого ledger effect. Полностью reversed технические строки очищаются транзакционно. При наличии активной истории сервер возвращает conflict/validation error. Версии цен, ставок зарплаты и партнёрских условий также не имеют обычного `PATCH`: изменение транзакционно закрывает прежнюю версию и создаёт новую с новым `valid_from`.

## Командные операции

Start, finish и повторная одинаковая отметка attendance идемпотентны по текущему состоянию строки, которое проверяется под `SELECT ... FOR UPDATE`. Уникальные связи ledger/reversal дополнительно защищают финансовый эффект. Проверенный session user id уже передаётся финансовым и lesson-операциям как actor; полный replay сохранённого результата по `Idempotency-Key` остаётся отдельной задачей.

Пример завершения:

```http
POST /api/v1/lessons/847/finish
Idempotency-Key: 03f04370-98aa-42c8-bbc0-b0efb94dbca2
Content-Type: application/json

{"expectedVersion":4}
```

Сервер внутри одной транзакции проверяет права и версию, фиксирует состав/посещения, создаёт максимум одно списание на attendance, сохраняет снимок зарплаты и помечает занятие завершённым.

## Валидация и безопасность

Все входные DTO используют allowlist полей. SQL только параметризованный. Пароли хешируются bcrypt с cost 12. Session token хранится в БД только как SHA-256 hash и передаётся в `HttpOnly Secure SameSite=Lax` cookie. Сброс пароля и отключение teacher-доступа увеличивают `token_version` и отзывают все сессии пользователя.

Teacher видит только группы, где он текущий основной преподаватель, и детей из текущего состава этих групп либо frozen roster/extras доступных ему занятий. Lesson service дополнительно ограничивает каждое чтение и изменение по `planned_teacher_id`/`actual_teacher_id`. Ответы teacher не содержат цены, балансы и зарплату. Директорское «Открыть как преподаватель» меняет только представление страницы; session actor и роль запроса остаются директорскими.

Quick child создаётся транзакционно с `needs_director_review=true`, `created_from_lesson_id` и текущим `created_by_user_id`. Guardian и связь `child_guardians` создаются только если преподаватель указал контакт; имя guardian не обязательно. Изменения статусов записываются одновременно с основной сущностью в `child_status_history` или `enrollment_status_history`.

Добавление и удаление существующего extra child использует отдельный permission `lessons:extras`. Service-layer повторно проверяет доступ преподавателя к конкретному занятию; permission не открывает остальные занятия.

Партнёр получает `projects:read`, но `GET /projects` и `GET /projects/:id` по-прежнему фильтруются через `partner_users → partners → projects`. Teacher, parent и child доступа к справочнику проектов не имеют.
