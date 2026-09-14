# API `/api/v1`

Backend — единственный компонент с доступом к MySQL. Ответы имеют вид `{ "data": ... }`, ошибки — `{ "error": { "code", "message", "details" } }`. Денежные суммы и другие точные DECIMAL, включая дробные количества занятий, передаются строками; даты — ISO 8601, идентификаторы — строками. UI преобразует значения только для отображения. Backend-математика денег и точных количеств не использует обычный бинарный JavaScript `Number`.

## Авторизация и роли

На первом test-срезе настоящая авторизация ещё не реализована: в `test` и `development` backend сам назначает запросу роль `director`. В `production` этот временный режим отключён. Заголовки или поля роли из браузера не используются.

- `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`.
- `director`: полный доступ к рабочим сущностям и настройкам.
- `teacher`: чтение назначенных групп/детей/занятий; отдельные permissions на старт, посещаемость, завершение, фотографии, quick child, изменение даты/времени и фактического преподавателя, отмену занятия.
- `partner`: только проекты и расчёты, связанные с аккаунтом через `partner_users`.
- `parent`: в будущем чтение связанных детей, посещений и оплат.
- `child`: в будущем собственный профиль и разрешённые игровые/учебные данные.

Роль не принимается из формы или произвольного заголовка. Сервер получает user id из проверенного access token и загружает актуальные роли из БД/кеша с учётом `token_version`.

Permission преподавателя не даёт доступ к любому занятию. Service-layer для каждого teacher-маршрута проверяет, что авторизованный преподаватель назначен на конкретное занятие или иначе связан с ним по разрешённому правилу. Нельзя доверять `teacherId` или роли из браузера. Аналогично роль `partner` недостаточна: сервер фильтрует данные через `partner_users → partners → projects` и отклоняет подстановку чужого `projectId`.

## Ресурсы

| Область | Основные маршруты |
| --- | --- |
| Дети | `GET/POST /children`, `GET/PATCH/DELETE /children/:id` |
| Направления ребёнка | `POST /children/:id/enrollments`, `PATCH /enrollments/:id` |
| Перенос | `POST /balance-transfers` |
| Группы | `GET/POST /groups`, `GET/PATCH /groups/:id`, `POST /groups/:id/memberships` |
| Справочники | `/directions`, `/sites`, `/teachers`, `/projects` |
| Версии настроек | `GET/POST /price-versions`, `GET/POST /salary-rate-versions`, `GET/POST /partner-agreement-versions` |
| Календарь | `GET /lessons?from=&to=&teacherId=&projectId=` |
| Занятие | `GET /lessons/:id`, директорский `PATCH /lessons/:id`, teacher `PATCH /lessons/:id/teacher-details`, `POST /lessons/:id/start`, `POST /lessons/:id/cancel`, директорский `POST /lessons/:id/empty-trip` |
| Посещение | `PUT /lessons/:id/attendance/:childId` |
| Завершение | `POST /lessons/:id/finish` |
| Quick child | `POST /lessons/:id/quick-child` — ФИО обязательно, контакт родителя необязателен |
| Дополнительный ребёнок | `POST /lessons/:id/extras` с `childId`, `DELETE /lessons/:id/extras/:childId` |
| Фотографии | `POST /lessons/:id/photos`, `DELETE /lessons/:id/photos/:photoId` |
| Оплаты | `GET/POST /payments`, `GET /payments/:id`, `POST /payments/:id/reverse` |
| Возвраты | `GET/POST /refunds`, `POST /refunds/:id/reverse` |
| Балансы | `GET /balances`, `GET /children/:id/ledger` |
| Зарплата | `GET /salary-accruals?teacherId=&from=&to=` |
| Партнёр | `GET/POST /partner-settlements` |
| Статистика | `GET /statistics?...` |
| Уведомления | `GET /notifications`, `POST /notifications/:id/read` |

Реально подключённый каталоговый срез: чтение проектов; чтение и изменение направлений, площадок, преподавателей, групп и детей; создание/изменение направлений ребёнка.

Первый финансовый срез реализует `GET/POST/PATCH/DELETE /payments` и `GET /balances`. Создание, исправление и удаление оплаты меняют её единственную запись в `balance_entries` и баланс соответствующего enrollment в одной транзакции. Оплаты с уже связанной последующей историей удалить нельзя. Возвраты пока не подключены.

Срез занятий реализует материализацию occurrence из расписания групп, `GET/POST/PATCH /lessons`, start/cancel/empty-trip/finish, attendance, extras, quick child и чтение `salary-accruals`. Start фиксирует основной roster в `lesson_roster_members`; последующие изменения группы его не меняют. Обычное присутствие списывает один урок по FIFO из `balance_lots`, а нехватка оплаченных lots оставляет разрешённый отрицательный баланс. Исправление проведённого attendance создаёт reversal исходного ledger effect, восстанавливает те же lots и создаёт новый эффект при необходимости. Зарплата начисляется фактическому преподавателю по versioned rate; прежнее начисление помечается `reversed_at`, новое ссылается на него через `supersedes_accrual_id`.

Маршруты возвратов, переводов баланса, фотографий, версий настроек, партнёрских расчётов, статистики и уведомлений пока возвращают `501 NOT_IMPLEMENTED`.

`DELETE /children/:id` доступен только директору и удаляет ошибочно созданную карточку лишь при отсутствии оплат, возвратов и посещений. При наличии истории сервер возвращает conflict/validation error. Версии цен, ставок зарплаты и партнёрских условий также не имеют обычного `PATCH`: изменение транзакционно закрывает прежнюю версию и создаёт новую с новым `valid_from`.

## Командные операции

Start, finish и повторная одинаковая отметка attendance идемпотентны по текущему состоянию строки, которое проверяется под `SELECT ... FOR UPDATE`. Уникальные связи ledger/reversal дополнительно защищают финансовый эффект. Сохранение и повторная выдача результата по `Idempotency-Key` через таблицу `idempotency_keys` будет подключено вместе с настоящей авторизацией, поскольку ключ привязан к проверенному `user_id`.

Пример завершения:

```http
POST /api/v1/lessons/847/finish
Authorization: Bearer …
Idempotency-Key: 03f04370-98aa-42c8-bbc0-b0efb94dbca2
Content-Type: application/json

{"expectedVersion":4}
```

Сервер внутри одной транзакции проверяет права и версию, фиксирует состав/посещения, создаёт максимум одно списание на attendance, сохраняет снимок зарплаты и помечает занятие завершённым.

## Валидация и безопасность

Все входные DTO используют allowlist полей. SQL только параметризованный. Ограничиваются размер JSON, число записей на страницу и размер фотографий. Пароли хешируются Argon2id или bcrypt с актуальными параметрами; refresh token хранится только как хеш и передаётся в `HttpOnly Secure SameSite` cookie. Access token короткоживущий. Изменения финансов и ролей пишутся в `audit_log`.

Quick child создаётся транзакционно с `needs_director_review=true`, `created_from_lesson_id` и текущим `created_by_user_id`. Guardian и связь `child_guardians` создаются только если преподаватель указал контакт; имя guardian не обязательно. Изменения статусов записываются одновременно с основной сущностью в `child_status_history` или `enrollment_status_history`.

Добавление и удаление существующего extra child использует отдельный permission `lessons:extras`. Service-layer повторно проверяет доступ преподавателя к конкретному занятию; permission не открывает остальные занятия.

Партнёр получает `projects:read`, но `GET /projects` и `GET /projects/:id` по-прежнему фильтруются через `partner_users → partners → projects`. Teacher, parent и child доступа к справочнику проектов не имеют.
