const billingService = require('../services/billingService');
const asyncHandler = require('express-async-handler');

exports.calculateRoomCharges = asyncHandler(async (req, res) => {
  const billing = await billingService.calculateRoomCharges(req.params.admissionId);
  res.json(billing);
});

exports.addICUCharges = asyncHandler(async (req, res) => {
  const { days, surcharge } = req.body;
  const billing = await billingService.addICUCharges(req.params.admissionId, days, surcharge);
  res.json(billing);
});

exports.syncToHIS = asyncHandler(async (req, res) => {
  const billing = await billingService.syncToHIS(req.params.id);
  res.json(billing);
});

exports.getBillingByAdmission = asyncHandler(async (req, res) => {
  const billing = await billingService.getBillingByAdmission(req.params.admissionId);
  if (!billing) {
    res.status(404);
    throw new Error('Billing not found');
  }
  res.json(billing);
});

exports.updatePayment = asyncHandler(async (req, res) => {
  const { paidAmount } = req.body;
  const billing = await billingService.updatePayment(req.params.id, paidAmount);
  res.json(billing);
});