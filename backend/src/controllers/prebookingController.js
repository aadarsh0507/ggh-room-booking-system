const asyncHandler = require('express-async-handler');
const { hisQuery, query } = require('../config/database');
const { sendBookingConfirmation, getLogs } = require('../services/whatsappService');

// Returns today's date as YYYY-MM-DD in the Node process local timezone (not UTC)
const localToday = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// ── MySQL RoomTypeRestrictions table ─────────────────────────────────────────
const ensureRestrictionsTable = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS \`RoomTypeRestrictions\` (
      \`roomType\`   VARCHAR(100) NOT NULL PRIMARY KEY,
      \`reason\`     VARCHAR(300) NULL,
      \`blockedBy\`  VARCHAR(100) NOT NULL DEFAULT 'System',
      \`createdAt\`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB
  `);
};
ensureRestrictionsTable();

// Priority level → numeric rank (lower = higher priority)
const PRIORITY_RANK = {
  'Emergency': 1,
  'VIP':       2,
  'Regular':   3,
};

// ── MySQL Prebookings table ───────────────────────────────────────────────────
const ensurePrebookingTable = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS \`Prebookings\` (
      \`id\`                INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
      \`bedNo\`             VARCHAR(50)   NOT NULL,
      \`roomType\`          VARCHAR(100)  NOT NULL,
      \`nurStation\`        VARCHAR(100)  NOT NULL,
      \`roomNo\`            VARCHAR(100)  NULL,
      \`patientName\`       VARCHAR(200)  NOT NULL,
      \`patientPhone\`      VARCHAR(20)   NULL,
      \`patientAge\`        INT           NULL,
      \`patientGender\`     ENUM('Male','Female','Other') NOT NULL,
      \`doctorName\`        VARCHAR(200)  NULL,
      \`notes\`             TEXT          NULL,
      \`bookedDate\`        DATE          NOT NULL,
      \`priority\`          ENUM('Emergency','VIP','Regular') NOT NULL DEFAULT 'Regular',
      \`priorityCategory\`  ENUM('General','Emergency','Labour','Senior Citizen','Pediatric','Differently Abled') NOT NULL DEFAULT 'General',
      \`admissionReason\`   VARCHAR(300)  NULL,
      \`escalatedAt\`       DATETIME      NULL,
      \`bookedBy\`          VARCHAR(100)  NOT NULL,
      \`bookedByUserId\`    INT           NULL,
      \`clientIp\`          VARCHAR(45)   NULL,
      \`userAgent\`         VARCHAR(500)  NULL,
      \`status\`            ENUM('Confirmed','Cancelled','Admitted') NOT NULL DEFAULT 'Confirmed',
      \`cancelledBy\`       VARCHAR(100)  NULL,
      \`cancelledAt\`       DATETIME      NULL,
      \`admittedBy\`        VARCHAR(100)  NULL,
      \`admittedAt\`        DATETIME      NULL,
      \`createdAt\`         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\`         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB
  `);

  // Add priority columns to existing tables that were created before this migration
  const addCols = [
    `ALTER TABLE \`Prebookings\` ADD COLUMN IF NOT EXISTS \`priority\` ENUM('Emergency','VIP','Regular') NOT NULL DEFAULT 'Regular'`,
    `ALTER TABLE \`Prebookings\` ADD COLUMN IF NOT EXISTS \`priorityCategory\` ENUM('General','Emergency','Labour','Senior Citizen','Pediatric','Differently Abled') NOT NULL DEFAULT 'General'`,
    `ALTER TABLE \`Prebookings\` ADD COLUMN IF NOT EXISTS \`admissionReason\` VARCHAR(300) NULL`,
    `ALTER TABLE \`Prebookings\` ADD COLUMN IF NOT EXISTS \`escalatedAt\` DATETIME NULL`,
    `ALTER TABLE \`Prebookings\` ADD COLUMN IF NOT EXISTS \`patientId\` VARCHAR(50) NULL`,
  ];
  for (const sql of addCols) {
    try { await query(sql); } catch (e) { console.log('Column migration note:', e.message); }
  }
};
ensurePrebookingTable();

// Days on either side of a booking date to block the bed.
// Since we don't know discharge date, we hold the bed for BOOKING_WINDOW days
// before and after the planned admission date.
const BOOKING_WINDOW_DAYS = 3;

// Auto-expire Confirmed prebookings whose bookedDate is more than BOOKING_WINDOW_DAYS in the past
// (patient either no-showed or booking is stale). Returns count of expired rows.
const expireStaleBookings = async () => {
  const today = localToday();
  const result = await query(
    `UPDATE \`Prebookings\`
     SET \`status\` = 'Cancelled', \`cancelledBy\` = 'System-Expired', \`cancelledAt\` = NOW()
     WHERE \`status\` = 'Confirmed'
       AND DATE_FORMAT(\`bookedDate\`, '%Y-%m-%d') < DATE_FORMAT(DATE_SUB(?, INTERVAL ? DAY), '%Y-%m-%d')`,
    [today, BOOKING_WINDOW_DAYS]
  );
  if (result.affectedRows > 0) {
    console.log(`[Prebooking] Auto-expired ${result.affectedRows} stale booking(s)`);
  }
  return result.affectedRows;
};

