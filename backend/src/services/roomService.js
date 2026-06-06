const Room = require('../models/Room');
const Bed = require('../models/Bed');

class RoomService {
  async createRoom(roomData) {
    const room = await Room.create(roomData);

    const beds = [];
    for (let i = 1; i <= roomData.bedCount; i++) {
      beds.push({ bedNumber: `${room.roomNumber}-B${i}`, roomId: room.id });
    }
    await Bed.insertMany(beds);

    return room;
  }

  async getRooms(filters = {}) {
    return Room.findAll(filters);
  }

  async getRoomById(id) {
    return Room.findById(id);
  }

  async updateRoom(id, updateData) {
    return Room.update(id, updateData);
  }

  async deleteRoom(id) {
    const room = await Room.findById(id);
    if (!room) throw new Error('Room not found');

    const occupiedBeds = await Bed.findOccupied(id);
    if (occupiedBeds.length > 0) {
      throw new Error('Cannot delete room with occupied beds');
    }

    await Bed.deleteByRoom(id);
    await Room.remove(id);
  }

  async getRoomAvailability() {
    return Room.getAvailability();
  }
}

module.exports = new RoomService();
