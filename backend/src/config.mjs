const allowedEnvironments = new Set(['development', 'test', 'production']);

function required(name, env = process.env) {
  const value = env[name];
  if (!value) throw new Error(`Не задана переменная окружения ${name}`);
  return value;
}

export function loadConfig(env = process.env) {
  const appEnv = env.APP_ENV ?? 'development';
  if (!allowedEnvironments.has(appEnv)) throw new Error(`Недопустимый APP_ENV: ${appEnv}`);
  const database = {
    host: required('DB_HOST', env),
    port: Number(env.DB_PORT ?? 3306),
    database: required('DB_NAME', env),
    user: required('DB_USER', env),
    password: required('DB_PASSWORD', env),
    connectionLimit: Number(env.DB_CONNECTION_LIMIT ?? 10),
  };
  const expectedDatabase = appEnv === 'production' ? 'icube_prod' : appEnv === 'test' ? 'icube_test' : null;
  if (expectedDatabase && database.database !== expectedDatabase) {
    throw new Error(`${appEnv} должен использовать базу ${expectedDatabase}, получено ${database.database}`);
  }
  const accessTokenSecret = required('AUTH_ACCESS_TOKEN_SECRET', env);
  if (accessTokenSecret.length < 32) throw new Error('AUTH_ACCESS_TOKEN_SECRET должен быть не короче 32 символов');
  return {
    appEnv,
    port: Number(env.PORT ?? 3000),
    trustProxy: Number(env.TRUST_PROXY ?? 1),
    auth: {
      accessTokenSecret,
      accessTokenTtlSeconds: Number(env.AUTH_ACCESS_TOKEN_TTL_SECONDS ?? 900),
    },
    database,
  };
}
