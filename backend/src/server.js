require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { connectDB, connectHIS } = require('./config/database');
const { logger, auditLogger } = require('./middleware/logger');

const app = express();

// Environment setup
const isProduction = process.env.NODE_ENV === 'production';
const isInternalLAN = process.env.INTERNAL_LAN === 'true';

console.log(`NODE_ENV: ${process.env.NODE_ENV}, INTERNAL_LAN: ${isInternalLAN}`);

// Connect to database then bootstrap tables (order matters for FK constraints)
connectDB().then(async () => {
  const models = [
    require('./models/User'),
    require('./models/Room'),
    require('./models/Patient'),
    require('./models/Bed'),
    require('./models/Admission'),
    require('./models/Billing'),
    require('./models/Transfer'),
    require('./models/AuditLog'),
    require('./models/Notification'),
  ];
  for (const model of models) {
    await model.createTable();
  }
  console.log('All tables ready');
});

connectHIS();

// Middleware

// Configure Helmet based on deployment type
if (isInternalLAN) {
  console.log('HTTP-only mode: Helmet completely disabled for internal LAN');
  // For internal LAN: DO NOT USE HELMET AT ALL
  // Helmet always adds some headers; we disable it entirely
} else {
  console.log('Internet mode: Using full Helmet security');
  // For internet: use full Helmet with all protections
  app.use(helmet());
}

app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
}));
app.use(express.json());
app.use(logger);
app.use(auditLogger);

// Routes
app.use('/api/auth',      require('./routes/authRoutes'));
app.use('/api/dashboard', require('./routes/dashboardRoutes'));
app.use('/api/rooms', require('./routes/roomRoutes'));
app.use('/api/beds', require('./routes/bedRoutes'));
app.use('/api/patients', require('./routes/patientRoutes'));
app.use('/api/admissions', require('./routes/admissionRoutes'));
app.use('/api/billing',     require('./routes/billingRoutes'));
app.use('/api/prebooking', require('./routes/prebookingRoutes'));
app.use('/api/users',     require('./routes/userRoutes'));

// Swagger
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Hospital Room Booking API',
      version: '1.0.0',
      description: 'API for hospital room booking and allotment system',
    },
    servers: [
      {
        url: 'http://localhost:5000',
      },
    ],
  },
  apis: ['./src/routes/*.js'],
};

const specs = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));

// FINAL middleware - Strip HTTPS-forcing headers for internal LAN (runs after ALL responses)
if (isInternalLAN) {
  app.use((req, res, next) => {
    // Override res.set and res.removeHeader to prevent headers from being set
    const originalSet = res.set;
    const originalRemove = res.removeHeader;

    res.set = function(field, value) {
      // Block HTTPS-forcing headers
      if (typeof field === 'string') {
        const lowerField = field.toLowerCase();
        if (
          lowerField === 'strict-transport-security' ||
          lowerField === 'content-security-policy' ||
          lowerField === 'x-frame-options' ||
          lowerField === 'x-content-type-options' ||
          lowerField === 'x-xss-protection' ||
          lowerField === 'referrer-policy' ||
          lowerField === 'x-dns-prefetch-control' ||
          lowerField === 'cross-origin-opener-policy' ||
          lowerField === 'cross-origin-resource-policy' ||
          lowerField === 'origin-agent-cluster'
        ) {
          console.log(`[BLOCKED] Header: ${field}`);
          return res; // Don't set it
        }
      }
      return originalSet.call(this, field, value);
    };

    next();
  });
}

// Error handling
app.use((err, req, res, next) => {
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  res.status(statusCode);
  res.json({
    message: err.message,
    stack: process.env.NODE_ENV === 'production' ? null : err.stack,
  });
});

// Serve React frontend in production (static files copied into /app/frontend/build)
const path = require('path');
const buildDir = path.join(__dirname, '../frontend/build');
const fs = require('fs');

// Serve static files (CSS, JS, images, etc.)
app.use(express.static(buildDir, { maxAge: '1y' }));

