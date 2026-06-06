const bedService = require('../services/bedService');
const asyncHandler = require('express-async-handler');

exports.createBed = asyncHandler(async (req, res) => {
  const bed = await bedService.createBed(req.body);
  res.status(201).json(bed);
});

exports.getBeds = asyncHandler(async (req, res) => {
  const filters = req.query;
  const beds = await bedService.getBeds(filters);
  res.json(beds);
});

exports.getBedById = asyncHandler(async (req, res) => {
  const bed = await bedService.getBedById(req.params.id);
  if (!bed) {
    res.status(404);
    throw new Error('Bed not found');
  }
  res.json(bed);
});

exports.updateBedStatus = asyncHandler(async (req, res) => {
  const { status, patientId } = req.body;
  const bed = await bedService.updateBedStatus(req.params.id, status, patientId);
  if (!bed) {
    res.status(404);
    throw new Error('Bed not found');
  }
  res.json(bed);
});

exports.transferBed = asyncHandler(async (req, res) => {
  const { newRoomId } = req.body;
  const bed = await bedService.transferBed(req.params.id, newRoomId);
  res.json(bed);
});

exports.getBedHistory = asyncHandler(async (req, res) => {
  const history = await bedService.getBedHistory(req.params.id);
  res.json(history);
});