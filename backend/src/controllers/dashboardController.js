const asyncHandler = require('express-async-handler');
const { hisQuery, query } = require('../config/database');

// ── MySQL cache + override tables (created once on startup) ──────────────────

const ensureTables = async () => {
  // Admin overrides — manual Active/Inactive toggle
  await query(`
    CREATE TABLE IF NOT EXISTS \`BedOverrides\` (
      \`bedNo\`     VARCHAR(50)  NOT NULL PRIMARY KEY,
      \`status\`    ENUM('Active','Inactive') NOT NULL,
      \`updatedAt\` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB
  `);

  // HIS bed master cache — refreshed every 2 minutes by background sync
  await query(`
    CREATE TABLE IF NOT EXISTS \`HisBedCache\` (
      \`bed_no\`      VARCHAR(50)  NOT NULL PRIMARY KEY,
      \`nur_station\` VARCHAR(200) DEFAULT NULL,
      \`ns_short\`    VARCHAR(50)  DEFAULT NULL,
      \`room_no\`     VARCHAR(200) DEFAULT NULL,
      \`room_type\`   VARCHAR(100) DEFAULT NULL,
      \`his_status\`  ENUM('Active','Inactive') NOT NULL DEFAULT 'Active',
      \`synced_at\`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB
  `);

  // HIS current occupancy cache — refreshed every 2 minutes
  await query(`
    CREATE TABLE IF NOT EXISTS \`HisOccupancyCache\` (
      \`id\`             INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
      \`pt_no\`          VARCHAR(50)  NOT NULL,
      \`bed\`            VARCHAR(50)  NOT NULL,
      \`room_type\`      VARCHAR(100) DEFAULT NULL,
      \`pt_name\`        VARCHAR(200) DEFAULT NULL,
      \`address\`        VARCHAR(500) DEFAULT NULL,
      \`occupied_by\`    ENUM('Patient','Bystander') NOT NULL DEFAULT 'Patient',
      \`doctor\`         VARCHAR(200) DEFAULT NULL,
      \`admission_date\` DATETIME     DEFAULT NULL,
      \`nur_station\`    VARCHAR(200) DEFAULT NULL,
      \`synced_at\`      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY \`uq_pt_bed\` (\`pt_no\`, \`bed\`)
    ) ENGINE=InnoDB
  `);

  // Discharge snapshots — persisted historical data with date filter support
  await query(`
    CREATE TABLE IF NOT EXISTS \`DischargeSnapshots\` (
      \`id\`              INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
      \`pt_no\`           VARCHAR(50)   NOT NULL,
      \`pt_name\`         VARCHAR(200)  DEFAULT NULL,
      \`address\`         VARCHAR(500)  DEFAULT NULL,
      \`bed\`             VARCHAR(50)   NOT NULL,
      \`room_type\`       VARCHAR(100)  DEFAULT NULL,
      \`doctor\`          VARCHAR(200)  DEFAULT NULL,
      \`department\`      VARCHAR(200)  DEFAULT NULL,
      \`nur_station\`     VARCHAR(200)  DEFAULT NULL,
      \`admission_date\`  DATETIME      DEFAULT NULL,
      \`disc_req_date\`   DATETIME      DEFAULT NULL,
      \`disc_entry_time\` DATETIME      DEFAULT NULL,
      \`disc_billed_time\`DATETIME      DEFAULT NULL,
      \`disc_status\`     VARCHAR(50)   NOT NULL DEFAULT 'Discharge Requested',
      \`first_seen_at\`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`last_synced_at\`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY \`uq_pt_bed\` (\`pt_no\`, \`bed\`)
    ) ENGINE=InnoDB
  `);
};
ensureTables();

// ── Oracle SQL definitions (only used by background sync) ────────────────────

const BED_LIST_SQL = `
  SELECT
    G.NSC_DESC                                           AS NUR_STATION,
    G.NSC_ALIAS                                          AS NS_SHORT,
    F.BDC_NO                                             AS BED_NO,
    R.RMC_DESC                                           AS ROOM_NO,
    INITCAP(T.RTC_DESC)                                  AS ROOM_TYPE,
    DECODE(F.BDC_STATUS, 'N', 'Inactive', 'Y', 'Active') AS HIS_STATUS
  FROM BED F, NURSTATION G, ROOMMASTER R, ROOMTYPE T
  WHERE F.NS_CODE    = G.NS_CODE
    AND F.RM_CODE    = R.RM_CODE
    AND T.RT_CODE(+) = F.RT_CODE
  ORDER BY G.NSC_DESC, F.BDC_NO
`;