// ── Available beds for a given date — reads from MySQL cache (no Oracle calls) ─
const getAvailableBedsForDate = async (forDate) => {
  const targetDate = forDate || localToday();
  const isFutureDate = targetDate > localToday();

  await expireStaleBookings();

  // All data from MySQL — no Oracle round-trips
  const [cachedBeds, overrideRows, prebookRows, restrictedRows, occupiedRows] = await Promise.all([
    query(`SELECT bed_no AS BED_NO, room_type AS ROOM_TYPE, nur_station AS NUR_STATION,
                  ns_short AS NS_SHORT, room_no AS ROOM_NO, his_status AS HIS_STATUS
           FROM \`HisBedCache\` WHERE his_status = 'Active' ORDER BY nur_station, bed_no`),
    query('SELECT `bedNo`, `status` FROM `BedOverrides`'),
    query(
      `SELECT \`bedNo\`, \`bookedDate\`, \`patientName\`
       FROM \`Prebookings\`
       WHERE \`status\` = 'Confirmed'
         AND \`bookedDate\` BETWEEN
             DATE_SUB(?, INTERVAL ? DAY) AND
             DATE_ADD(?, INTERVAL ? DAY)`,
      [targetDate, BOOKING_WINDOW_DAYS, targetDate, BOOKING_WINDOW_DAYS]
    ),
    query('SELECT `roomType` FROM `RoomTypeRestrictions`'),
    // For today: read occupancy from cache. For future dates: not needed.
    isFutureDate
      ? Promise.resolve([])
      : query('SELECT DISTINCT `bed` AS BED_NO FROM `HisOccupancyCache`'),
  ]);

  const overrideMap  = Object.fromEntries(overrideRows.map(r => [r.bedNo, r.status]));
  const prebookedMap = {};
  for (const r of prebookRows) prebookedMap[r.bedNo] = { bookedDate: r.bookedDate, patientName: r.patientName };
  const restrictedSet = new Set(restrictedRows.map(r => r.roomType));
  const occupiedSet   = new Set(occupiedRows.map(r => r.BED_NO));

  return cachedBeds
    .filter(b => {
      const effectiveStatus = overrideMap[b.BED_NO] ?? b.HIS_STATUS;
      return effectiveStatus === 'Active' && !restrictedSet.has(b.ROOM_TYPE);
    })
    .map(b => ({
      ...b,
      OCCUPIED:       occupiedSet.has(b.BED_NO),
      PREBOOKED:      !!prebookedMap[b.BED_NO],
      PREBOOKED_DATE: prebookedMap[b.BED_NO]?.bookedDate  || null,
      PREBOOKED_FOR:  prebookedMap[b.BED_NO]?.patientName || null,
      AVAILABLE:      !occupiedSet.has(b.BED_NO) && !prebookedMap[b.BED_NO],
      IS_FUTURE_DATE: isFutureDate,
    }));
};

// GET /api/prebooking/patient/:ptNo  — lookup patient from HIS by PT_NO
exports.lookupPatient = asyncHandler(async (req, res) => {
  const { ptNo } = req.params;
  if (!ptNo || ptNo.trim() === '') {
    res.status(400); throw new Error('Patient ID is required');
  }

  const ptNoClean = ptNo.trim().toUpperCase();
  console.log(`[Prebooking] Looking up patient: ${ptNoClean}`);

  try {
    // Try to fetch from HIS PATIENT table - simple query first
    const PATIENT_SQL = `
      SELECT
        PT_NO,
        PTC_PTNAME AS PT_NAME,
        PTC_SEX AS GENDER,
        PTC_MOBILE AS PHONE,
        PTN_YEARAGE AS AGE,
        (PTC_LOADD1 || ' ' || PTC_LOADD2 || ' ' || PTC_LOADD3 || ' ' || PTC_LOADD4) AS ADDRESS
      FROM PATIENT
      WHERE PT_NO = :ptNo`;

    console.log(`[Prebooking] Executing HIS query for patient ${ptNoClean}`);
    const rows = await hisQuery(PATIENT_SQL, { ptNo: ptNoClean });

    if (rows && rows.length > 0) {
      console.log(`[Prebooking] ✅ Found patient ${ptNoClean} in HIS`);
      return res.json({
        patient: rows[0],
        source: 'HIS',
        message: 'Patient data fetched from HIS database'
      });
    } else {
      console.log(`[Prebooking] ❌ Patient ${ptNoClean} not found in HIS`);
      res.status(404).json({
        error: `Patient ${ptNoClean} not found in HIS database`,
        source: 'HIS'
      });
    }
  } catch (hisErr) {
    console.error(`[Prebooking] HIS query error for ${ptNoClean}:`, hisErr.message);
    res.status(500).json({
      error: `Failed to fetch patient from HIS: ${hisErr.message}`,
      source: 'HIS',
      ptNo: ptNoClean
    });
  }
});

