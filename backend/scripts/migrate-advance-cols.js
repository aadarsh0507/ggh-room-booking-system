require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
  const pool = mysql.createPool({
    host: process.env.DB_HOST, port: parseInt(process.env.DB_PORT, 10) || 3306,
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  const [existing] = await pool.execute('DESCRIBE Prebookings');
  const cols = new Set(existing.map(r => r.Field));

  const addCols = [
    { col: 'advanceCollected', sql: "ALTER TABLE `Prebookings` ADD COLUMN `advanceCollected` TINYINT(1) NOT NULL DEFAULT 0" },
    { col: 'advanceAmount',    sql: "ALTER TABLE `Prebookings` ADD COLUMN `advanceAmount` DECIMAL(10,2) NULL" },
  ];

  for (const { col, sql } of addCols) {
    if (cols.has(col)) { console.log('SKIP (exists):', col); continue; }
    await pool.execute(sql);
    console.log('OK: added column', col);
  }

  await pool.end();
})();