const OCCUPANCY_SQL = `
  SELECT
    IPADMISS.PT_NO                                                             AS PT_NO,
    INITCAP(ROOMTYPE.RTC_DESC)                                                 AS ROOM_TYPE,
    INITCAP(IPADMISS.PTC_PTNAME)                                               AS PT_NAME,
    INITCAP(IPADMISS.PTC_LOADD1) || ' ' ||
      INITCAP(IPADMISS.PTC_LOADD2) || ' ' ||
      INITCAP(IPADMISS.PTC_LOADD3) || ' ' ||
      INITCAP(IPADMISS.PTC_LOADD4)                                             AS ADDRESS,
    DECODE(RMALL.RMC_OCCUPBY, 'B', 'Bystander', 'P', 'Patient')               AS OCCUPIED_BY,
    BED.BDC_NO                                                                 AS BED,
    INITCAP(DOCTOR.DOC_NAME)                                                   AS DOCTOR,
    TO_CHAR(IPADMISS.IPD_DATE, 'DD/MM/YYYY HH:MI:SS AM')                      AS ADMISSION_DATE,
    INITCAP(NURSTATION.NSC_DESC)                                               AS NUR_STATION
  FROM RMALL, IPADMISS, SALUTATION, BED, NURSTATION, DOCTOR, ROOMTYPE
  WHERE RMALL.IP_NO          = IPADMISS.IP_NO
    AND ROOMTYPE.RT_CODE(+)  = BED.RT_CODE
    AND BED.BD_CODE          = RMALL.BD_CODE
    AND IPADMISS.SA_CODE     = SALUTATION.SA_CODE
    AND NURSTATION.NS_CODE   = BED.NS_CODE
    AND IPADMISS.DO_CODE     = DOCTOR.DO_CODE
    AND IPADMISS.IPD_DISC    IS NULL
    AND RMALL.RMC_RELESETYPE IS NULL
  ORDER BY BED.BDC_NO, NURSTATION.NSC_DESC, IPADMISS.PTC_PTNAME
`;

