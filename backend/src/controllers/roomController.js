const roomService = require('../services/roomService');
const asyncHandler = require('express-async-handler');

exports.createRoom = asyncHandler(async (req, res) => {
  const room = await roomService.createRoom(req.body);
  res.status(201).json(room);
});

exports.getRooms = asyncHandler(async (req, res) => {
  const filters = req.query;
  const rooms = await roomService.getRooms(filters);
  res.json(rooms);
});

exports.getRoomById = asyncHandler(async (req, res) => {
  const room = await roomService.getRoomById(req.params.id);
  if (!room) {
    res.status(404);
    throw new Error('Room not found');
  }
  res.json(room);
});

exports.updateRoom = asyncHandler(async (req, res) => {
  const room = await roomService.updateRoom(req.params.id, req.body);
  if (!room) {
    res.status(404);
    throw new Error('Room not found');
  }
  res.json(room);
});

exports.deleteRoom = asyncHandler(async (req, res) => {
  await roomService.deleteRoom(req.params.id);
  res.json({ message: 'Room deleted' });
});

exports.getRoomAvailability = asyncHandler(async (req, res) => {
  const availability = await roomService.getRoomAvailability();
  res.json(availability);
});