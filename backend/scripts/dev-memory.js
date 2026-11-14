// npm run dev:memory: the API with the in-memory store, for working without
// Docker or Postgres. Everything is lost when it stops.
process.env.OPENPATH_STORE = 'memory';
process.env.CORS_ORIGINS ||= 'http://localhost:5173';
await import('../src/server.js');