const buildDischargeSql = (nsCodes) => {
  const nsPlaceholders = nsCodes.map((_, i) => `:b${i}`).join(', ');
  return `
    SELECT
      IPADMISS.PT_NO                                                             AS PT_NO,
      INITCAP(IPADMISS.PTC_PTNAME)                                               AS PT_NAME,
      INITCAP(IPADMISS.PTC_LOADD1) || ' ' ||
        INITCAP(IPADMISS.PTC_LOADD2) || ' ' ||
        INITCAP(IPADMISS.PTC_LOADD3) || ' ' ||
        INITCAP(IPADMISS.PTC_LOADD4)                                             AS ADDRESS,
      BED.BDC_NO                                                                 AS BED,
      INITCAP(ROOMTYPE.RTC_DESC)                                                 AS ROOM_TYPE,
      INITCAP(DOCTOR.DOC_NAME)                                                   AS DOCTOR,
      INITCAP(DEPARTMENT.DPC_DESC)                                               AS DEPARTMENT,
      INITCAP(NURSTATION.NSC_DESC)                                               AS NUR_STATION,
      TO_CHAR(IPADMISS.IPD_DATE,        'DD/MM/YYYY HH:MI:SS AM')               AS ADMISSION_DATE,
      TO_CHAR(DISREQ.REQ_DATE,          'DD/MM/YYYY HH:MI:SS AM')               AS DISC_REQ_DATE,
      TO_CHAR(IPADMISS.IPD_DISC,        'DD/MM/YYYY HH:MI:SS AM')               AS DISC_ENTRY_TIME,
      TO_CHAR(IPADMISS.DMD_DATE,        'DD/MM/YYYY HH:MI:SS AM')               AS DISC_BILLED_TIME,
      CASE
        WHEN IPADMISS.DMD_DATE  IS NOT NULL THEN 'Billed'
        WHEN IPADMISS.IPD_DISC  IS NOT NULL THEN 'Discharge Entered'
        ELSE                                     'Discharge Requested'
      END                                                                        AS DISC_STATUS
    FROM IPADMISS, DOCTOR, DEPARTMENT, SPECIALITY, DISREQUESTDETL DISREQ,
         BED, NURSTATION, ROOMTYPE
    WHERE IPADMISS.IP_NO     = DISREQ.IP_NO
      AND IPADMISS.DO_CODE   = DOCTOR.DO_CODE
      AND DOCTOR.SP_CODE     = SPECIALITY.SP_CODE
      AND DEPARTMENT.DP_CODE = SPECIALITY.DP_CODE
      AND IPADMISS.BD_CODE   = BED.BD_CODE
      AND BED.NS_CODE        = NURSTATION.NS_CODE
      AND ROOMTYPE.RT_CODE(+)= BED.RT_CODE
      AND IPADMISS.DMD_DATE IS NULL
      AND BED.NS_CODE IN (${nsPlaceholders})
    UNION ALL
    SELECT
      IPADMISS.PT_NO                                                             AS PT_NO,
      INITCAP(IPADMISS.PTC_PTNAME)                                               AS PT_NAME,
      INITCAP(IPADMISS.PTC_LOADD1) || ' ' ||
        INITCAP(IPADMISS.PTC_LOADD2) || ' ' ||
        INITCAP(IPADMISS.PTC_LOADD3) || ' ' ||
        INITCAP(IPADMISS.PTC_LOADD4)                                             AS ADDRESS,
      BED.BDC_NO                                                                 AS BED,
      INITCAP(ROOMTYPE.RTC_DESC)                                                 AS ROOM_TYPE,
      INITCAP(DOCTOR.DOC_NAME)                                                   AS DOCTOR,
      INITCAP(DEPARTMENT.DPC_DESC)                                               AS DEPARTMENT,
      INITCAP(NURSTATION.NSC_DESC)                                               AS NUR_STATION,
      TO_CHAR(IPADMISS.IPD_DATE,        'DD/MM/YYYY HH:MI:SS AM')               AS ADMISSION_DATE,
      TO_CHAR(DISREQ.REQ_DATE,          'DD/MM/YYYY HH:MI:SS AM')               AS DISC_REQ_DATE,
      TO_CHAR(IPADMISS.IPD_DISC,        'DD/MM/YYYY HH:MI:SS AM')               AS DISC_ENTRY_TIME,
      TO_CHAR(IPADMISS.DMD_DATE,        'DD/MM/YYYY HH:MI:SS AM')               AS DISC_BILLED_TIME,
      'Billed'                                                                   AS DISC_STATUS
    FROM IPADMISS, DOCTOR, DEPARTMENT, SPECIALITY, DISREQUESTDETL DISREQ,
         BED, NURSTATION, ROOMTYPE
    WHERE IPADMISS.IP_NO     = DISREQ.IP_NO
      AND IPADMISS.DO_CODE   = DOCTOR.DO_CODE
      AND DOCTOR.SP_CODE     = SPECIALITY.SP_CODE
      AND DEPARTMENT.DP_CODE = SPECIALITY.DP_CODE
      AND IPADMISS.BD_CODE   = BED.BD_CODE
      AND BED.NS_CODE        = NURSTATION.NS_CODE
      AND ROOMTYPE.RT_CODE(+)= BED.RT_CODE
      AND IPADMISS.DMD_DATE  IS NOT NULL
      AND IPADMISS.DMD_DATE  >= TRUNC(SYSDATE) - 1
      AND BED.NS_CODE IN (${nsPlaceholders})
    ORDER BY 11 DESC, 4
  `;
};

// ── Date parser: "DD/MM/YYYY HH:MI:SS AM" → MySQL DATETIME ───────────────────
const parseHisDate = (str) => {
  if (!str) return null;
  const match = str.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})\s+(AM|PM)$/i);
  if (!match) return null;
  let [, dd, mm, yyyy, hh, mi, ss, ampm] = match;
  hh = parseInt(hh, 10);
  if (ampm.toUpperCase() === 'PM' && hh !== 12) hh += 12;
  if (ampm.toUpperCase() === 'AM' && hh === 12) hh = 0;
  return `${yyyy}-${mm}-${dd} ${String(hh).padStart(2, '0')}:${mi}:${ss}`;
};

// ── Background HIS full sync (beds + occupancy + discharge + prebookings) ─────
// This is the ONLY place Oracle is queried. Everything else reads from MySQL.

let lastHisSyncTime  = null;
let lastHisSyncError = null;
let hisSyncRunning   = false;

