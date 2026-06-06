const { query, getPool } = require('../config/database');

const createTable = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS \`Patients\` (
      \`id\`               INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
      \`uhid\`             VARCHAR(100) NOT NULL UNIQUE,
      \`patientId\`        VARCHAR(100) NOT NULL,
      \`name\`             VARCHAR(200) NOT NULL,
      \`gender\`           ENUM('Male','Female','Other') NOT NULL,
      \`dob\`              DATE         NOT NULL,
      \`doctor\`           VARCHAR(200) NOT NULL,
      \`department\`       VARCHAR(200) NOT NULL,
      \`insurance\`        VARCHAR(200) NULL,
      \`contact\`          VARCHAR(50)  NULL,
      \`emergencyContact\` VARCHAR(50)  NULL,
      \`medicalHistory\`   TEXT         NULL,
      \`createdAt\`        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\`        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_uhid (\`uhid\`),
      INDEX idx_patientId (\`patientId\`)
    ) ENGINE=InnoDB
  `);
};

const findAll = async (filters = {}) => {
  let sql = 'SELECT * FROM `Patients` WHERE 1=1';
  const params = [];
  if (filters.name) { sql += ' AND `name` LIKE ?'; params.push(`%${filters.name}%`); }
  if (filters.uhid) { sql += ' AND `uhid` = ?';   params.push(filters.uhid); }
  sql += ' ORDER BY `name`';
  return query(sql, params);
};

const findById = async (id) => {
  const rows = await query('SELECT * FROM `Patients` WHERE `id` = ?', [id]);
  return rows[0] || null;
};

const findByUhid = async (uhid) => {
  const rows = await query('SELECT * FROM `Patients` WHERE `uhid` = ?', [uhid]);
  return rows[0] || null;
};

const create = async (data) => {
  const medicalHistory = Array.isArray(data.medicalHistory)
    ? data.medicalHistory.join(',') : (data.medicalHistory || null);
  const [result] = await getPool().execute(
    `INSERT INTO \`Patients\`
       (\`uhid\`,\`patientId\`,\`name\`,\`gender\`,\`dob\`,\`doctor\`,\`department\`,\`insurance\`,\`contact\`,\`emergencyContact\`,\`medicalHistory\`)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [data.uhid, data.patientId, data.name, data.gender, data.dob,
     data.doctor, data.department, data.insurance || null,
     data.contact || null, data.emergencyContact || null, medicalHistory]
  );
  return findById(result.insertId);
};

const update = async (id, data) => {
  const fields = [];
  const params = [];
  const cols = ['name','gender','doctor','department','insurance','contact','emergencyContact'];
  for (const col of cols) {
    if (data[col] !== undefined) { fields.push(`\`${col}\` = ?`); params.push(data[col]); }
  }
  if (data.medicalHistory !== undefined) {
    fields.push('`medicalHistory` = ?');
    params.push(Array.isArray(data.medicalHistory) ? data.medicalHistory.join(',') : data.medicalHistory);
  }
  if (fields.length === 0) return findById(id);
  params.push(id);
  await query(`UPDATE \`Patients\` SET ${fields.join(', ')} WHERE \`id\` = ?`, params);
  return findById(id);
};

const upsert = async (data) => {
  const existing = await findByUhid(data.uhid);
  if (existing) return update(existing.id, data);
  return create(data);
};

module.exports = { createTable, findAll, findById, findByUhid, create, update, upsert };
