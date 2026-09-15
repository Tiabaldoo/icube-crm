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
    database,
  };
}