if (fs.existsSync(buildDir)) {
  console.log('Serving React build from:', buildDir);
  // Catch-all for React Router - ONLY for non-API routes
  app.get('/', (req, res) => res.sendFile(path.join(buildDir, 'index.html')));
  app.get('/about', (req, res) => res.sendFile(path.join(buildDir, 'index.html')));
  app.get('/dashboard', (req, res) => res.sendFile(path.join(buildDir, 'index.html')));
  app.get('/rooms', (req, res) => res.sendFile(path.join(buildDir, 'index.html')));
  app.get('/patients', (req, res) => res.sendFile(path.join(buildDir, 'index.html')));
  app.get('/admissions', (req, res) => res.sendFile(path.join(buildDir, 'index.html')));
  app.get('/billing', (req, res) => res.sendFile(path.join(buildDir, 'index.html')));
  app.get('/reports', (req, res) => res.sendFile(path.join(buildDir, 'index.html')));
  app.get('/settings', (req, res) => res.sendFile(path.join(buildDir, 'index.html')));
  app.get('/login', (req, res) => res.sendFile(path.join(buildDir, 'index.html')));
  // Fallback catch-all for unmapped routes (nested routes)
  app.use((req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(buildDir, 'index.html'));
    } else {
      res.status(404).json({ message: 'Route not found' });
    }
  });
} else {
  console.log('No React build found at:', buildDir);
}

const PORT = process.env.PORT || 5000; // Always use port 5000, even on internal LAN

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);

  // Auto-sync HIS bed & room details + admission dates + status to Prebookings table every 5 minutes
  const { query } = require('./config/database');

  const syncHISBedDetailsAuto = async () => {
    try {
      // Get ALL bookings (not just Admitted) to sync status based on HIS data
      const [prebookings] = await Promise.all([
        query('SELECT id, patientName, patientId FROM Prebookings')
      ]);

      if (prebookings.length === 0) return;

      const [hisCache] = await Promise.all([
        query('SELECT pt_no, bed, room_type, admission_date FROM HisOccupancyCache')
      ]);

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
      for (const booking of prebookings) {
        if (!booking.patientId) {
          // No Patient ID → Cannot find in HIS → Set to Confirmed
          await query(
            'UPDATE Prebookings SET hisBed = NULL, hisRoom = NULL, hisAdmissionDate = NULL, status = "Confirmed", admittedBy = NULL, admittedAt = NULL WHERE id = ?',
            [booking.id]
          );
          console.log(`[HIS-AutoSync] ❌ ID ${booking.id}: ${booking.patientName} → Confirmed (no Patient ID)`);
          updated++;
          continue;
        }

        const hisData = hisMapByPtNo.get(booking.patientId);

        if (hisData) {
          // Patient found in HIS → Set to Admitted with HIS data
          await query(
            'UPDATE Prebookings SET hisBed = ?, hisRoom = ?, hisAdmissionDate = ?, status = "Admitted", admittedBy = "HIS-Sync", admittedAt = NOW() WHERE id = ?',
            [hisData.bed, hisData.room_type, hisData.admission_date, booking.id]
          );
          console.log(`[HIS-AutoSync] ✅ ID ${booking.id}: ${booking.patientName} → Admitted (in HIS: ${hisData.bed})`);
          updated++;
        } else {
          // Patient NOT found in HIS → Set to Confirmed (no HIS data)
          await query(
            'UPDATE Prebookings SET hisBed = NULL, hisRoom = NULL, hisAdmissionDate = NULL, status = "Confirmed", admittedBy = NULL, admittedAt = NULL WHERE id = ?',
            [booking.id]
          );
          console.log(`[HIS-AutoSync] ❌ ID ${booking.id}: ${booking.patientName} → Confirmed (not in HIS)`);
          updated++;
        }
      }

      if (updated > 0) {
        console.log(`[HIS-AutoSync] Synced ${updated} patients at ${new Date().toLocaleTimeString()}`);
      }
    } catch (err) {
      console.error('[HIS-AutoSync] Error:', err.message);
    }
  };

  // Run sync immediately on startup, then every 5 minutes
  syncHISBedDetailsAuto();
  setInterval(syncHISBedDetailsAuto, 5 * 60 * 1000);
  console.log('[HIS-AutoSync] Enabled - syncing status based on HIS data every 5 minutes');
});

// Socket.IO for real-time updates
const io = require('socket.io')(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
  },
});

io.on('connection', (socket) => {
  console.log('Client connected');

  socket.on('join-room', (roomId) => {
    socket.join(roomId);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

// Make io accessible in routes
app.set('io', io);

module.exports = app;