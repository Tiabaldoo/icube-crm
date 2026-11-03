import { test } from 'node:test';
import { createMemoryStore } from '../server/store-memory.mjs';
import { starsContract } from './stars-contract.mjs';

starsContract(test, () => createMemoryStore());
