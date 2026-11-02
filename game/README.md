# game/ — «Остров чудиков»

Игра пока не подключена: здесь только структура папок. План — в [GAME_PLAN.md](../GAME_PLAN.md), правила работы — в [CLAUDE.md](../CLAUDE.md).

| Папка | Что будет | Этап |
| --- | --- | --- |
| `server/` | игровой API (Express), сессии, звёзды, острова | 3–4 |
| `client/` | страница игры | 5 |
| `migrations/` | миграции только для `icube_game_*` | 3 |
| `tests/` | тесты игры | 3 |

Границы проверяют `tests/game-isolation.test.mjs` и `tests/game-child-access.test.mjs` в обычном `npm test`.

На этапе 3 нужно:

- добавить `game` в `roots` в `scripts/check-syntax.mjs`: сейчас проверка синтаксиса эту папку не обходит;
- заменить `test.todo` про раннер миграций в `tests/game-isolation.test.mjs` настоящим тестом.
