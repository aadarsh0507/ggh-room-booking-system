const { query, getPool } = require('../config/database');

const createTable = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS \`AuditLogs\` (
      \`id\`        INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
      \`userId\`    INT          NOT NULL,
      \`action\`    VARCHAR(200) NOT NULL,
      \`entity\`    VARCHAR(100) NOT NULL,
      \`entityId\`  INT          NULL,
      \`oldValues\` JSON         NULL,
      \`newValues\` JSON         NULL,
      \`ipAddress\` VARCHAR(50)  NULL,
      \`userAgent\` VARCHAR(500) NULL,
      \`timestamp\` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (\`userId\`) REFERENCES \`Users\`(\`id\`),
      INDEX idx_user_ts (\`userId\`, \`timestamp\`),
      INDEX idx_entity (\`entity\`, \`entityId\`)
    ) ENGINE=InnoDB
  `);
};

const create = async (data) => {
  await getPool().execute(
    `INSERT INTO \`AuditLogs\`
       (\`userId\`,\`action\`,\`entity\`,\`entityId\`,\`oldValues\`,\`newValues\`,\`ipAddress\`,\`userAgent\`)
     VALUES (?,?,?,?,?,?,?,?)`,
    [
      data.userId,
      data.action,
      data.entity,
      data.entityId || null,
      data.oldValues ? JSON.stringify(data.oldValues) : null,
      data.newValues ? JSON.stringify(data.newValues) : null,
      data.ipAddress || null,
      data.userAgent || null,
    ]
  );
};

module.exports = { createTable, create };
