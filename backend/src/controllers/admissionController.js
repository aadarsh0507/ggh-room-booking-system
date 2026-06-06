const admissionService = require('../services/admissionService');
const asyncHandler = require('express-async-handler');

exports.admitPatient = asyncHandler(async (req, res) => {
  const admissionData = { ...req.body, createdBy: req.user._id };
  const admission = await admissionService.admitPatient(admissionData);
  res.status(201).json(admission);
});

exports.getAdmissions = asyncHandler(async (req, res) => {
  const filters = req.query;
  const admissions = await admissionService.getAdmissions(filters);
  res.json(admissions);
});

exports.getAdmissionById = asyncHandler(async (req, res) => {
  const admission = await admissionService.getAdmissionById(req.params.id);
  if (!admission) {
    res.status(404);
    throw new Error('Admission not found');
  }
  res.json(admission);
});

exports.dischargePatient = asyncHandler(async (req, res) => {
  const { dischargeDate } = req.body;
  const admission = await admissionService.dischargePatient(req.params.id, dischargeDate);
  res.json(admission);
});