const patientService = require('../services/patientService');
const asyncHandler = require('express-async-handler');

exports.createPatient = asyncHandler(async (req, res) => {
  const patient = await patientService.createPatient(req.body);
  res.status(201).json(patient);
});

exports.getPatients = asyncHandler(async (req, res) => {
  const filters = req.query;
  const patients = await patientService.getPatients(filters);
  res.json(patients);
});

exports.getPatientById = asyncHandler(async (req, res) => {
  const patient = await patientService.getPatientById(req.params.id);
  if (!patient) {
    res.status(404);
    throw new Error('Patient not found');
  }
  res.json(patient);
});

exports.updatePatient = asyncHandler(async (req, res) => {
  const patient = await patientService.updatePatient(req.params.id, req.body);
  if (!patient) {
    res.status(404);
    throw new Error('Patient not found');
  }
  res.json(patient);
});

exports.getOccupiedBedsFromHIS = asyncHandler(async (req, res) => {
  const patients = await patientService.getOccupiedBedsFromHIS();
  res.json(patients);
});

exports.searchPatientFromHIS = asyncHandler(async (req, res) => {
  const { q } = req.query;
  if (!q) {
    res.status(400);
    throw new Error('Search query required');
  }
  const patients = await patientService.searchPatientFromHIS(q);
  res.json(patients);
});

exports.syncPatientFromHIS = asyncHandler(async (req, res) => {
  const { uhid } = req.params;
  const patient = await patientService.syncPatientFromHIS(uhid);
  res.json(patient);
});