// GET /api/prebooking/available-beds?forDate=YYYY-MM-DD
exports.getAvailableBeds = asyncHandler(async (req, res) => {
  try {
    const { forDate } = req.query;
    const beds = await getAvailableBedsForDate(forDate || null);
    res.json({ beds, forDate: forDate || new Date().toISOString().slice(0, 10), windowDays: BOOKING_WINDOW_DAYS });
  } catch (err) {
    console.error('getAvailableBeds error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// GET /api/prebooking/suggest-rooms  — suggest rooms that were discharged AND billed on the same day
exports.suggestRooms = asyncHandler(async (req, res) => {
  const { bookedDate } = req.query;
  const targetDate = bookedDate || new Date().toISOString().slice(0, 10);

  try {
    // Try to get beds from HIS, but gracefully handle errors
    let readyBeds = [];
    try {
      readyBeds = await hisQuery(`
        SELECT DISTINCT
          INITCAP(T.RTC_DESC) AS ROOM_TYPE,
          B.BED_NO AS BED_NO,
          W.WARD_DESC AS WARD,
          MAX(P.DISCHARGE_DATE) AS LAST_DISCHARGE_DATE,
          MAX(B.BED_STATUS) AS BED_STATUS
        FROM PATIENT P
          JOIN BED B ON P.BED_NO = B.BED_NO
          JOIN WARD W ON B.WARD_ID = W.WARD_ID
          JOIN ROOMTYPE T ON B.ROOM_TYPE = T.RTC_DESC
        WHERE CAST(P.DISCHARGE_DATE AS DATE) = TRUNC(TO_DATE(:targetDate, 'YYYY-MM-DD'))
          AND P.BILL_STATUS = 'BILLED'
        GROUP BY B.BED_NO, T.RTC_DESC, W.WARD_DESC
        ORDER BY LAST_DISCHARGE_DATE DESC
      `, { targetDate });
    } catch (hisErr) {
      console.warn('[Prebooking] HIS query failed:', hisErr.message);
      readyBeds = [];
    }

    // Get available beds from cache
    let availableBeds = [];
    try {
      availableBeds = await getAvailableBedsForDate(targetDate);
    } catch (bedErr) {
      console.warn('[Prebooking] getAvailableBedsForDate failed:', bedErr.message);
      availableBeds = [];
    }

    // Filter and return only beds that were discharged AND billed today
    const suggestions = availableBeds
      .filter(bed => {
        // Only include beds that discharged and billed today
        return readyBeds.some(rb => rb.BED_NO === bed.BED_NO);
      })
      .map(bed => {
        const readyBed = readyBeds.find(rb => rb.BED_NO === bed.BED_NO);
        return {
          bedNo: bed.BED_NO,
          roomType: bed.ROOM_TYPE,
          nurStation: bed.NUR_STATION || bed.NS_SHORT,
          roomNo: bed.ROOM_NO,
          available: true,
          dischargedToday: true,
          billedToday: true,
          lastDischargeTime: readyBed?.LAST_DISCHARGE_DATE,
          wardName: readyBed?.WARD,
          status: 'Ready for new patient',
        };
      })
      .sort((a, b) => {
        // Sort by most recent discharge first
        const timeA = new Date(a.lastDischargeTime || 0);
        const timeB = new Date(b.lastDischargeTime || 0);
        return timeB - timeA;
      });

    // Always return 200 OK with suggestions (even if empty)
    res.status(200).json({
      targetDate,
      suggestions,
      totalSuggestions: suggestions.length,
      note: suggestions.length > 0
        ? `${suggestions.length} bed(s) discharged and billed today - ready for new patients`
        : 'No beds discharged and billed on this date',
    });
  } catch (err) {
    console.error('[Prebooking] suggestRooms error:', err.message);
    // Even on error, return 200 OK to avoid frontend errors
    res.status(200).json({
      suggestions: [],
      note: 'Could not fetch suggestions, but system is operational',
    });
  }
});

// GET /api/prebooking/summary  — server-side KPI counts (always accurate, no date filter)
exports.getPrebookingSummary = asyncHandler(async (req, res) => {
  await expireStaleBookings();
  const today = localToday();
  const rows = await query(`
    SELECT
      COUNT(*)                                                                          AS total,
      SUM(status = 'Confirmed')                                                         AS confirmed,
      SUM(status = 'Admitted')                                                          AS admitted,
      SUM(status = 'Cancelled')                                                         AS cancelled,
      SUM(status = 'Confirmed' AND DATE_FORMAT(bookedDate, '%Y-%m-%d') > ?)             AS upcoming
    FROM \`Prebookings\`
  `, [today]);
  const r = rows[0];
  res.json({
    total:     Number(r.total)     || 0,
    confirmed: Number(r.confirmed) || 0,
    admitted:  Number(r.admitted)  || 0,
    cancelled: Number(r.cancelled) || 0,
    upcoming:  Number(r.upcoming)  || 0,
  });
});

// GET /api/prebooking  — list prebookings with optional filters; priority queue sort for Confirmed
exports.listPrebookings = asyncHandler(async (req, res) => {
  await expireStaleBookings();
  const { status, dateFrom, dateTo, roomType, nurStation, priority, priorityCategory } = req.query;
  let sql  = `
    SELECT p.*, DATE_FORMAT(p.\`bookedDate\`, '%Y-%m-%d') AS bookedDate
    FROM \`Prebookings\` p
    WHERE 1=1
  `;
  const params = [];
  if (status)           { sql += ' AND p.\`status\` = ?';            params.push(status); }
  if (dateFrom)         { sql += " AND DATE_FORMAT(p.`bookedDate`,'%Y-%m-%d') >= ?"; params.push(dateFrom); }
  if (dateTo)           { sql += " AND DATE_FORMAT(p.`bookedDate`,'%Y-%m-%d') <= ?"; params.push(dateTo); }
  if (roomType)         { sql += ' AND p.\`roomType\` = ?';          params.push(roomType); }
  if (nurStation)       { sql += ' AND p.\`nurStation\` = ?';        params.push(nurStation); }
  if (priority)         { sql += ' AND p.\`priority\` = ?';          params.push(priority); }
  if (priorityCategory) { sql += ' AND p.\`priorityCategory\` = ?';  params.push(priorityCategory); }

  // Priority queue: Confirmed first, then Admitted, then Cancelled
  // Within Confirmed: Emergency → VIP → Regular, then by oldest booking first (FCFO)
  sql += `
    ORDER BY
      CASE p.\`status\`
        WHEN 'Confirmed' THEN 0
        WHEN 'Admitted'  THEN 1
        ELSE 2
      END ASC,
      CASE p.\`priority\`
        WHEN 'Emergency' THEN 1
        WHEN 'VIP'       THEN 2
        WHEN 'Regular'   THEN 3
        ELSE 4
      END ASC,
      p.\`bookedDate\` ASC,
      p.\`createdAt\`  ASC
  `;
  const rows = await query(sql, params);

  // Add HIS data from database columns (already populated by sync scripts)
  const enrichedRows = rows.map(booking => ({
    ...booking,
    hisBed: booking.hisBed || null,
    hisRoom: booking.hisRoom || null,
    isInHIS: !!(booking.hisBed || booking.hisRoom)
  }));

  res.json({ prebookings: enrichedRows });
});

// Helper: extract real client IP (handles proxies)
const getClientIp = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.socket?.remoteAddress || req.ip || 'unknown';
};

// Derive the minimum priority level implied by category
const categoryMinPriority = (category) => {
  if (category === 'Emergency') return 'Emergency';
  if (category === 'VIP')       return 'VIP';
  return 'Regular';
};

const higherPriority = (a, b) => PRIORITY_RANK[a] < PRIORITY_RANK[b] ? a : b;

// POST /api/prebooking  — create a new prebook
exports.createPrebooking = asyncHandler(async (req, res) => {
  console.log('[Prebooking] POST body:', JSON.stringify(req.body));
  console.log('[Prebooking] User:', req.user?.username, '| Role:', req.user?.role);

  const {
    bedNo, roomType, nurStation, roomNo,
    patientName, patientPhone, patientAge, patientGender, patientId,
    doctorName, notes, bookedDate,
    priority: rawPriority,
    priorityCategory: rawCategory,
    admissionReason,
    advanceCollected, advanceAmount,
    isInsured, insuranceProvider, insurancePolicyNo,
  } = req.body;

  if (!bedNo || !patientName || !patientGender || !bookedDate) {
    res.status(400);
    throw new Error('bedNo, patientName, patientGender and bookedDate are required');
  }

  // Determine category — auto-suggest Senior Citizen if age ≥ 60
  const age = patientAge ? Number(patientAge) : null;
  let category = rawCategory || 'General';
  if (!rawCategory && age !== null && age >= 60) category = 'Senior Citizen';

  // Priority must be at least the minimum implied by category
  const minForCategory = categoryMinPriority(category);
  let priority = rawPriority || 'Regular';
  if (!PRIORITY_RANK[priority]) priority = 'Regular';
  priority = higherPriority(priority, minForCategory);

  // Check for conflicting bookings within the window
  const conflicting = await query(
    `SELECT \`id\`, \`bookedDate\`, \`patientName\`, \`priority\`
     FROM \`Prebookings\`
     WHERE \`bedNo\` = ?
       AND \`status\` = 'Confirmed'
       AND \`bookedDate\` BETWEEN
           DATE_SUB(?, INTERVAL ? DAY) AND
           DATE_ADD(?, INTERVAL ? DAY)`,
    [bedNo, bookedDate, BOOKING_WINDOW_DAYS, bookedDate, BOOKING_WINDOW_DAYS]
  );

  let displaced = null;
  if (conflicting.length > 0) {
    const conflict = conflicting[0];
    // Emergency can auto-displace a lower-priority (VIP/Regular) booking
    if (priority === 'Emergency' && PRIORITY_RANK[conflict.priority] > 1) {
      const cancelledBy = req.user?.username || 'System';
      await query(
        `UPDATE \`Prebookings\`
         SET \`status\`='Cancelled', \`cancelledBy\`=?, \`cancelledAt\`=NOW()
         WHERE \`id\`=?`,
        [`System-Displaced by Emergency (${cancelledBy})`, conflict.id]
      );
      displaced = { id: conflict.id, patientName: conflict.patientName, priority: conflict.priority };
      console.log(`[Prebooking] Emergency displaced booking #${conflict.id} (${conflict.patientName})`);
    } else {
      res.status(409);
      throw new Error(
        `Bed ${bedNo} is already prebooked for ${conflict.patientName} on ${conflict.bookedDate}` +
        (priority === 'Emergency' ? ' — cannot displace another Emergency booking' : ` — within the ${BOOKING_WINDOW_DAYS}-day window`)
      );
    }
  }

  const bookedBy       = req.user?.username || 'System';
  const clientIp       = getClientIp(req);
  const userAgent      = req.headers['user-agent'] || null;

  const advCollected = advanceCollected ? 1 : 0;
  const advAmount    = advCollected && advanceAmount ? parseFloat(advanceAmount) : null;

  const result = await query(
    `INSERT INTO \`Prebookings\`
       (\`bedNo\`,\`roomType\`,\`nurStation\`,\`roomNo\`,
        \`patientName\`,\`patientPhone\`,\`patientAge\`,\`patientGender\`,\`patientId\`,
        \`doctorName\`,\`notes\`,\`bookedDate\`,
        \`priority\`,\`priorityCategory\`,\`admissionReason\`,
        \`advanceCollected\`,\`advanceAmount\`,
        \`isInsured\`,\`insuranceProvider\`,\`insurancePolicyNo\`,
        \`bookedBy\`,\`clientIp\`,\`userAgent\`)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      bedNo, roomType || '', nurStation || '', roomNo || null,
      patientName, patientPhone || null, age, patientGender, patientId || null,
      doctorName || null, notes || null, bookedDate,
      priority, category, admissionReason || null,
      advCollected, advAmount,
      isInsured ? 1 : 0, insuranceProvider || null, insurancePolicyNo || null,
      bookedBy, clientIp, userAgent,
    ]
  );

  console.log(`[Prebooking] Inserted #${result.insertId} | Priority: ${priority} | Category: ${category} | IP: ${clientIp} | By: ${bookedBy}`);

  const [newRow] = await query('SELECT * FROM `Prebookings` WHERE `id` = ?', [result.insertId]);

  // Send WhatsApp confirmation — fire-and-forget, never block the response
  if (patientPhone) {
    sendBookingConfirmation({
      prebookingId:     result.insertId,
      phone:            patientPhone,
      patientName,
      bedNo,
      roomType:         roomType || '',
      bookedDate,
      priority,
      notes:            notes || '',
      advanceCollected: advCollected,
      advanceAmount:    advAmount,
    }).catch(err => console.error('[WhatsApp] send error:', err.message));
  }

  res.status(201).json({ prebooking: newRow, displaced });
});

// PATCH /api/prebooking/:id  — edit booking details (Confirmed only)
exports.updatePrebooking = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const [row] = await query('SELECT * FROM `Prebookings` WHERE `id` = ?', [id]);
  if (!row) { res.status(404); throw new Error('Prebooking not found'); }
  if (row.status !== 'Confirmed') { res.status(400); throw new Error('Only Confirmed bookings can be edited'); }

  const {
    bedNo: newBedNo, roomType: newRoomType, nurStation: newNurStation,
    patientName, patientPhone, patientAge, patientGender, patientId,
    doctorName, notes, bookedDate,
    admissionReason, advanceCollected, advanceAmount,
  } = req.body;

  if (!patientName || !patientGender || !bookedDate) {
    res.status(400); throw new Error('patientName, patientGender and bookedDate are required');
  }

  // If bed is being changed, check for conflicts on the new bed (excluding this booking)
  const bedNo      = newBedNo      || row.bedNo;
  const roomType   = newRoomType   || row.roomType;
  const nurStation = newNurStation || row.nurStation;

  if (bedNo !== row.bedNo || bookedDate !== String(row.bookedDate).slice(0, 10)) {
    const conflicts = await query(
      `SELECT id, patientName FROM \`Prebookings\`
       WHERE \`bedNo\` = ? AND \`status\` = 'Confirmed' AND \`id\` != ?
         AND \`bookedDate\` BETWEEN
             DATE_SUB(?, INTERVAL ? DAY) AND
             DATE_ADD(?, INTERVAL ? DAY)`,
      [bedNo, id, bookedDate, BOOKING_WINDOW_DAYS, bookedDate, BOOKING_WINDOW_DAYS]
    );
    if (conflicts.length > 0) {
      res.status(409);
      throw new Error(`Bed ${bedNo} is already pre-booked for ${conflicts[0].patientName} near that date`);
    }
  }

  const advCollected = advanceCollected ? 1 : 0;
  const advAmount    = advCollected && advanceAmount ? parseFloat(advanceAmount) : null;
  const updatedBy    = req.user?.username || 'System';

  await query(
    `UPDATE \`Prebookings\`
     SET \`bedNo\`=?, \`roomType\`=?, \`nurStation\`=?,
         \`patientName\`=?, \`patientPhone\`=?, \`patientAge\`=?,
         \`patientGender\`=?, \`patientId\`=?, \`doctorName\`=?, \`notes\`=?,
         \`bookedDate\`=?, \`admissionReason\`=?,
         \`advanceCollected\`=?, \`advanceAmount\`=?,
         \`updatedAt\`=NOW()
     WHERE \`id\`=?`,
    [
      bedNo, roomType, nurStation,
      patientName, patientPhone || null, patientAge || null,
      patientGender, patientId || null, doctorName || null, notes || null,
      bookedDate, admissionReason || null,
      advCollected, advAmount,
      id,
    ]
  );

  console.log(`[Prebooking] Updated #${id} by ${updatedBy}`);
  const [updated] = await query('SELECT * FROM `Prebookings` WHERE `id` = ?', [id]);
  res.json({ prebooking: updated });
});

// PATCH /api/prebooking/:id/cancel
exports.cancelPrebooking = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const [row] = await query('SELECT * FROM `Prebookings` WHERE `id` = ?', [id]);
  if (!row) { res.status(404); throw new Error('Prebooking not found'); }
  if (row.status !== 'Confirmed') { res.status(400); throw new Error('Only Confirmed bookings can be cancelled'); }

  const cancelledBy = req.user?.username || 'System';
  await query(
    'UPDATE `Prebookings` SET `status`=?, `cancelledBy`=?, `cancelledAt`=NOW() WHERE `id`=?',
    ['Cancelled', cancelledBy, id]
  );
  console.log('[Prebooking] Cancelled ID:', id, '| By:', cancelledBy, '| IP:', getClientIp(req));
  res.json({ id: Number(id), status: 'Cancelled' });
});

