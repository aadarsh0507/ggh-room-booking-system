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

  // Step 1: Expand ENUM to include both old and new values so UPDATE doesn't truncate
  await pool.execute(
    "ALTER TABLE `Prebookings` MODIFY COLUMN `priority` ENUM('P1-Emergency','P2-Urgent','P3-Semi-Urgent','P4-Routine','Emergency','VIP','Regular') NOT NULL DEFAULT 'Regular'"
  );
  console.log('OK: ENUM expanded');

  // Step 2: Migrate old values to new ones
  const migrations = [
    "UPDATE `Prebookings` SET `priority`='Emergency' WHERE `priority`='P1-Emergency'",
    "UPDATE `Prebookings` SET `priority`='VIP'       WHERE `priority`='P2-Urgent'",
    "UPDATE `Prebookings` SET `priority`='Regular'   WHERE `priority` IN ('P3-Semi-Urgent','P4-Routine')",
  ];
  for (const sql of migrations) {
    const [r] = await pool.execute(sql);
    console.log(`OK (${r.affectedRows} rows): ${sql.split('WHERE')[1].trim()}`);
  }

  // Step 3: Lock down to new values only
  await pool.execute(
    "ALTER TABLE `Prebookings` MODIFY COLUMN `priority` ENUM('Emergency','VIP','Regular') NOT NULL DEFAULT 'Regular'"
  );
  console.log('OK: ENUM column finalized as Emergency / VIP / Regular');

  await pool.end();
})();