let lastPrebookSyncCount = 0;

const runFullHisSync = async () => {
  if (hisSyncRunning) return; // prevent overlapping runs
  hisSyncRunning = true;
  const start = Date.now();
  try {
    // ── 1. Sync bed master (rarely changes — still sync every cycle for accuracy)
    const hisBeds = await hisQuery(BED_LIST_SQL);
    if (hisBeds.length > 0) {
      // Bulk upsert beds
      const bedValues = hisBeds.map(b =>
        `(${[b.BED_NO, b.NUR_STATION, b.NS_SHORT, b.ROOM_NO, b.ROOM_TYPE, b.HIS_STATUS]
          .map(v => v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`).join(',')})`
      ).join(',');
      await query(`
        INSERT INTO \`HisBedCache\` (bed_no, nur_station, ns_short, room_no, room_type, his_status)
        VALUES ${bedValues}
        ON DUPLICATE KEY UPDATE
          nur_station = VALUES(nur_station),
          ns_short    = VALUES(ns_short),
          room_no     = VALUES(room_no),
          room_type   = VALUES(room_type),
          his_status  = VALUES(his_status),
          synced_at   = NOW()
      `);
      // Remove beds no longer in HIS
      const bedNos = hisBeds.map(b => `'${String(b.BED_NO).replace(/'/g, "''")}'`).join(',');
      await query(`DELETE FROM \`HisBedCache\` WHERE \`bed_no\` NOT IN (${bedNos})`);
    }

    // ── 2. Sync current occupancy (replace entire table each cycle)
    const hisOccupancy = await hisQuery(OCCUPANCY_SQL);
    await query('DELETE FROM `HisOccupancyCache`');
    if (hisOccupancy.length > 0) {
      for (const p of hisOccupancy) {
        await query(
          `INSERT INTO \`HisOccupancyCache\`
             (pt_no, bed, room_type, pt_name, address, occupied_by, doctor, admission_date, nur_station)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             room_type      = VALUES(room_type),
             pt_name        = VALUES(pt_name),
             address        = VALUES(address),
             occupied_by    = VALUES(occupied_by),
             doctor         = VALUES(doctor),
             admission_date = VALUES(admission_date),
             nur_station    = VALUES(nur_station),
             synced_at      = NOW()`,
          [
            p.PT_NO, p.BED, p.ROOM_TYPE || null, p.PT_NAME || null,
            p.ADDRESS || null, p.OCCUPIED_BY === 'Bystander' ? 'Bystander' : 'Patient',
            p.DOCTOR || null, parseHisDate(p.ADMISSION_DATE), p.NUR_STATION || null,
          ]
        );
      }
    }

    // ── 3. Sync discharge snapshots
    const nsRows = await hisQuery(`SELECT NS_CODE FROM NURSTATION ORDER BY NS_CODE`);
    const nsCodes = nsRows.map(r => r.NS_CODE);
    if (nsCodes.length > 0) {
      const binds = {};
      nsCodes.forEach((code, i) => { binds[`b${i}`] = code; });
      const hisDischarge = await hisQuery(buildDischargeSql(nsCodes), binds);

      // Upsert current discharge records
      for (const p of hisDischarge) {
        await query(
          `INSERT INTO \`DischargeSnapshots\`
             (pt_no, pt_name, address, bed, room_type, doctor, department, nur_station,
              admission_date, disc_req_date, disc_entry_time, disc_billed_time, disc_status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             pt_name          = VALUES(pt_name),
             address          = VALUES(address),
             room_type        = VALUES(room_type),
             doctor           = VALUES(doctor),
             department       = VALUES(department),
             nur_station      = VALUES(nur_station),
             admission_date   = VALUES(admission_date),
             disc_req_date    = VALUES(disc_req_date),
             disc_entry_time  = VALUES(disc_entry_time),
             disc_billed_time = VALUES(disc_billed_time),
             disc_status      = VALUES(disc_status),
             last_synced_at   = NOW()`,
          [
            p.PT_NO, p.PT_NAME, p.ADDRESS, p.BED, p.ROOM_TYPE, p.DOCTOR,
            p.DEPARTMENT, p.NUR_STATION,
            parseHisDate(p.ADMISSION_DATE), parseHisDate(p.DISC_REQ_DATE),
            parseHisDate(p.DISC_ENTRY_TIME), parseHisDate(p.DISC_BILLED_TIME),
            p.DISC_STATUS,
          ]
        );
      }

      // Remove records absent from HIS for more than 7 days (fully cleared from HIS)
      // Billed records stay in HIS for 7 days (our query includes DMD_DATE >= SYSDATE-7)
      // so we only purge snapshot rows that haven't been refreshed in 7+ days
      if (hisDischarge.length >= 0) {
        const deleted = await query(
          `DELETE FROM \`DischargeSnapshots\` WHERE \`last_synced_at\` < DATE_SUB(NOW(), INTERVAL 7 DAY)`
        );
        if (deleted.affectedRows > 0) {
          console.log(`[HIS-Sync] Purged ${deleted.affectedRows} old discharge snapshot records (>7 days)`);
        }
      }
    }

    // ── 4. HIS Verification DISABLED (manual sync only)
    // Auto-sync verification has been disabled to prevent automatic status changes
    // To manually sync, use: POST /api/dashboard/sync (Admin only)
    let prebookSynced = 0;
    lastPrebookSyncCount = prebookSynced;

    lastHisSyncTime  = new Date();
    lastHisSyncError = null;
    console.log(`[HIS-Sync] Done in ${Date.now() - start}ms — ${hisBeds.length} beds, ${hisOccupancy.length} occupied, ${prebookSynced} prebooks admitted`);
  } catch (err) {
    lastHisSyncError = err.message;
    console.error('[HIS-Sync] Error:', err.message);
  } finally {
    hisSyncRunning = false;
  }
};