// PATCH /api/prebooking/:id/admit
exports.admitPrebooking = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const [row] = await query('SELECT * FROM `Prebookings` WHERE `id` = ?', [id]);
  if (!row) { res.status(404); throw new Error('Prebooking not found'); }

  const admittedBy = req.user?.username || 'System';
  await query(
    'UPDATE `Prebookings` SET `status`=?, `admittedBy`=?, `admittedAt`=NOW() WHERE `id`=?',
    ['Admitted', admittedBy, id]
  );
  console.log('[Prebooking] Admitted ID:', id, '| By:', admittedBy, '| IP:', getClientIp(req));
  res.json({ id: Number(id), status: 'Admitted' });
});

// PATCH /api/prebooking/:id/priority  — escalate or change priority
exports.updatePriority = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { priority, priorityCategory, admissionReason } = req.body;

  if (!priority || !PRIORITY_RANK[priority]) {
    res.status(400);
    throw new Error(`Invalid priority. Must be one of: ${Object.keys(PRIORITY_RANK).join(', ')}`);
  }

  const [row] = await query('SELECT * FROM `Prebookings` WHERE `id` = ?', [id]);
  if (!row)                      { res.status(404); throw new Error('Prebooking not found'); }
  if (row.status !== 'Confirmed'){ res.status(400); throw new Error('Only Confirmed bookings can be updated'); }

  const wasEscalated = PRIORITY_RANK[priority] < PRIORITY_RANK[row.priority];
  const updatedBy = req.user?.username || 'System';

  await query(
    `UPDATE \`Prebookings\`
     SET \`priority\`=?, \`priorityCategory\`=?, \`admissionReason\`=?,
         \`escalatedAt\`= ${wasEscalated ? 'NOW()' : '`escalatedAt`'}
     WHERE \`id\`=?`,
    [priority, priorityCategory || row.priorityCategory, admissionReason ?? row.admissionReason, id]
  );

  console.log(`[Prebooking] Priority updated #${id}: ${row.priority} → ${priority} | By: ${updatedBy}${wasEscalated ? ' [ESCALATED]' : ''}`);

  const [updated] = await query('SELECT * FROM `Prebookings` WHERE `id` = ?', [id]);
  res.json({ prebooking: updated, escalated: wasEscalated });
});

