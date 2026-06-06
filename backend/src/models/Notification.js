const { query, getPool } = require('../config/database');

const createTable = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS \`Notifications\` (
      \`id\`            INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
      \`recipientId\`   INT          NOT NULL,
      \`type\`          ENUM('Admission','Transfer','Discharge','Cleaning','Maintenance') NOT NULL,
      \`message\`       VARCHAR(500) NOT NULL,
      \`isRead\`        TINYINT(1)   NOT NULL DEFAULT 0,
      \`relatedEntity\` VARCHAR(100) NULL,
      \`relatedId\`     INT          NULL,
      \`createdAt\`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (\`recipientId\`) REFERENCES \`Users\`(\`id\`),
      INDEX idx_recipient_read (\`recipientId\`, \`isRead\`)
    ) ENGINE=InnoDB
  `);
};

const create = async (data) => {
  const [result] = await getPool().execute(
    `INSERT INTO \`Notifications\` (\`recipientId\`,\`type\`,\`message\`,\`relatedEntity\`,\`relatedId\`)
     VALUES (?,?,?,?,?)`,
    [data.recipientId, data.type, data.message, data.relatedEntity || null, data.relatedId || null]
  );
  const rows = await query('SELECT * FROM `Notifications` WHERE `id` = ?', [result.insertId]);
  return rows[0];
};

const findUnread = async (recipientId) => {
  return query(
    'SELECT * FROM `Notifications` WHERE `recipientId` = ? AND `isRead` = 0 ORDER BY `createdAt` DESC',
    [recipientId]
  );
};

const markRead = async (id) => {
  await query('UPDATE `Notifications` SET `isRead` = 1 WHERE `id` = ?', [id]);
};

module.exports = { createTable, create, findUnread, markRead };
