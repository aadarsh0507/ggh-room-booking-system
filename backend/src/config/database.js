const mysql    = require('mysql2/promise');
const oracledb = require('oracledb');

let pool;

// ── MySQL ────────────────────────────────────────────────────────────────────

const connectDB = async () => {
  try {
    pool = mysql.createPool({
      host:               process.env.DB_HOST     || 'localhost',
      port:               parseInt(process.env.DB_PORT, 10) || 3306,
      user:               process.env.DB_USER,
      password:           process.env.DB_PASSWORD,
      database:           process.env.DB_NAME,
      waitForConnections: true,
      connectionLimit:    10,
      queueLimit:         0,
      timezone:           process.env.DB_TIMEZONE || '+05:30', // IST — prevents DATE shifting on read/write
    });

    const conn = await pool.getConnection();
    console.log(`MySQL Connected: ${process.env.DB_HOST}:${process.env.DB_PORT || 3306}/${process.env.DB_NAME}`);
    conn.release();
  } catch (error) {
    console.error('MySQL connection error:', error.message);
    process.exit(1);
  }
};

const getPool = () => {
  if (!pool) throw new Error('Database not connected. Call connectDB() first.');
  return pool;
};

const query = async (sql, params = []) => {
  const [rows] = await getPool().execute(sql, params);
  return rows;
};

// ── Oracle (HIS) ─────────────────────────────────────────────────────────────

const connectHIS = async () => {
  try {
    await oracledb.createPool({
      user:          process.env.SQL_USER,
      password:      process.env.SQL_PASSWORD,
      connectString: process.env.SQL_HOST,   // e.g. 172.16.7.85:1521/dsoft
      poolMin:       2,
      poolMax:       10,
      poolIncrement: 1,
      poolAlias:     'his',
    });
    console.log(`Oracle HIS Connected: ${process.env.SQL_HOST} as '${process.env.SQL_USER}'`);
  } catch (error) {
    console.error('Oracle HIS connection error:', error.message);
    process.exit(1);
  }
};

// Runs a query against the Oracle HIS pool and returns rows as plain objects
const hisQuery = async (sql, params = {}) => {
  let conn;
  try {
    conn = await oracledb.getConnection('his');
    const result = await conn.execute(sql, params, { outFormat: oracledb.OUT_FORMAT_OBJECT });
    return result.rows;
  } finally {
    if (conn) await conn.close();
  }
};

module.exports = { connectDB, connectHIS, getPool, query, hisQuery };