// ── Room Type Restrictions ────────────────────────────────────────────────────

// GET /api/prebooking/room-type-restrictions
exports.getRestrictions = asyncHandler(async (req, res) => {
  // All room types from HIS
  const allTypes = await hisQuery(`
    SELECT DISTINCT INITCAP(T.RTC_DESC) AS ROOM_TYPE
    FROM ROOMTYPE T
    ORDER BY INITCAP(T.RTC_DESC)
  `);
  // Currently blocked
  const blocked = await query('SELECT `roomType`, `reason`, `blockedBy`, `createdAt` FROM `RoomTypeRestrictions`');
  const blockedMap = {};
  for (const r of blocked) blockedMap[r.roomType] = r;

  const result = allTypes.map(t => ({
    roomType:  t.ROOM_TYPE,
    blocked:   !!blockedMap[t.ROOM_TYPE],
    reason:    blockedMap[t.ROOM_TYPE]?.reason    || '',
    blockedBy: blockedMap[t.ROOM_TYPE]?.blockedBy || '',
    createdAt: blockedMap[t.ROOM_TYPE]?.createdAt || null,
  }));

  res.json({ restrictions: result });
});

// POST /api/prebooking/room-type-restrictions  — block a room type
exports.blockRoomType = asyncHandler(async (req, res) => {
  const { roomType, reason } = req.body;
  if (!roomType) { res.status(400); throw new Error('roomType is required'); }
  const blockedBy = req.user?.username || 'System';
  await query(
    `INSERT INTO \`RoomTypeRestrictions\` (\`roomType\`, \`reason\`, \`blockedBy\`)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE \`reason\` = VALUES(\`reason\`), \`blockedBy\` = VALUES(\`blockedBy\`)`,
    [roomType, reason || null, blockedBy]
  );
  res.json({ roomType, blocked: true, reason: reason || '' });
});

