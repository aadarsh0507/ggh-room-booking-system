require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  const [existing] = await pool.execute('DESCRIBE Prebookings');
  const existingCols = new Set(existing.map(r => r.Field));

  const addCols = [
    { col: 'priority',         sql: "ALTER TABLE `Prebookings` ADD COLUMN `priority` ENUM('P1-Emergency','P2-Urgent','P3-Semi-Urgent','P4-Routine') NOT NULL DEFAULT 'P4-Routine'" },
    { col: 'priorityCategory', sql: "ALTER TABLE `Prebookings` ADD COLUMN `priorityCategory` ENUM('General','Emergency','Labour','Senior Citizen','Pediatric','Differently Abled') NOT NULL DEFAULT 'General'" },
    { col: 'admissionReason',  sql: "ALTER TABLE `Prebookings` ADD COLUMN `admissionReason` VARCHAR(300) NULL" },
    { col: 'escalatedAt',      sql: "ALTER TABLE `Prebookings` ADD COLUMN `escalatedAt` DATETIME NULL" },
  ];

  for (const { col, sql } of addCols) {
    if (existingCols.has(col)) { console.log('SKIP: already exists:', col); continue; }
    try {
      await pool.execute(sql);
      console.log('OK: added column', col);
    } catch (e) {
      console.error('FAIL:', col, e.message);
    }
  }

  const [rows] = await pool.execute('DESCRIBE Prebookings');
  console.log('Prebookings columns:', rows.map(r => r.Field).join(', '));
  await pool.end();
})();