exports.runFullHisSync      = runFullHisSync;
exports.getHisSyncStatus    = (req, res) => res.json({ lastHisSyncTime, lastHisSyncError, hisSyncRunning });

// Legacy export name kept for server.js compatibility
exports.syncPrebookingsFromHIS = runFullHisSync;

exports.getSyncStatus = (req, res) => {
  res.json({ lastSyncTime: lastHisSyncTime, lastSyncCount: lastPrebookSyncCount });
};

exports.triggerSync = asyncHandler(async (req, res) => {
  await runFullHisSync();
  res.json({ lastSyncTime: lastHisSyncTime, lastSyncCount: lastPrebookSyncCount });
});

// ── getStats — reads entirely from MySQL cache ────────────────────────────────
exports.getStats = asyncHandler(async (req, res) => {
  const { toDate } = req.query;

  // For historical date queries we still need to hit Oracle (date filter on IPD_DATE)
  // For today (default), serve from MySQL cache
  const isHistorical = !!toDate;

  let patients, hisBeds;

  if (isHistorical) {
    // Historical query — must hit Oracle; build NS filter
    const nsRows  = await hisQuery(`SELECT NS_CODE FROM NURSTATION ORDER BY NS_CODE`);
    const nsCodes = nsRows.map(r => r.NS_CODE);
    if (nsCodes.length === 0) return res.json({
      stats: { totalBeds: 0, activeBeds: 0, inactiveBeds: 0, occupiedBeds: 0, availableBeds: 0 },
      patients: [], beds: [], roomTypeStats: [],
    });

    const binds = {};
    nsCodes.forEach((code, i) => { binds[`b${i}`] = code; });
    binds.toDate = toDate;

    const nsPlaceholders = nsCodes.map((_, i) => `:b${i}`).join(', ');
    const historicalSql = `
      SELECT
        IPADMISS.PT_NO                                                             AS PT_NO,
        INITCAP(ROOMTYPE.RTC_DESC)                                                 AS ROOM_TYPE,
        INITCAP(IPADMISS.PTC_PTNAME)                                               AS PT_NAME,
        INITCAP(IPADMISS.PTC_LOADD1) || ' ' ||
          INITCAP(IPADMISS.PTC_LOADD2) || ' ' ||
          INITCAP(IPADMISS.PTC_LOADD3) || ' ' ||
          INITCAP(IPADMISS.PTC_LOADD4)                                             AS ADDRESS,
        DECODE(RMALL.RMC_OCCUPBY, 'B', 'Bystander', 'P', 'Patient')               AS OCCUPIED_BY,
        BED.BDC_NO                                                                 AS BED,
        INITCAP(DOCTOR.DOC_NAME)                                                   AS DOCTOR,
        TO_CHAR(IPADMISS.IPD_DATE, 'DD/MM/YYYY HH:MI:SS AM')                      AS ADMISSION_DATE,
        INITCAP(NURSTATION.NSC_DESC)                                               AS NUR_STATION
      FROM RMALL, IPADMISS, SALUTATION, BED, NURSTATION, DOCTOR, ROOMTYPE
      WHERE RMALL.IP_NO          = IPADMISS.IP_NO
        AND ROOMTYPE.RT_CODE(+)  = BED.RT_CODE
        AND BED.BD_CODE          = RMALL.BD_CODE
        AND IPADMISS.SA_CODE     = SALUTATION.SA_CODE
        AND NURSTATION.NS_CODE   = BED.NS_CODE
        AND IPADMISS.DO_CODE     = DOCTOR.DO_CODE
        AND IPADMISS.IPD_DISC    IS NULL
        AND RMALL.RMC_RELESETYPE IS NULL
        AND BED.NS_CODE IN (${nsPlaceholders})
        AND IPADMISS.IPD_DATE    <= TO_DATE(:toDate, 'YYYY-MM-DD') + 1
      ORDER BY BED.BDC_NO, NURSTATION.NSC_DESC, IPADMISS.PTC_PTNAME
    `;
    [patients, hisBeds] = await Promise.all([
      hisQuery(historicalSql, binds),
      hisQuery(BED_LIST_SQL),
    ]);
  } else {
    // Today — serve from MySQL cache (fast)
    const [cachedOcc, cachedBeds] = await Promise.all([
      query(`SELECT pt_no AS PT_NO, bed AS BED, room_type AS ROOM_TYPE, pt_name AS PT_NAME,
                    address AS ADDRESS, occupied_by AS OCCUPIED_BY, doctor AS DOCTOR,
                    DATE_FORMAT(admission_date,'%d/%m/%Y %h:%i:%s %p') AS ADMISSION_DATE,
                    nur_station AS NUR_STATION
             FROM \`HisOccupancyCache\`
             ORDER BY bed, nur_station, pt_name`),
      query(`SELECT bed_no AS BED_NO, nur_station AS NUR_STATION, ns_short AS NS_SHORT,
                    room_no AS ROOM_NO, room_type AS ROOM_TYPE, his_status AS HIS_STATUS
             FROM \`HisBedCache\`
             ORDER BY nur_station, bed_no`),
    ]);
    patients = cachedOcc;
    hisBeds  = cachedBeds;
  }

  if (hisBeds.length === 0) {
    return res.json({
      stats: { totalBeds: 0, activeBeds: 0, inactiveBeds: 0, occupiedBeds: 0, availableBeds: 0 },
      patients: [], beds: [], roomTypeStats: [],
    });
  }

  const [overrideRows, restrictedRows, prebookRows] = await Promise.all([
    query('SELECT `bedNo`, `status` FROM `BedOverrides`'),
    query('SELECT `roomType` FROM `RoomTypeRestrictions`'),
    query(`SELECT \`bedNo\` FROM \`Prebookings\`
           WHERE \`status\` = 'Confirmed'
             AND \`bookedDate\` BETWEEN
               DATE_SUB(CURDATE(), INTERVAL 3 DAY) AND
               DATE_ADD(CURDATE(), INTERVAL 3 DAY)`),
  ]);

  const overrideMap    = Object.fromEntries(overrideRows.map(r => [r.bedNo, r.status]));
  const restrictedSet  = new Set(restrictedRows.map(r => r.roomType));
  const prebookedBedNos = new Set(prebookRows.map(r => r.bedNo));

  const beds = hisBeds.map(b => ({
    ...b,
    STATUS: overrideMap[b.BED_NO] ?? b.HIS_STATUS,
  }));

  const occupiedBedNos = new Set(patients.map(p => p.BED));
  const occupiedCount  = occupiedBedNos.size;
  const patientCount   = patients.filter(p => p.OCCUPIED_BY === 'Patient').length;
  const bystanderCount = patients.filter(p => p.OCCUPIED_BY === 'Bystander').length;

  const totalBeds      = beds.length;
  const activeBeds     = beds.filter(b => b.STATUS === 'Active').length;
  const inactiveBeds   = beds.filter(b => b.STATUS === 'Inactive').length;
  const restrictedBeds = beds.filter(b => b.STATUS === 'Active' && restrictedSet.has(b.ROOM_TYPE)).length;

  const prebookedCount = beds.filter(b =>
    b.STATUS === 'Active' &&
    !restrictedSet.has(b.ROOM_TYPE) &&
    !occupiedBedNos.has(b.BED_NO) &&
    prebookedBedNos.has(b.BED_NO)
  ).length;

  const bookableActive = Math.max(0, activeBeds - restrictedBeds);
  const availableBeds  = Math.max(0, bookableActive - occupiedCount - prebookedCount);

  const rtMap = {};
  for (const b of beds) {
    const rt = b.ROOM_TYPE || 'Unknown';
    if (!rtMap[rt]) rtMap[rt] = { total: 0, occupied: 0 };
    rtMap[rt].total += 1;
    if (occupiedBedNos.has(b.BED_NO)) rtMap[rt].occupied += 1;
  }
  const roomTypeStats = Object.entries(rtMap)
    .map(([roomType, v]) => ({ roomType, ...v }))
    .sort((a, b) => a.roomType.localeCompare(b.roomType));

  res.json({
    stats: { totalBeds, activeBeds, inactiveBeds, occupiedBeds: occupiedCount,
             availableBeds, patientCount, bystanderCount, prebookedBeds: prebookedCount, restrictedBeds },
    patients,
    beds,
    roomTypeStats,
    cachedAt: lastHisSyncTime,
  });
});

