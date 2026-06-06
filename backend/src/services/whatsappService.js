const https = require('https');
const { query } = require('../config/database');

const LICENSE  = process.env.TENDIGIT_LICENSE;
const APIKEY   = process.env.TENDIGIT_APIKEY;
const TEMPLATE = process.env.TENDIGIT_TEMPLATE || 'Patient_room_booking_confirmation';
const BASE     = 'https://login.tendigit.in/api/sendtemplate.php';

// Ensure WhatsappLogs table exists — called lazily on first use
let tableReady = false;
const ensureTable = async () => {
  if (tableReady) return;
  await query(`
    CREATE TABLE IF NOT EXISTS \`WhatsappLogs\` (
      \`id\`            INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
      \`prebookingId\`  INT          NULL,
      \`phone\`         VARCHAR(20)  NOT NULL,
      \`patientName\`   VARCHAR(200) NOT NULL,
      \`bedNo\`         VARCHAR(50)  NOT NULL,
      \`bookedDate\`    DATE         NOT NULL,
      \`message\`       TEXT         NOT NULL,
      \`status\`        ENUM('Sent','Failed') NOT NULL DEFAULT 'Sent',
      \`errorMsg\`      VARCHAR(500) NULL,
      \`sentAt\`        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB
  `);
  tableReady = true;
};

// Format phone: strip non-digits, ensure 91 prefix
const formatPhone = (raw) => {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return null;
  return digits.startsWith('91') ? digits : `91${digits}`;
};

// Send a GET request to Ten Digit API
const sendGet = (url) => new Promise((resolve, reject) => {
  https.get(url, (res) => {
    let data = '';
    res.on('data', chunk => { data += chunk; });
    res.on('end', () => resolve({ status: res.statusCode, body: data }));
  }).on('error', reject);
});

// Send booking confirmation using WhatsApp template
// Template: Patient_room_booking_confirmation (updated)
//   {{1}} = Patient Name (Dear ...)
//   {{2}} = Booking ID  (HSP2026-XXXX)
//   {{3}} = Admission Date (DD-MM-YYYY)
//   {{4}} = Notes / special requirements
//   {{5}} = Patient Name (closing wish)
const sendBookingConfirmation = async ({ prebookingId, phone, patientName, bedNo, roomType, bookedDate, priority, advanceCollected, advanceAmount, notes }) => {
  await ensureTable();
  const formatted  = formatPhone(phone);
  const bookingRef = prebookingId ? `HSP${new Date().getFullYear()}-${String(prebookingId).padStart(4, '0')}` : 'N/A';
  const dateStr    = bookedDate
    ? String(bookedDate).slice(0, 10).split('-').reverse().join('-') // YYYY-MM-DD → DD-MM-YYYY
    : '';
  const notesVal   = (notes || '').trim() || 'N/A';
  const advNote    = advanceCollected ? ` | Advance: ₹${advanceAmount || 0} collected (verify in HIS)` : '';

  // Param order: {{1}},{{2}},{{3}},{{4}},{{5}}
  const param   = [patientName, bookingRef, dateStr, notesVal, patientName].join(',');
  const message = `Patient: ${patientName} | Booking: ${bookingRef} | ${dateStr} | Notes: ${notesVal}${advNote}`;

  let status   = 'Sent';
  let errorMsg = null;

  if (!formatted) {
    status   = 'Failed';
    errorMsg = 'Invalid or missing phone number';
  } else if (!LICENSE || !APIKEY) {
    status   = 'Failed';
    errorMsg = 'WhatsApp API credentials not configured';
  } else {
    try {
      const url = `${BASE}?LicenseNumber=${encodeURIComponent(LICENSE)}&APIKey=${encodeURIComponent(APIKEY)}&Contact=${formatted}&Template=${encodeURIComponent(TEMPLATE)}&Param=${encodeURIComponent(param)}`;
      const res = await sendGet(url);
      if (res.status !== 200 || /error|invalid|fail/i.test(res.body)) {
        status   = 'Failed';
        errorMsg = `API: ${res.body.slice(0, 200)}`;
      }
    } catch (err) {
      status   = 'Failed';
      errorMsg = err.message;
    }
  }

  await query(
    `INSERT INTO \`WhatsappLogs\`
       (\`prebookingId\`,\`phone\`,\`patientName\`,\`bedNo\`,\`bookedDate\`,\`message\`,\`status\`,\`errorMsg\`)
     VALUES (?,?,?,?,?,?,?,?)`,
    [prebookingId || null, formatted || phone, patientName, bedNo, bookedDate, message, status, errorMsg]
  );

  return { status, errorMsg };
};

// GET /api/prebooking/whatsapp-logs — list logs with optional filters
const getLogs = async ({ fromDate, toDate, status, search, limit = 100, offset = 0 }) => {
  await ensureTable();

  let where = 'WHERE 1=1';
  const filterParams = [];

  if (fromDate) { where += ' AND DATE(`sentAt`) >= ?'; filterParams.push(fromDate); }
  if (toDate)   { where += ' AND DATE(`sentAt`) <= ?'; filterParams.push(toDate); }
  if (status)   { where += ' AND `status` = ?';        filterParams.push(status); }
  if (search)   {
    where += ' AND (`patientName` LIKE ? OR `phone` LIKE ? OR `bedNo` LIKE ?)';
    const s = `%${search}%`;
    filterParams.push(s, s, s);
  }

  const lim = Math.max(1, parseInt(limit, 10) || 15);
  const off = Math.max(0, parseInt(offset, 10) || 0);
  const rows = await query(
    `SELECT * FROM \`WhatsappLogs\` ${where} ORDER BY \`sentAt\` DESC LIMIT ${lim} OFFSET ${off}`,
    filterParams
  );

  const [countRow] = await query(
    `SELECT COUNT(*) AS total FROM \`WhatsappLogs\` ${where}`,
    filterParams
  );

  return { logs: rows, total: countRow.total };
};

module.exports = { sendBookingConfirmation, getLogs };
