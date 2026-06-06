const mysql = require('mysql2/promise');

(async () => {
  try {
    const conn = await mysql.createConnection({
      host: '172.16.6.214',
      user: 'ggh',
      password: '@dmserverin',
      database: 'demo_room_booking'
    });

    console.log('🔄 Creating tables in demo_room_booking...\n');

    // 1. Prebookings table
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS Prebookings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        bedNo VARCHAR(50),
        roomType VARCHAR(100),
        nurStation VARCHAR(100),
        roomNo VARCHAR(50),
        patientName VARCHAR(100),
        patientPhone VARCHAR(20),
        patientAge INT,
        patientGender ENUM('Male', 'Female', 'Other'),
        doctorName VARCHAR(100),
        notes TEXT,
        bookedDate DATE,
        bookedBy VARCHAR(100),
        clientIp VARCHAR(50),
        userAgent TEXT,
        status ENUM('Confirmed', 'Admitted', 'Discharged', 'Cancelled') DEFAULT 'Confirmed',
        cancelledBy VARCHAR(100),
        cancelledAt DATETIME,
        admittedBy VARCHAR(100),
        admittedAt DATETIME,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        priority ENUM('Emergency', 'VIP', 'Regular') DEFAULT 'Regular',
        priorityCategory ENUM('General', 'Emergency', 'Labour', 'Senior Citizen', 'Pediatric', 'Differently Abled'),
        admissionReason VARCHAR(255),
        escalatedAt DATETIME,
        advanceCollected TINYINT DEFAULT 0,
        advanceAmount DECIMAL(10, 2) DEFAULT 0,
        INDEX idx_status (status),
        INDEX idx_priority (priority),
        INDEX idx_patientName (patientName),
        INDEX idx_bookedDate (bookedDate)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('✅ Prebookings table created');

    // 2. Rooms table
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS Rooms (
        id INT AUTO_INCREMENT PRIMARY KEY,
        roomNo VARCHAR(50) UNIQUE,
        roomType VARCHAR(50),
        floor INT,
        capacity INT,
        status ENUM('Available', 'Occupied', 'Maintenance') DEFAULT 'Available',
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_status (status),
        INDEX idx_roomType (roomType)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('✅ Rooms table created');

    // 3. Beds table
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS Beds (
        id INT AUTO_INCREMENT PRIMARY KEY,
        bedNo VARCHAR(50) UNIQUE,
        roomId INT,
        status ENUM('Available', 'Occupied', 'Cleaning') DEFAULT 'Available',
        genderSection VARCHAR(50),
        isolation TINYINT DEFAULT 0,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (roomId) REFERENCES Rooms(id),
        INDEX idx_status (status),
        INDEX idx_bedNo (bedNo)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('✅ Beds table created');

    // 4. Users table
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS Users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(100) UNIQUE,
        email VARCHAR(100) UNIQUE,
        password VARCHAR(255),
        role ENUM('Admin', 'Receptionist', 'Nurse', 'Billing', 'Doctor') DEFAULT 'Receptionist',
        branch VARCHAR(100),
        active TINYINT DEFAULT 1,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_username (username),
        INDEX idx_role (role)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('✅ Users table created');

    // 5. Admissions table
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS Admissions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        prebookingId INT,
        bedNo VARCHAR(50),
        admittedDate DATETIME,
        dischargedDate DATETIME,
        status ENUM('Active', 'Discharged') DEFAULT 'Active',
        notes TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (prebookingId) REFERENCES Prebookings(id),
        INDEX idx_status (status),
        INDEX idx_admittedDate (admittedDate)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('✅ Admissions table created');

    // 6. Patients table
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS Patients (
        id INT AUTO_INCREMENT PRIMARY KEY,
        patientName VARCHAR(100),
        patientPhone VARCHAR(20),
        patientEmail VARCHAR(100),
        age INT,
        gender ENUM('Male', 'Female', 'Other'),
        address TEXT,
        city VARCHAR(100),
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_patientName (patientName)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('✅ Patients table created');

    // 7. Billing table
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS Billing (
        id INT AUTO_INCREMENT PRIMARY KEY,
        prebookingId INT,
        totalAmount DECIMAL(10, 2),
        advanceAmount DECIMAL(10, 2),
        balanceAmount DECIMAL(10, 2),
        status ENUM('Pending', 'Paid', 'Partial') DEFAULT 'Pending',
        syncedToHIS TINYINT DEFAULT 0,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (prebookingId) REFERENCES Prebookings(id),
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('✅ Billing table created');

    // 8. Transfer table
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS Transfer (
        id INT AUTO_INCREMENT PRIMARY KEY,
        prebookingId INT,
        fromBedNo VARCHAR(50),
        toBedNo VARCHAR(50),
        transferReason VARCHAR(255),
        transferDate DATETIME,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (prebookingId) REFERENCES Prebookings(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('✅ Transfer table created');

    // 9. AuditLog table
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS AuditLog (
        id INT AUTO_INCREMENT PRIMARY KEY,
        userId INT,
        action VARCHAR(100),
        entity VARCHAR(100),
        entityId INT,
        oldValue JSON,
        newValue JSON,
        ipAddress VARCHAR(50),
        userAgent TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_action (action),
        INDEX idx_entity (entity)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('✅ AuditLog table created');

    // 10. Notification table
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS Notification (
        id INT AUTO_INCREMENT PRIMARY KEY,
        prebookingId INT,
        patientPhone VARCHAR(20),
        message TEXT,
        type ENUM('WhatsApp', 'SMS', 'Email') DEFAULT 'WhatsApp',
        status ENUM('Pending', 'Sent', 'Failed') DEFAULT 'Pending',
        sentAt DATETIME,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (prebookingId) REFERENCES Prebookings(id),
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('✅ Notification table created');

    // 11. HisBedCache table
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS HisBedCache (
        id INT AUTO_INCREMENT PRIMARY KEY,
        bed_no VARCHAR(50) UNIQUE,
        ROOM_TYPE VARCHAR(50),
        gender_section VARCHAR(50),
        isolation TINYINT DEFAULT 0,
        status VARCHAR(50),
        lastSyncedAt DATETIME,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_bed_no (bed_no)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('✅ HisBedCache table created');

    // 12. HisOccupancyCache table
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS HisOccupancyCache (
        id INT AUTO_INCREMENT PRIMARY KEY,
        bed VARCHAR(50),
        patient_name VARCHAR(100),
        status VARCHAR(50),
        lastSyncedAt DATETIME,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_bed (bed)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('✅ HisOccupancyCache table created');

    // 13. DischargeLog table
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS DischargeLog (
        id INT AUTO_INCREMENT PRIMARY KEY,
        bed_no VARCHAR(50),
        discharge_datetime DATETIME,
        allocation_suggested_to_id INT,
        allocation_suggested_priority VARCHAR(50),
        allocation_suggested_at DATETIME,
        allocation_accepted TINYINT DEFAULT 0,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_bed_no (bed_no),
        INDEX idx_discharge_datetime (discharge_datetime)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('✅ DischargeLog table created');

    console.log('\n✅ ALL TABLES CREATED SUCCESSFULLY!\n');

    // Insert sample data
    console.log('📝 Inserting sample test data...\n');

    // Insert MANI test patient
    const futureDate = new Date(2026, 5, 12);
    await conn.execute(`
      INSERT INTO Prebookings
      (bedNo, roomType, nurStation, roomNo, patientName, patientPhone, patientAge, patientGender,
       doctorName, notes, bookedDate, bookedBy, status, priority, priorityCategory, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      'A2 - 205',
      'Non-AC Room',
      'Ward A',
      '205',
      'Mani',
      '9876543210',
      30,
      'Male',
      'Dr. Smith',
      'Test patient - MANI',
      futureDate,
      'admin',
      'Confirmed',
      'Regular',
      'General',
      new Date(),
      new Date()
    ]);
    console.log('✅ MANI test patient inserted (Status: Confirmed)');

    // Insert more test data
    await conn.execute(`
      INSERT INTO Prebookings
      (bedNo, roomType, nurStation, roomNo, patientName, patientPhone, patientAge, patientGender,
       doctorName, notes, bookedDate, bookedBy, status, priority, priorityCategory, createdAt, updatedAt)
      VALUES
      ('ICU-01', 'ICU', 'ICU Ward', '01', 'Vikram Patel', '8765432100', 45, 'Male', 'Dr. Gupta', 'Emergency admission', '2026-06-04', 'admin', 'Confirmed', 'Emergency', 'Emergency', NOW(), NOW()),
      ('WARD-B-205', 'Non-AC Room', 'Ward B', '205', 'Priya Singh', '8765432102', 35, 'Female', 'Dr. Patel', 'VIP patient', '2026-06-07', 'admin', 'Confirmed', 'VIP', 'General', NOW(), NOW()),
      ('A1-001', 'AC Room', 'Ward A', '001', 'John Doe', '8765432103', 50, 'Male', 'Dr. Smith', 'Regular admission', '2026-06-09', 'admin', 'Confirmed', 'Regular', 'General', NOW(), NOW()),
      ('WARD-C-310', 'AC Room', 'Ward C', '310', 'Anjali Desai', '8765432104', 40, 'Female', 'Dr. Mishra', 'Regular admission', '2026-06-11', 'admin', 'Confirmed', 'Regular', 'General', NOW(), NOW()),
      ('B1-001', 'Non-AC Room', 'Ward B', '001', 'Jane Smith', '8765432105', 60, 'Female', 'Dr. Johnson', 'Senior patient', '2026-06-11', 'admin', 'Confirmed', 'Regular', 'Senior Citizen', NOW(), NOW()),
      ('ICU1-001', 'ICU', 'ICU Ward', '001', 'Robert Brown', '8765432106', 55, 'Male', 'Dr. Lee', 'Critical care', '2026-06-07', 'admin', 'Admitted', 'Regular', 'General', NOW(), NOW()),
      ('ISOLATION-02', 'Isolation', 'Isolation Ward', '02', 'Suresh Reddy', '8765432107', 48, 'Male', 'Dr. Kumar', 'Isolation required', '2026-06-06', 'admin', 'Confirmed', 'Emergency', 'Emergency', NOW(), NOW()),
      ('WARD-A-101', 'AC Room', 'Ward A', '101', 'Rajesh Kumar', '8765432108', 52, 'Male', 'Dr. Sharma', 'Emergency case', '2026-06-09', 'admin', 'Confirmed', 'Emergency', 'Emergency', NOW(), NOW())
    `);
    console.log('✅ Test patients inserted');

    console.log('\n✨ Database setup completed successfully!');
    console.log('\n📊 Summary:');
    console.log('   • 13 tables created');
    console.log('   • 9 test patients inserted');
    console.log('   • Ready for testing');
    console.log('\n🎯 Test Data:');
    console.log('   • MANI (Confirmed) - Future date, won\'t auto-sync');
    console.log('   • Vikram Patel (Emergency)');
    console.log('   • Priya Singh (VIP)');
    console.log('   • Robert Brown (Admitted)');
    console.log('   • 5 more regular patients');

    await conn.end();

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
})();
