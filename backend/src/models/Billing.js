const { query, getPool } = require('../config/database');

const createTable = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS \`Billing\` (
      \`id\`               INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
      \`admissionId\`      INT           NOT NULL,
      \`patientId\`        INT           NOT NULL,
      \`roomCharges\`      JSON          NULL,
      \`bedCharges\`       JSON          NULL,
      \`icuCharges\`       JSON          NULL,
      \`transferCharges\`  JSON          NULL,
      \`totalAmount\`      DECIMAL(10,2) NOT NULL DEFAULT 0,
      \`paidAmount\`       DECIMAL(10,2) NOT NULL DEFAULT 0,
      \`insuranceCovered\` DECIMAL(10,2) NOT NULL DEFAULT 0,
      \`status\`           ENUM('Pending','Partially Paid','Paid','Cancelled') NOT NULL DEFAULT 'Pending',
      \`syncedToHIS\`      TINYINT(1)    NOT NULL DEFAULT 0,
      \`createdAt\`        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\`        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (\`admissionId\`) REFERENCES \`Admissions\`(\`id\`),
      FOREIGN KEY (\`patientId\`)   REFERENCES \`Patients\`(\`id\`),
      INDEX idx_admission (\`admissionId\`),
      INDEX idx_status (\`status\`)
    ) ENGINE=InnoDB
  `);
};

const _parse = (row) => {
  if (!row) return null;
  for (const col of ['roomCharges', 'bedCharges', 'icuCharges', 'transferCharges']) {
    if (typeof row[col] === 'string') row[col] = JSON.parse(row[col]);
    if (!row[col]) row[col] = [];
  }
  return row;
};

const findByAdmission = async (admissionId) => {
  const rows = await query('SELECT * FROM `Billing` WHERE `admissionId` = ?', [admissionId]);
  return _parse(rows[0]) || null;
};

const findById = async (id) => {
  const rows = await query('SELECT * FROM `Billing` WHERE `id` = ?', [id]);
  return _parse(rows[0]) || null;
};

const findByIdWithPatient = async (id) => {
  const rows = await query(
    `SELECT b.*, p.patientId AS hisPatientId, p.name AS patientName
     FROM \`Billing\` b
     JOIN \`Patients\` p ON p.id = b.patientId
     WHERE b.id = ?`,
    [id]
  );
  return _parse(rows[0]) || null;
};

const create = async (data) => {
  const [result] = await getPool().execute(
    'INSERT INTO `Billing` (`admissionId`,`patientId`,`totalAmount`) VALUES (?,?,?)',
    [data.admissionId, data.patientId, data.totalAmount || 0]
  );
  return findById(result.insertId);
};

const save = async (billing) => {
  await query(
    `UPDATE \`Billing\` SET
       \`roomCharges\`     = ?,
       \`bedCharges\`      = ?,
       \`icuCharges\`      = ?,
       \`transferCharges\` = ?,
       \`totalAmount\`     = ?,
       \`paidAmount\`      = ?,
       \`status\`          = ?,
       \`syncedToHIS\`     = ?
     WHERE \`id\` = ?`,
    [
      JSON.stringify(billing.roomCharges    || []),
      JSON.stringify(billing.bedCharges     || []),
      JSON.stringify(billing.icuCharges     || []),
      JSON.stringify(billing.transferCharges|| []),
      billing.totalAmount,
      billing.paidAmount,
      billing.status,
      billing.syncedToHIS ? 1 : 0,
      billing.id,
    ]
  );
  return findById(billing.id);
};

module.exports = { createTable, findByAdmission, findById, findByIdWithPatient, create, save };
