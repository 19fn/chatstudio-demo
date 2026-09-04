const fs = require('fs/promises');
const path = require('path');
const { Pool } = require('pg');

function createDatabase(databaseUrl) {
  if (!databaseUrl) return null;
  return new Pool({ connectionString: databaseUrl });
}

async function migrate(database) {
  if (!database) return;
  const directory = path.join(__dirname, '..', 'migrations');
  const files = (await fs.readdir(directory)).filter((file) => file.endsWith('.sql')).sort();
  for (const file of files) {
    await database.query(await fs.readFile(path.join(directory, file), 'utf8'));
  }
}

async function databaseReady(database) {
  if (!database) return false;
  try {
    await database.query('SELECT 1');
    return true;
  } catch (_error) {
    return false;
  }
}

module.exports = { createDatabase, databaseReady, migrate };