// ── getDischargeInitiated — reads from MySQL DischargeSnapshots ───────────────
exports.getDischargeInitiated = asyncHandler(async (req, res) => {
  const { fromDate, toDate } = req.query;

  const conditions = ['1=1'];
  const params     = [];
  if (fromDate && toDate) {
    // Include if disc_req_date OR disc_billed_time falls in the range
    conditions.push('(disc_req_date BETWEEN ? AND ? OR disc_billed_time BETWEEN ? AND ?)');
    params.push(`${fromDate} 00:00:00`, `${toDate} 23:59:59`, `${fromDate} 00:00:00`, `${toDate} 23:59:59`);
  } else if (fromDate) {
    conditions.push('(disc_req_date >= ? OR disc_billed_time >= ?)');
    params.push(`${fromDate} 00:00:00`, `${fromDate} 00:00:00`);
  } else if (toDate) {
    conditions.push('(disc_req_date <= ? OR disc_billed_time <= ?)');
    params.push(`${toDate} 23:59:59`, `${toDate} 23:59:59`);
  }

  const rows = await query(
    `SELECT
       pt_no           AS PT_NO,
       pt_name         AS PT_NAME,
       address         AS ADDRESS,
       bed             AS BED,
       room_type       AS ROOM_TYPE,
       doctor          AS DOCTOR,
       department      AS DEPARTMENT,
       nur_station     AS NUR_STATION,
       DATE_FORMAT(admission_date,   '%d/%m/%Y %h:%i:%s %p') AS ADMISSION_DATE,
       DATE_FORMAT(disc_req_date,    '%d/%m/%Y %h:%i:%s %p') AS DISC_REQ_DATE,
       DATE_FORMAT(disc_entry_time,  '%d/%m/%Y %h:%i:%s %p') AS DISC_ENTRY_TIME,
       DATE_FORMAT(disc_billed_time, '%d/%m/%Y %h:%i:%s %p') AS DISC_BILLED_TIME,
       disc_status     AS DISC_STATUS,
       first_seen_at   AS FIRST_SEEN_AT,
       last_synced_at  AS LAST_SYNCED_AT
     FROM \`DischargeSnapshots\`
     WHERE ${conditions.join(' AND ')}
     ORDER BY disc_req_date DESC, bed ASC`,
    params
  );

  res.json({ patients: rows, lastSyncedAt: lastHisSyncTime });
});

