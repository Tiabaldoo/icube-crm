import { parentPort } from 'node:worker_threads';
import bcrypt from 'bcryptjs';

parentPort.on('message', async ({ id, password, hash }) => {
  try { parentPort.postMessage({ id, matches: await bcrypt.compare(password, hash) }); }
  catch { parentPort.postMessage({ id, failed: true }); }
});
