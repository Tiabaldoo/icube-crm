# API `/api/v1`

Backend — единственный компонент с доступом к MySQL. Ответы имеют вид `{ "data": ... }`, ошибки — `{ "error": { "code", "message", "details" } }`. Денежные суммы и другие точные DECIMAL, включая дробные количества занятий, передаются строками; даты — ISO 8601, идентификаторы — строками. UI преобразует значения только для отображения. Backend-математика денег и точных количеств не использует обычный бинарный JavaScript `Number`.

## Авторизация и роли

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
| Занятие | `GET /lessons/:id`, директорский `PATCH /lessons/:id`, teacher `PATCH /lessons/:id/teacher-details`, `POST /lessons/:id/start`, `POST /lessons/:id/cancel` |
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

Проведённые оплаты и возвраты не имеют обычного `PATCH`. «Редактирование оплаты» в UI выполняется сервером как reversal исходной операции и создание исправленной операции в одной транзакции, без `UPDATE` исторической записи.

`DELETE /children/:id` доступен только директору и удаляет ошибочно созданную карточку лишь при отсутствии оплат, возвратов и посещений. При наличии истории сервер возвращает conflict/validation error. Версии цен, ставок зарплаты и партнёрских условий также не имеют обычного `PATCH`: изменение транзакционно закрывает прежнюю версию и создаёт новую с новым `valid_from`.

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

Quick child создаётся транзакционно с `needs_director_review=true`, `created_from_lesson_id` и текущим `created_by_user_id`. Guardian и связь `child_guardians` создаются только если преподаватель указал контакт; имя guardian не обязательно. Изменения статусов записываются одновременно с основной сущностью в `child_status_history` или `enrollment_status_history`.

Добавление и удаление существующего extra child использует отдельный permission `lessons:extras`. Service-layer повторно проверяет доступ преподавателя к конкретному занятию; permission не открывает остальные занятия.

Партнёр получает `projects:read`, но `GET /projects` и `GET /projects/:id` по-прежнему фильтруются через `partner_users → partners → projects`. Teacher, parent и child доступа к справочнику проектов не имеют.