// ── Toggle bed status — writes to MySQL BedOverrides ─────────────────────────
exports.toggleBedStatus = asyncHandler(async (req, res) => {
  const { bedNo } = req.params;
  const { currentStatus } = req.body;
  if (!currentStatus) { res.status(400); throw new Error('currentStatus is required'); }

  const newStatus = currentStatus === 'Active' ? 'Inactive' : 'Active';
  await query(
    `INSERT INTO \`BedOverrides\` (\`bedNo\`, \`status\`)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE \`status\` = VALUES(\`status\`)`,
    [bedNo, newStatus]
  );
  res.json({ bedNo, status: newStatus });
});

// ── getNullRoomTypeBeds — diagnostic: beds currently occupied with no RT_CODE ─
exports.getNullRoomTypeBeds = asyncHandler(async (req, res) => {
  const rows = await query(
    `SELECT bed AS BED_NO, pt_no AS PT_NO, pt_name AS PT_NAME,
            occupied_by AS OCCUPIED_BY, doctor AS DOCTOR,
            nur_station AS NUR_STATION,
            DATE_FORMAT(admission_date,'%d/%m/%Y %h:%i:%s %p') AS ADMISSION_DATE
     FROM \`HisOccupancyCache\`
     WHERE room_type IS NULL
     ORDER BY bed`
  );
  res.json({ count: rows.length, beds: rows });
});

