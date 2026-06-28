require('dotenv').config();
const mysql = require('mysql2/promise');

const ROOT_USER = process.env.MYSQL_ROOT_USER || 'root';
const ROOT_PASSWORD = process.env.MYSQL_ROOT_PASSWORD || '';
const DB_NAME = process.env.MYSQL_DATABASE || 'aichat';
const DB_USER = process.env.MYSQL_USER || 'aichat';
const DB_PASSWORD = process.env.MYSQL_PASSWORD || 'aichat';
const HOST = process.env.MYSQL_HOST || '127.0.0.1';
const PORT = Number(process.env.MYSQL_PORT || 3306);
const SOCKET = process.env.MYSQL_SOCKET_PATH || '';

async function connectAsRoot() {
  const base = {
    user: ROOT_USER,
    password: ROOT_PASSWORD,
    multipleStatements: true
  };
  if (SOCKET) {
    return mysql.createConnection({ ...base, socketPath: SOCKET });
  }
  return mysql.createConnection({ ...base, host: HOST, port: PORT });
}

async function main() {
  if (!ROOT_PASSWORD && !SOCKET) {
    console.error('Set MYSQL_ROOT_PASSWORD (or MYSQL_SOCKET_PATH) then run again.');
    console.error('Example: MYSQL_ROOT_PASSWORD=secret MYSQL_PASSWORD=aichat node scripts/setup-canopy-db.js');
    process.exit(1);
  }

  const conn = await connectAsRoot();
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await conn.query(
    `CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASSWORD}'`
  );
  await conn.query(
    `CREATE USER IF NOT EXISTS '${DB_USER}'@'127.0.0.1' IDENTIFIED BY '${DB_PASSWORD}'`
  );
  await conn.query(`GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'localhost'`);
  await conn.query(`GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'127.0.0.1'`);
  await conn.query('FLUSH PRIVILEGES');
  await conn.end();

  console.log('Done.');
  console.log(`Database: ${DB_NAME}`);
  console.log(`User: ${DB_USER}`);
  console.log(`Add to .env: MYSQL_PASSWORD=${DB_PASSWORD}`);
}

main().catch((e) => {
  console.error('Setup failed:', e.message);
  process.exit(1);
});
