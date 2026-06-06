const { query } = require('../config/database');

const createTable = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS \`Rooms\` (
      \`id\`                INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
      \`roomNumber\`        VARCHAR(50)  NOT NULL UNIQUE,
      \`floor\`             VARCHAR(50)  NOT NULL,
      \`wing\`              VARCHAR(50)  NOT NULL,
      \`category\`          ENUM('General Ward','Semi Private','Private','Deluxe','ICU','NICU') NOT NULL,
      \`status\`            ENUM('Available','Occupied','Cleaning','Maintenance','Reserved') NOT NULL DEFAULT 'Available',
      \`bedCount\`          INT          NOT NULL CHECK (\`bedCount\` >= 1),
      \`price\`             DECIMAL(10,2) NOT NULL,
      \`amenities\`         TEXT         NULL,
      \`genderRestriction\` ENUM('Male','Female','None') NOT NULL DEFAULT 'None',
      \`isIsolation\`       TINYINT(1)   NOT NULL DEFAULT 0,
      \`branch\`            VARCHAR(100) NOT NULL DEFAULT 'Main',
      \`createdAt\`         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\`         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_status (\`status\`),
      INDEX idx_floor_wing_cat (\`floor\`, \`wing\`, \`category\`)
    ) ENGINE=InnoDB
  `);
};

const findAll = async (filters = {}) => {
  let sql = 'SELECT * FROM `Rooms` WHERE 1=1';
  const params = [];
  if (filters.status)   { sql += ' AND `status` = ?';   params.push(filters.status); }
  if (filters.category) { sql += ' AND `category` = ?'; params.push(filters.category); }
  if (filters.branch)   { sql += ' AND `branch` = ?';   params.push(filters.branch); }
  sql += ' ORDER BY `floor`, `roomNumber`';
  return query(sql, params);
};

const findById = async (id) => {
  const rows = await query('SELECT * FROM `Rooms` WHERE `id` = ?', [id]);
  return rows[0] || null;
};

const create = async (data) => {
  const amenities = Array.isArray(data.amenities) ? data.amenities.join(',') : (data.amenities || null);
  const [result] = await require('../config/database').getPool().execute(
    `INSERT INTO \`Rooms\` (\`roomNumber\`,\`floor\`,\`wing\`,\`category\`,\`status\`,\`bedCount\`,\`price\`,\`amenities\`,\`genderRestriction\`,\`isIsolation\`,\`branch\`)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [data.roomNumber, data.floor, data.wing, data.category, data.status || 'Available',
     data.bedCount, data.price, amenities, data.genderRestriction || 'None',
     data.isIsolation ? 1 : 0, data.branch || 'Main']
  );
  return findById(result.insertId);
};

const update = async (id, data) => {
  const fields = [];
  const params = [];
  const mapping = { status: data.status, price: data.price, genderRestriction: data.genderRestriction };
  for (const [col, val] of Object.entries(mapping)) {
    if (val !== undefined) { fields.push(`\`${col}\` = ?`); params.push(val); }
  }
  if (data.amenities !== undefined) {
    fields.push('`amenities` = ?');
    params.push(Array.isArray(data.amenities) ? data.amenities.join(',') : data.amenities);
  }
  if (data.isIsolation !== undefined) {
    fields.push('`isIsolation` = ?');
    params.push(data.isIsolation ? 1 : 0);
  }
  if (fields.length === 0) return findById(id);
  params.push(id);
  await query(`UPDATE \`Rooms\` SET ${fields.join(', ')} WHERE \`id\` = ?`, params);
  return findById(id);
};

const remove = async (id) => {
  await query('DELETE FROM `Rooms` WHERE `id` = ?', [id]);
};

const getAvailability = async () => {
  return query(`
    SELECT r.*,
           COUNT(b.id)                                        AS totalBeds,
           SUM(b.status = 'Available')                        AS availableBeds
    FROM \`Rooms\` r
    LEFT JOIN \`Beds\` b ON b.roomId = r.id
    GROUP BY r.id
    ORDER BY r.floor, r.roomNumber
  `);
};

module.exports = { createTable, findAll, findById, create, update, remove, getAvailability };
