const { query, getPool } = require('../config/database');

const createTable = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS \`Admissions\` (
      \`id\`                     INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
      \`patientId\`              INT          NOT NULL,
      \`bedId\`                  INT          NOT NULL,
      \`roomId\`                 INT          NOT NULL,
      \`admissionDate\`          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`estimatedDischargeDate\` DATETIME     NULL,
      \`actualDischargeDate\`    DATETIME     NULL,
      \`status\`                 ENUM('Admitted','Transferred','Discharged') NOT NULL DEFAULT 'Admitted',
      \`admissionType\`          ENUM('Emergency','Planned','Reservation')   NOT NULL DEFAULT 'Planned',
      \`notes\`                  TEXT         NULL,
      \`createdBy\`              INT          NOT NULL,
      \`createdAt\`              DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\`              DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (\`patientId\`) REFERENCES \`Patients\`(\`id\`),
      FOREIGN KEY (\`bedId\`)     REFERENCES \`Beds\`(\`id\`),
      FOREIGN KEY (\`roomId\`)    REFERENCES \`Rooms\`(\`id\`),
      FOREIGN KEY (\`createdBy\`) REFERENCES \`Users\`(\`id\`),
      INDEX idx_patient_status (\`patientId\`, \`status\`),
      INDEX idx_bed_date (\`bedId\`, \`admissionDate\`)
    ) ENGINE=InnoDB
  `);
};

const _joinSql = (where) => `
  SELECT a.*,
    p.uhid, p.name AS patientName, p.gender, p.doctor, p.department,
    b.bedNumber, b.status AS bedStatus,
    r.roomNumber, r.category, r.floor, r.wing
  FROM \`Admissions\` a
  JOIN \`Patients\` p ON p.id = a.patientId
  JOIN \`Beds\`     b ON b.id = a.bedId
  JOIN \`Rooms\`    r ON r.id = a.roomId
  ${where}
  ORDER BY a.admissionDate DESC
`;

const findAll = async (filters = {}) => {
  const conditions = ['1=1'];
  const params = [];
  if (filters.status)    { conditions.push('a.status = ?');    params.push(filters.status); }
  if (filters.patientId) { conditions.push('a.patientId = ?'); params.push(filters.patientId); }
  return query(_joinSql(`WHERE ${conditions.join(' AND ')}`), params);
};

const findById = async (id) => {
  const rows = await query(_joinSql('WHERE a.id = ?'), [id]);
  return rows[0] || null;
};

const create = async (data) => {
  const [result] = await getPool().execute(
    `INSERT INTO \`Admissions\`
       (\`patientId\`,\`bedId\`,\`roomId\`,\`admissionDate\`,\`estimatedDischargeDate\`,\`status\`,\`admissionType\`,\`notes\`,\`createdBy\`)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [data.patientId, data.bedId, data.roomId,
     data.admissionDate || new Date(),
     data.estimatedDischargeDate || null,
     data.status || 'Admitted',
     data.admissionType || 'Planned',
     data.notes || null,
     data.createdBy]
  );
  return findById(result.insertId);
};

const update = async (id, data) => {
  const fields = [];
  const params = [];
  if (data.status !== undefined)                { fields.push('`status` = ?');                params.push(data.status); }
  if (data.actualDischargeDate !== undefined)   { fields.push('`actualDischargeDate` = ?');   params.push(data.actualDischargeDate); }
  if (data.estimatedDischargeDate !== undefined){ fields.push('`estimatedDischargeDate` = ?');params.push(data.estimatedDischargeDate); }
  if (data.notes !== undefined)                 { fields.push('`notes` = ?');                 params.push(data.notes); }
  if (fields.length === 0) return findById(id);
  params.push(id);
  await query(`UPDATE \`Admissions\` SET ${fields.join(', ')} WHERE \`id\` = ?`, params);
  return findById(id);
};

module.exports = { createTable, findAll, findById, create, update };