// ── syncHISBedDetailsNow — manually sync HIS bed & room + admission date + status to Prebookings ────
exports.syncHISBedDetailsNow = asyncHandler(async (req, res) => {
  console.log('[HIS-Sync] Manual sync triggered');

  // Get ALL bookings (not just Admitted) to sync status based on HIS data
  const [prebookings] = await Promise.all([
    query('SELECT id, patientName, patientId FROM Prebookings')
  ]);

  if (prebookings.length === 0) {
    res.json({ message: 'No patients to sync', updated: 0, admitted: 0, confirmed: 0 });
    return;
  }

  // Get all HIS occupancy cache records
  const [hisCache] = await Promise.all([
    query('SELECT pt_no, bed, room_type, admission_date FROM HisOccupancyCache')
  ]);

  // Create map by PT_NO for fast lookup
  const hisMapByPtNo = new Map();
  for (const occupancy of hisCache) {
    if (!hisMapByPtNo.has(occupancy.pt_no)) {
      hisMapByPtNo.set(occupancy.pt_no, {
        bed: occupancy.bed,
        room_type: occupancy.room_type,
        admission_date: occupancy.admission_date
      });
    }
  }

  let updated = 0;
  let admitted = 0;
  let confirmed = 0;
  let noPatientId = 0;

  console.log(`\n📋 Processing ${prebookings.length} patients...\n`);

  // Update each patient's HIS data AND status based on HIS presence
  for (const booking of prebookings) {
    if (!booking.patientId) {
      // No Patient ID → Cannot find in HIS → Set to Confirmed
      console.log(`[HIS-Sync] ❌ ID ${booking.id}: ${booking.patientName} → CONFIRMED (no Patient ID)`);
      await query(
        'UPDATE Prebookings SET hisBed = NULL, hisRoom = NULL, hisAdmissionDate = NULL, status = "Confirmed", admittedBy = NULL, admittedAt = NULL WHERE id = ?',
        [booking.id]
      );
      updated++;
      confirmed++;
      noPatientId++;
      continue;
    }

    const hisData = hisMapByPtNo.get(booking.patientId);

    if (hisData) {
      // Patient found in HIS → Admitted with HIS data
      await query(
        'UPDATE Prebookings SET hisBed = ?, hisRoom = ?, hisAdmissionDate = ?, status = "Admitted", admittedBy = "HIS-Sync", admittedAt = NOW() WHERE id = ?',
        [hisData.bed, hisData.room_type, hisData.admission_date, booking.id]
      );
      const dateStr = hisData.admission_date ? new Date(hisData.admission_date).toLocaleString('en-GB') : 'NULL';
      console.log(`[HIS-Sync] ✅ ID ${booking.id}: ${booking.patientName} → ADMITTED (Bed: ${hisData.bed}, Admitted: ${dateStr})`);
      updated++;
      admitted++;
    } else {
      // Patient NOT found in HIS → Confirmed (no HIS data)
      await query(
        'UPDATE Prebookings SET hisBed = NULL, hisRoom = NULL, hisAdmissionDate = NULL, status = "Confirmed", admittedBy = NULL, admittedAt = NULL WHERE id = ?',
        [booking.id]
      );
      console.log(`[HIS-Sync] ❌ ID ${booking.id}: ${booking.patientName} → CONFIRMED (not in HIS)`);
      updated++;
      confirmed++;
    }
  }

  console.log(`\n[HIS-Sync] Complete: Updated=${updated}, Admitted=${admitted}, Confirmed=${confirmed}, No Patient ID=${noPatientId}\n`);
  res.json({
    message: 'HIS sync complete - status set based on HIS presence',
    updated,
    admitted,
    confirmed,
    noPatientId,
    total: prebookings.length
  });
});
