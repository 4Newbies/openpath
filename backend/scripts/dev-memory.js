// npm run dev:memory: the API with the in-memory store, for working without
// Docker or Postgres. Everything is lost when it stops.
process.env.OPENPATH_STORE = 'memory';
// Both spellings of this machine: a page opened on 127.0.0.1 is another origin.
process.env.CORS_ORIGINS ||= 'http://localhost:5173,http://127.0.0.1:5173';
await import('../src/server.js');
