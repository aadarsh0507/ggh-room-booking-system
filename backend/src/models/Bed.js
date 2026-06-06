const { query, getPool } = require('../config/database');

const createTable = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS \`Beds\` (
      \`id\`          INT         NOT NULL AUTO_INCREMENT PRIMARY KEY,
      \`bedNumber\`   VARCHAR(50) NOT NULL,
      \`roomId\`      INT         NOT NULL,
      \`status\`      ENUM('Available','Occupied','Cleaning','Maintenance') NOT NULL DEFAULT 'Available',
      \`patientId\`   INT         NULL,
      \`lastCleaned\` DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`createdAt\`   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\`   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (\`roomId\`)    REFERENCES \`Rooms\`(\`id\`)    ON DELETE CASCADE,
      FOREIGN KEY (\`patientId\`) REFERENCES \`Patients\`(\`id\`) ON DELETE SET NULL,
      INDEX idx_room_status (\`roomId\`, \`status\`)
    ) ENGINE=InnoDB
  `);
};

const findAll = async (filters = {}) => {
  let sql = `
    SELECT b.*, r.roomNumber, r.category, r.floor, r.wing
    FROM \`Beds\` b
    JOIN \`Rooms\` r ON r.id = b.roomId
    WHERE 1=1
  `;
  const params = [];
  if (filters.roomId) { sql += ' AND b.roomId = ?'; params.push(filters.roomId); }
  if (filters.status) { sql += ' AND b.status = ?'; params.push(filters.status); }
  return query(sql, params);
};

const findById = async (id) => {
  const rows = await query(
    `SELECT b.*, r.roomNumber, r.category, r.floor, r.wing
     FROM \`Beds\` b JOIN \`Rooms\` r ON r.id = b.roomId
     WHERE b.id = ?`, [id]
  );
  return rows[0] || null;
};

const create = async (data) => {
  const [result] = await getPool().execute(
    `INSERT INTO \`Beds\` (\`bedNumber\`,\`roomId\`,\`status\`,\`patientId\`,\`lastCleaned\`)
     VALUES (?,?,?,?,?)`,
    [data.bedNumber, data.roomId, data.status || 'Available',
     data.patientId || null, data.lastCleaned || new Date()]
  );
  return findById(result.insertId);
};

const insertMany = async (beds) => {
  for (const bed of beds) await create(bed);
};

const updateStatus = async (id, status, patientId = undefined) => {
  const fields = ['`status` = ?'];
  const params = [status];
  if (patientId !== undefined) { fields.push('`patientId` = ?'); params.push(patientId); }
  if (status === 'Cleaning')   { fields.push('`lastCleaned` = NOW()'); }
  params.push(id);
  await query(`UPDATE \`Beds\` SET ${fields.join(', ')} WHERE \`id\` = ?`, params);
  return findById(id);
};

const updateRoom = async (id, roomId) => {
  await query('UPDATE `Beds` SET `roomId` = ? WHERE `id` = ?', [roomId, id]);
  return findById(id);
};

const findOccupied = async (roomId) => {
  return query("SELECT * FROM `Beds` WHERE `roomId` = ? AND `status` = 'Occupied'", [roomId]);
};

const deleteByRoom = async (roomId) => {
  await query('DELETE FROM `Beds` WHERE `roomId` = ?', [roomId]);
};

module.exports = { createTable, findAll, findById, create, insertMany, updateStatus, updateRoom, findOccupied, deleteByRoom };