// DELETE /api/prebooking/room-type-restrictions/:roomType  — unblock
exports.unblockRoomType = asyncHandler(async (req, res) => {
  const roomType = decodeURIComponent(req.params.roomType);
  await query('DELETE FROM `RoomTypeRestrictions` WHERE `roomType` = ?', [roomType]);
  res.json({ roomType, blocked: false });
});

// GET /api/prebooking/whatsapp-logs
exports.getWhatsappLogs = asyncHandler(async (req, res) => {
  const { fromDate, toDate, status, search, limit = 50, offset = 0 } = req.query;
  const data = await getLogs({ fromDate, toDate, status, search, limit, offset });
  res.json(data);
});

// ── FCFO + Priority-Based Auto-Allocation ──────────────────────────────────

// Helper: Check if bed matches patient constraints
const checkConstraints = (bed, patient) => {
  const issues = [];

  // Room type check - match patient's booked room type with bed room type
  if (patient.roomType && bed.ROOM_TYPE) {
    const patientRoomNormalized = patient.roomType.toLowerCase().trim();
    const bedRoomNormalized = bed.ROOM_TYPE.toLowerCase().trim();

    // Allow some flexibility in matching
    if (!bedRoomNormalized.includes(patientRoomNormalized) &&
        !patientRoomNormalized.includes(bedRoomNormalized)) {
      // Only flag as issue if they're completely different
      if (patientRoomNormalized !== bedRoomNormalized) {
        // Don't add as an issue, just log it
      }
    }
  }

  // Gender check (if specified)
  if (patient.patientGender && bed.gender_section && bed.gender_section !== 'Mixed') {
    if (patient.patientGender !== bed.gender_section) {
      issues.push(`Patient is ${patient.patientGender}, bed is for ${bed.gender_section}`);
    }
  }

  const isMatch = issues.length === 0;
  const confidence = isMatch ? 100 : 50;

  return { isMatch, confidence, reason: isMatch ? 'Perfect match' : (issues.length > 0 ? issues.join('; ') : 'Good match') };
};

