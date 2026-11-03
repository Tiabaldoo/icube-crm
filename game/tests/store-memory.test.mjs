import { test } from 'node:test';
import { createMemoryStore } from '../server/store-memory.mjs';
import { storeContract } from './store-contract.mjs';

storeContract(test, () => createMemoryStore());
