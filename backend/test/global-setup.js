// Runs once before the API tests. When TEST_DATABASE_URL is set, the tests
// empty the OpenPath tables, so this makes sure they can only ever touch a
// dedicated test database (name ending in "_test"), never the demo/dev one,
// and creates that database on the same server if it doesn't exist yet.
import pg from 'pg';

export default async function setup() {
  const raw = process.env.TEST_DATABASE_URL;
  if (!raw) return;

  const url = new URL(raw);
  const name = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!/^[a-zA-Z0-9_]+_test$/.test(name)) {
    throw new Error(
      `Refusing to run: TEST_DATABASE_URL points at database "${name}". The tests empty the tables, ` +
        'so the database name must end in "_test" (for example openpath_test).',
    );
  }
  if (process.env.DATABASE_URL) {
    const app = new URL(process.env.DATABASE_URL);
    if (app.host === url.host && app.pathname === url.pathname) {
      throw new Error('Refusing to run: TEST_DATABASE_URL is the same database as DATABASE_URL.');
    }
  }

  const admin = new URL(raw);
  admin.pathname = '/postgres';
  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (!rowCount) await client.query(`CREATE DATABASE "${name}"`); // name checked by the regex above
  } finally {
    await client.end();
  }
}