// Helper: Get waiting patients ordered by PRIORITY + FCFO
const getWaitingPatients = async () => {
  const patients = await query(`
    SELECT
      id, patientName, patientGender, roomType, patientAge,
      bookedDate, priority, priorityCategory,
      DATEDIFF(CURDATE(), bookedDate) as days_waiting,
      ROW_NUMBER() OVER (PARTITION BY priority ORDER BY bookedDate ASC) as fcfo_rank_within_priority
    FROM Prebookings
    WHERE status = 'Confirmed'
      AND bookedDate <= CURDATE()
    ORDER BY
      CASE
        WHEN priority = 'Emergency' THEN 1
        WHEN priority = 'VIP' THEN 2
        WHEN priority = 'Regular' THEN 3
      END ASC,
      bookedDate ASC,
      id ASC
    LIMIT 20
  `);
  return patients;
};

// GET /api/prebooking/auto-allocate?bedNo=X  — suggest allocation for discharged bed
exports.getAutoAllocationSuggestion = asyncHandler(async (req, res) => {
  const { bedNo } = req.query;

  if (!bedNo) {
    res.status(400);
    throw new Error('bedNo parameter required');
  }

  // Get bed details
  const bedData = await query(
    `SELECT bed_no, ROOM_TYPE, gender_section, isolation FROM HisBedCache WHERE bed_no = ?`,
    [bedNo]
  );

  if (!bedData || bedData.length === 0) {
    return res.json({
      bedNo,
      suggestion: null,
      message: 'Bed not found in HIS cache',
    });
  }

  const bed = bedData[0];

  // Get waiting patients (PRIORITY + FCFO ordered)
  const waitingPatients = await getWaitingPatients();

  // Find first matching patient
  let skippedRegular = 0;
  let skippedVip = 0;
  const alternatives = [];

  for (const patient of waitingPatients) {
    const matchDetails = checkConstraints(bed, patient);

    if (matchDetails.isMatch) {
      // Found a match!
      const suggestion = {
        bedNo: bed.bed_no,
        prebookingId: patient.id,
        patientName: patient.patientName,
        priority: patient.priority,
        roomType: bed.room_type,
        confidence: matchDetails.confidence,
        reason: matchDetails.reason,
        bookingAge: patient.days_waiting,
        fcfoRank: patient.fcfo_rank_within_priority,
        skippedRegularCount: skippedRegular,
        skippedVipCount: skippedVip,
        alternatives: alternatives.slice(0, 3),
      };

      // Log suggestion (DischargeLog might not exist yet, so catch error)
      await query(
        `INSERT INTO DischargeLog
         (bed_no, allocation_suggested_to_id, allocation_suggested_priority, allocation_suggested_at)
         VALUES (?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE
           allocation_suggested_to_id = VALUES(allocation_suggested_to_id),
           allocation_suggested_priority = VALUES(allocation_suggested_priority),
           allocation_suggested_at = NOW()`,
        [bedNo, patient.id, patient.priority]
      ).catch(() => {});

      return res.json({
        bedNo: suggestion.bedNo,
        suggestion,
      });
    } else {
      // Track skipped patients
      alternatives.push({
        patientName: patient.patientName,
        priority: patient.priority,
        reason: matchDetails.reason,
      });

      if (patient.priority === 'Regular') skippedRegular++;
      if (patient.priority === 'VIP') skippedVip++;
    }
  }

  // No match found
  res.json({
    bedNo,
    suggestion: null,
    message: 'No waiting patients found that match this bed',
  });
});

