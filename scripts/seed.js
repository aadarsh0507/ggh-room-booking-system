const mongoose = require('../backend/node_modules/mongoose');
const User = require('../backend/src/models/User');
const Room = require('../backend/src/models/Room');
const dotenv = require('../backend/node_modules/dotenv');
dotenv.config({ path: '../backend/.env' });

const seedData = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    // Create admin user
    const adminUser = await User.create({
      username: 'admin',
      email: 'admin@hospital.com',
      password: 'admin123',
      role: 'Admin',
    });

    // Create sample rooms
    const rooms = [
      {
        roomNumber: '101',
        floor: '1',
        wing: 'A',
        category: 'General Ward',
        bedCount: 4,
        price: 100,
        amenities: ['TV', 'WiFi'],
      },
      {
        roomNumber: '102',
        floor: '1',
        wing: 'A',
        category: 'Semi Private',
        bedCount: 2,
        price: 200,
        amenities: ['TV', 'WiFi', 'AC'],
      },
      {
        roomNumber: '201',
        floor: '2',
        wing: 'B',
        category: 'Private',
        bedCount: 1,
        price: 500,
        amenities: ['TV', 'WiFi', 'AC', 'Refrigerator'],
      },
      {
        roomNumber: 'ICU-001',
        floor: '3',
        wing: 'ICU',
        category: 'ICU',
        bedCount: 1,
        price: 1000,
        amenities: ['Ventilator', 'Monitor'],
      },
    ];

    for (const roomData of rooms) {
      await require('../src/services/roomService').createRoom(roomData);
    }

    console.log('Database seeded successfully');
    process.exit(0);
  } catch (error) {
    console.error('Seeding error:', error);
    process.exit(1);
  }
};

seedData();