// Runs a local PostgreSQL for development, no system install needed.
// Data lives in backend/.pgdata. Matches the DATABASE_URL in .env.example.
const path = require('path');
const fs = require('fs');

async function main() {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const databaseDir = path.join(__dirname, '..', '.pgdata');
  const port = Number(process.env.PGPORT) || 5432;

  const pg = new EmbeddedPostgres({
    databaseDir, user: 'postgres', password: 'postgres', port, persistent: true,
    // Windows would otherwise pick a legacy code page that can't store all model output
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    onLog: () => {},
  });

  if (!fs.existsSync(path.join(databaseDir, 'PG_VERSION'))) await pg.initialise();
  await pg.start();
  try { await pg.createDatabase('driftlens'); } catch (e) { /* already exists */ }

  console.log(`PostgreSQL ready: postgresql://postgres:postgres@localhost:${port}/driftlens`);
  console.log('Leave this window open. Press Ctrl+C to stop.');

  const stop = async () => { await pg.stop(); process.exit(0); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch(err => { console.error(err); process.exit(1); });
