import { loadConfig } from '../backend/src/config.mjs';
import { createPool } from '../backend/src/db.mjs';
import { createLessonPhotoService } from '../backend/src/lesson-photos.mjs';

const config = loadConfig();
const pool = createPool(config.database);
try {
  const photos = createLessonPhotoService(pool, config.photos);
  const result = await photos.cleanupExpired();
  console.log(`Фотографии: выбрано ${result.selected}, удалено ${result.purged}, ошибок ${result.failed.length}`);
  if (result.failed.length) {
    for (const failure of result.failed) console.error(`photo ${failure.id}: ${failure.message}`);
    process.exitCode = 1;
  }
} finally {
  await pool.end();
}
