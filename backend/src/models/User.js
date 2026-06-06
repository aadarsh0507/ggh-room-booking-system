const { query, getPool } = require('../config/database');
const bcrypt = require('bcryptjs');

const createTable = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS \`Users\` (
      \`id\`        INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
      \`username\`  VARCHAR(100) NOT NULL UNIQUE,
      \`email\`     VARCHAR(200) NOT NULL UNIQUE,
      \`password\`  VARCHAR(200) NOT NULL,
      \`role\`      ENUM('Admin','Receptionist','Nurse','Billing','Doctor') NOT NULL,
      \`branch\`    VARCHAR(100) NOT NULL DEFAULT 'Main',
      \`isActive\`  TINYINT(1)   NOT NULL DEFAULT 1,
      \`lastLogin\` DATETIME     NULL,
      \`createdAt\` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_email (\`email\`),
      INDEX idx_role (\`role\`)
    ) ENGINE=InnoDB
  `);
};

const findById = async (id) => {
  const rows = await query(
    'SELECT `id`,`username`,`email`,`role`,`branch`,`isActive`,`lastLogin`,`createdAt`,`updatedAt` FROM `Users` WHERE `id` = ?',
    [id]
  );
  return rows[0] || null;
};

const findByEmail = async (email, includePassword = false) => {
  const cols = includePassword ? '*' : '`id`,`username`,`email`,`role`,`branch`,`isActive`,`lastLogin`,`createdAt`,`updatedAt`';
  const rows = await query(`SELECT ${cols} FROM \`Users\` WHERE \`email\` = ?`, [email]);
  return rows[0] || null;
};

const findByUsername = async (username, includePassword = false) => {
  const cols = includePassword ? '*' : '`id`,`username`,`email`,`role`,`branch`,`isActive`,`lastLogin`,`createdAt`,`updatedAt`';
  const rows = await query(`SELECT ${cols} FROM \`Users\` WHERE \`username\` = ?`, [username]);
  return rows[0] || null;
};

const create = async (data) => {
  const hashed = await bcrypt.hash(data.password, 12);
  const [result] = await getPool().execute(
    'INSERT INTO `Users` (`username`,`email`,`password`,`role`,`branch`) VALUES (?,?,?,?,?)',
    [data.username, data.email, hashed, data.role, data.branch || 'Main']
  );
  return findById(result.insertId);
};

const updateLastLogin = async (id) => {
  await query('UPDATE `Users` SET `lastLogin` = NOW() WHERE `id` = ?', [id]);
};

const comparePassword = async (candidatePassword, hashedPassword) => {
  return bcrypt.compare(candidatePassword, hashedPassword);
};

module.exports = { createTable, findById, findByEmail, findByUsername, create, updateLastLogin, comparePassword };
