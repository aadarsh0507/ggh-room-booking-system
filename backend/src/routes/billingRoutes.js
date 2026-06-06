const express = require('express');
const router = express.Router();
const {
  calculateRoomCharges,
  addICUCharges,
  syncToHIS,
  getBillingByAdmission,
  updatePayment,
} = require('../controllers/billingController');
const { protect, authorize } = require('../middleware/auth');

router.route('/admission/:admissionId').get(protect, getBillingByAdmission);
router.route('/admission/:admissionId/charges').post(protect, authorize('Billing', 'Admin'), calculateRoomCharges);
router.route('/admission/:admissionId/icu').post(protect, authorize('Billing', 'Admin'), addICUCharges);
router.route('/:id/sync').post(protect, authorize('Billing', 'Admin'), syncToHIS);
router.route('/:id/payment').put(protect, authorize('Billing', 'Admin'), updatePayment);

module.exports = router;