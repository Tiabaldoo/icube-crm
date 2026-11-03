# game/ — «Остров чудиков»

Игровой сервер и страница игры. План — в [GAME_PLAN.md](../GAME_PLAN.md), правила работы — в [CLAUDE.md](../CLAUDE.md).

Этап 3: отдельный процесс, своя база, вход ребёнка через внутренний API CRM, сессии, профиль с ником и страница-заглушка. Сама игра подключается на этапе 5.

| Папка | Что внутри |
| --- | --- |
| `server/` | игровой API (Express): вход, сессии, профили, раннер миграций |
| `client/` | страница-заглушка: вход, ник, «Выйти» |
| `migrations/` | миграции только для `icube_game_test` |
| `tests/` | тесты игры (`node --test`) |

## Границы

- Код игры не импортирует `backend/` и `database/` и не читает `DB_*`: базы CRM для него нет. Всё, что нужно от CRM, — `POST /internal/game/verify-child` и `GET /internal/game/children/:id/status` на `127.0.0.1:3001`.
- CRM код игры не импортирует. Проверяют `tests/game-isolation.test.mjs` и `tests/game-child-access.test.mjs` в `npm test` CRM.
- Работает только при `APP_ENV=test` или `development` и только с базой `icube_game_test`.

## Команды

Из папки `game/`:

```bash
npm ci --ignore-scripts
npm test                     # тесты без базы
npm run migrate              # миграции icube_game_test (только локально или на test владельцем)
npm start                    # 127.0.0.1:3100
npm run health               # база, таблицы и внутренний API CRM
```

Интеграционные тесты с MySQL — только с локальной базой `icube_game_test`:

```bash
APP_ENV=test GAME_INTEGRATION=1 GAME_DB_HOST=127.0.0.1 GAME_DB_NAME=icube_game_test GAME_DB_USER=... GAME_DB_PASSWORD=... npm run test:integration
```

В CI они идут на временном контейнере MySQL (`.github/workflows/ci.yml`, задача `game-mysql`).

## API

| Метод | Что делает |
| --- | --- |
| `POST /game/api/login` | `{ login, password }` → `{ data: { nickname } }`, cookie сессии и разрешения на вход |
| `POST /game/api/logout` | закрывает сессию, 204 |
| `GET /game/api/me` | `{ data: { nickname } }` или 401 |
| `GET /game/api/health` | `{ status: "ok" }` или 503 без подробностей |

Изменяющие запросы принимают только `application/json` с `Origin`, равным `GAME_PUBLIC_ORIGIN`. Адрес ребёнка берётся только из `X-Real-IP` и только от `127.0.0.1` (Nginx).

Локально без Nginx: `APP_ENV=development`, `GAME_PUBLIC_ORIGIN=http://localhost:3100` и `GAME_DEV_CLIENT_IP` — любой публичный адрес из документации, например `203.0.113.10`. CRM отвергает loopback-адреса, а в других окружениях эта настройка запрещена.
