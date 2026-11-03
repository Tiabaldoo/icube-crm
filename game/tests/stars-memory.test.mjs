import { test } from 'node:test';
import { createMemoryStore } from '../server/store-memory.mjs';
import { starsContract } from './stars-contract.mjs';

starsContract(test, () => createMemoryStore());

// Как в MySQL: все сценарии пишут в одно хранилище. Так уникальность ключей журнала на всю таблицу
// проверяется и без базы — раньше отдельное хранилище на сценарий скрывало столкновения ключей.
const shared = createMemoryStore();
starsContract(test, () => shared, { prefix: 1_000_000 });