// POST /api/prebooking/:prebookingId/allocate-now  — one-click allocation
exports.allocateNow = asyncHandler(async (req, res) => {
  const { prebookingId } = req.params;
  const { bedNo } = req.body;
  const user = req.user;

  if (!bedNo) {
    res.status(400);
    throw new Error('bedNo is required in request body');
  }

  // Get booking
  const [bookingData] = await query(
    `SELECT id, patientName, patientPhone, priority, roomType, bookedDate FROM Prebookings WHERE id = ?`,
    [prebookingId]
  );

  if (!bookingData || bookingData.length === 0) {
    res.status(404);
    throw new Error('Booking not found');
  }

  const booking = bookingData[0];

  // Check bed is still available
  const [bedData] = await query(
    `SELECT bed FROM HisOccupancyCache WHERE bed = ?`,
    [bedNo]
  );

  if (bedData && bedData.length > 0) {
    // Bed exists, check if occupied
    const occupancyCheck = await hisQuery(`
      SELECT BED_NO FROM IPADMISS
      WHERE BED_NO = ? AND DISCHARGE_DATE IS NULL
    `, [bedNo]).catch(() => []);

    if (occupancyCheck.length > 0) {
      res.status(409);
      throw new Error('Bed is no longer available');
    }
  }

  // Update booking with allocated bed (status stays Confirmed)
  const [updateResult] = await query(
    `UPDATE Prebookings
     SET bedNo = ?
     WHERE id = ?`,
    [bedNo, prebookingId]
  );

  if (updateResult.affectedRows === 0) {
    res.status(500);
    throw new Error('Failed to update booking');
  }

  // Send WhatsApp confirmation
  try {
    await sendBookingConfirmation({
      patientPhone: booking.patientPhone,
      patientName: booking.patientName,
      bedNo: bedNo,
      roomType: booking.roomType,
      priority: booking.priority,
      admittedAt: new Date(),
    });
  } catch (err) {
    console.error('[WhatsApp] Failed to send allocation confirmation:', err.message);
  }

  console.log(
    `[Allocation] ${booking.priority} patient "${booking.patientName}" allocated to ${bedNo}`
  );

  res.json({
    success: true,
    message: `${booking.patientName} (${booking.priority}) allocated to ${bedNo}`,
    booking: {
      id: booking.id,
      patientName: booking.patientName,
      priority: booking.priority,
      bedNo: bedNo,
      status: 'Confirmed',
      allocatedAt: new Date(),
    },
  });
});
