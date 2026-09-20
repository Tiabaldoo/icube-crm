const allowedEnvironments = new Set(['development', 'test', 'production']);

export function assertDatabaseEnvironment(appEnv, databaseName) {
  if (!allowedEnvironments.has(appEnv)) throw new Error(`Недопустимый APP_ENV: ${appEnv}`);
  const expectedDatabase = appEnv === 'production' ? 'icube_prod' : appEnv === 'test' ? 'icube_test' : null;
  if (expectedDatabase && databaseName !== expectedDatabase) {
    throw new Error(`${appEnv} должен использовать базу ${expectedDatabase}, получено ${databaseName}`);
  }
  if (appEnv === 'development' && (databaseName === 'icube_prod' || databaseName === 'icube_test')) {
    throw new Error(`${databaseName} нельзя использовать при APP_ENV=development`);
  }
}

function required(name, env = process.env) {
  const value = env[name];
  if (!value) throw new Error(`Не задана переменная окружения ${name}`);
  return value;
}

function positiveNumber(name, value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(`${name} должен быть положительным числом`);
  return number;
}

export function loadConfig(env = process.env) {
  const appEnv = env.APP_ENV ?? 'development';
  const database = {
    host: required('DB_HOST', env),
    port: Number(env.DB_PORT ?? 3306),
    database: required('DB_NAME', env),
    user: required('DB_USER', env),
    password: required('DB_PASSWORD', env),
    connectionLimit: Number(env.DB_CONNECTION_LIMIT ?? 10),
  };
  assertDatabaseEnvironment(appEnv, database.database);
  if (appEnv === 'production' && database.password === 'replace_me') {
    throw new Error('Production DB_PASSWORD не может быть placeholder');
  }
  return {
    appEnv,
    port: Number(env.PORT ?? 3000),
    trustProxy: Number(env.TRUST_PROXY ?? 1),
    photos: {
      storageDir: env.PHOTO_STORAGE_DIR,
      retentionDays: positiveNumber('PHOTO_RETENTION_DAYS', env.PHOTO_RETENTION_DAYS ?? 30),
      maxUploadBytes: positiveNumber('PHOTO_MAX_UPLOAD_MB', env.PHOTO_MAX_UPLOAD_MB ?? 5) * 1024 * 1024,
    },
    parent: {
      timeZone: env.APP_TIME_ZONE ?? 'Asia/Sakhalin',
      maxUrl: env.PARENT_MAX_URL ?? null,
      phone: env.PARENT_CONTACT_PHONE ?? null,
      paymentQrUrl: env.PARENT_PAYMENT_QR_URL ?? null,
    },
    database,
  };
}
