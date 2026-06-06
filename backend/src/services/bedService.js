const Bed = require('../models/Bed');
const Room = require('../models/Room');

class BedService {
  async createBed(bedData) {
    return Bed.create(bedData);
  }

  async getBeds(filters = {}) {
    return Bed.findAll(filters);
  }

  async getBedById(id) {
    return Bed.findById(id);
  }

  async updateBedStatus(id, status, patientId = null) {
    return Bed.updateStatus(id, status, patientId);
  }

  async transferBed(bedId, newRoomId) {
    const bed = await Bed.findById(bedId);
    if (!bed) throw new Error('Bed not found');

    const newRoom = await Room.findById(newRoomId);
    if (!newRoom) throw new Error('New room not found');

    if (bed.status === 'Occupied') {
      throw new Error('Cannot transfer occupied bed');
    }

    return Bed.updateRoom(bedId, newRoomId);
  }

  async getBedHistory(bedId) {
    return this.getBedById(bedId);
  }
}

module.exports = new BedService();
