const dotenv = require('dotenv');
dotenv.config();

const { connectDB } = require('../src/config/database');
const User = require('../src/models/User');
const roomService = require('../src/services/roomService');

const seedData = async () => {
  try {
    await connectDB();

    // Create default admin from .env credentials
    const existing = await User.findByEmail(process.env.DEFAULT_ADMIN_EMAIL);
    if (!existing) {
      await User.create({
        username: process.env.DEFAULT_ADMIN_USERNAME,
        email:    process.env.DEFAULT_ADMIN_EMAIL,
        password: process.env.DEFAULT_ADMIN_PASSWORD,
        role:     'Admin',
      });
      console.log(`Admin user created: ${process.env.DEFAULT_ADMIN_EMAIL}`);
    } else {
      console.log('Admin user already exists, skipping.');
    }

    const rooms = [
      { roomNumber: '101',     floor: '1', wing: 'A',   category: 'General Ward', bedCount: 4, price: 100,  amenities: ['TV', 'WiFi'] },
      { roomNumber: '102',     floor: '1', wing: 'A',   category: 'Semi Private', bedCount: 2, price: 200,  amenities: ['TV', 'WiFi', 'AC'] },
      { roomNumber: '201',     floor: '2', wing: 'B',   category: 'Private',      bedCount: 1, price: 500,  amenities: ['TV', 'WiFi', 'AC', 'Refrigerator'] },
      { roomNumber: 'ICU-001', floor: '3', wing: 'ICU', category: 'ICU',          bedCount: 1, price: 1000, amenities: ['Ventilator', 'Monitor'] },
    ];

    for (const roomData of rooms) {
      await roomService.createRoom(roomData);
    }

    console.log('Database seeded successfully');
    process.exit(0);
  } catch (error) {
    console.error('Seeding error:', error.message);
    process.exit(1);
  }
};

seedData();
