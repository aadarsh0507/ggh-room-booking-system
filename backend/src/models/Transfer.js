const { query, getPool } = require('../config/database');

const createTable = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS \`Transfers\` (
      \`id\`           INT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
      \`admissionId\`  INT      NOT NULL,
      \`patientId\`    INT      NOT NULL,
      \`fromBedId\`    INT      NOT NULL,
      \`toBedId\`      INT      NOT NULL,
      \`fromRoomId\`   INT      NOT NULL,
      \`toRoomId\`     INT      NOT NULL,
      \`transferDate\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`reason\`       TEXT     NOT NULL,
      \`initiatedBy\`  INT      NOT NULL,
      \`approvedBy\`   INT      NULL,
      \`status\`       ENUM('Requested','Approved','Completed','Cancelled') NOT NULL DEFAULT 'Requested',
      \`notes\`        TEXT     NULL,
      \`createdAt\`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (\`admissionId\`) REFERENCES \`Admissions\`(\`id\`),
      FOREIGN KEY (\`patientId\`)   REFERENCES \`Patients\`(\`id\`),
      FOREIGN KEY (\`fromBedId\`)   REFERENCES \`Beds\`(\`id\`),
      FOREIGN KEY (\`toBedId\`)     REFERENCES \`Beds\`(\`id\`),
      FOREIGN KEY (\`fromRoomId\`)  REFERENCES \`Rooms\`(\`id\`),
      FOREIGN KEY (\`toRoomId\`)    REFERENCES \`Rooms\`(\`id\`),
      FOREIGN KEY (\`initiatedBy\`) REFERENCES \`Users\`(\`id\`),
      FOREIGN KEY (\`approvedBy\`)  REFERENCES \`Users\`(\`id\`),
      INDEX idx_admission_date (\`admissionId\`, \`transferDate\`)
    ) ENGINE=InnoDB
  `);
};

const findByAdmission = async (admissionId) => {
  return query(
    `SELECT t.*,
       fb.bedNumber AS fromBedNumber, tb.bedNumber AS toBedNumber,
       fr.roomNumber AS fromRoomNumber, tr.roomNumber AS toRoomNumber
     FROM \`Transfers\` t
     JOIN \`Beds\`  fb ON fb.id = t.fromBedId
     JOIN \`Beds\`  tb ON tb.id = t.toBedId
     JOIN \`Rooms\` fr ON fr.id = t.fromRoomId
     JOIN \`Rooms\` tr ON tr.id = t.toRoomId
     WHERE t.admissionId = ?
     ORDER BY t.transferDate DESC`,
    [admissionId]
  );
};

const create = async (data) => {
  const [result] = await getPool().execute(
    `INSERT INTO \`Transfers\`
       (\`admissionId\`,\`patientId\`,\`fromBedId\`,\`toBedId\`,\`fromRoomId\`,\`toRoomId\`,\`reason\`,\`initiatedBy\`,\`notes\`)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [data.admissionId, data.patientId, data.fromBedId, data.toBedId,
     data.fromRoomId, data.toRoomId, data.reason, data.initiatedBy, data.notes || null]
  );
  const rows = await query('SELECT * FROM `Transfers` WHERE `id` = ?', [result.insertId]);
  return rows[0];
};

const update = async (id, data) => {
  const fields = [];
  const params = [];
  if (data.status !== undefined)     { fields.push('`status` = ?');     params.push(data.status); }
  if (data.approvedBy !== undefined) { fields.push('`approvedBy` = ?'); params.push(data.approvedBy); }
  if (fields.length === 0) return null;
  params.push(id);
  await query(`UPDATE \`Transfers\` SET ${fields.join(', ')} WHERE \`id\` = ?`, params);
  const rows = await query('SELECT * FROM `Transfers` WHERE `id` = ?', [id]);
  return rows[0] || null;
};

module.exports = { createTable, findByAdmission, create, update };
