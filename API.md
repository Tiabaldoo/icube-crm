# API `/api/v1`

Backend — единственный компонент с доступом к MySQL. Ответы имеют вид `{ "data": ... }`, ошибки — `{ "error": { "code", "message", "details" } }`. Денежные суммы передаются строками с двумя знаками, даты — ISO 8601, идентификаторы — строками, чтобы избежать потери точности в JavaScript.

## Авторизация и роли

- `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`.
- `director`: полный доступ к рабочим сущностям и настройкам.
- `teacher`: чтение назначенных групп/детей/занятий, старт и ведение занятия, посещаемость и фотографии.
- `partner`: только разрешённые партнёрские проекты и расчёты.
- `parent`: в будущем чтение связанных детей, посещений и оплат.
- `child`: в будущем собственный профиль и разрешённые игровые/учебные данные.

Роль не принимается из формы или произвольного заголовка. Сервер получает user id из проверенного access token и загружает актуальные роли из БД/кеша с учётом `token_version`.

## Ресурсы

| Область | Основные маршруты |
| --- | --- |
| Дети | `GET/POST /children`, `GET/PATCH /children/:id` |
| Направления ребёнка | `POST /children/:id/enrollments`, `PATCH /enrollments/:id` |
| Перенос | `POST /balance-transfers` |
| Группы | `GET/POST /groups`, `GET/PATCH /groups/:id`, `POST /groups/:id/memberships` |
| Справочники | `/directions`, `/sites`, `/teachers`, `/projects` |
| Календарь | `GET /lessons?from=&to=&teacherId=&projectId=` |
| Занятие | `GET/PATCH /lessons/:id`, `POST /lessons/:id/start`, `POST /lessons/:id/cancel` |
| Посещение | `PUT /lessons/:id/attendance/:childId` |
| Завершение | `POST /lessons/:id/finish` |
| Оплаты | `GET/POST /payments`, `GET /payments/:id`, `POST /payments/:id/reverse` |
| Возвраты | `GET/POST /refunds`, `POST /refunds/:id/reverse` |
| Балансы | `GET /balances`, `GET /children/:id/ledger` |
| Зарплата | `GET /salary-accruals?teacherId=&from=&to=` |
| Партнёр | `GET/POST /partner-settlements` |
| Статистика | `GET /statistics?...` |
| Уведомления | `GET /notifications`, `POST /notifications/:id/read` |

## Командные операции

Оплата, возврат, перенос, старт и завершение занятия принимают `Idempotency-Key`. Конфликт версии возвращает `409 VERSION_CONFLICT`; повтор уже выполненной команды с тем же телом возвращает сохранённый ответ; тот же ключ с другим телом возвращает `409 IDEMPOTENCY_CONFLICT`.

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
