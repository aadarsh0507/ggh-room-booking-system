const express = require('express');
const router = express.Router();
const {
  createBed,
  getBeds,
  getBedById,
  updateBedStatus,
  transferBed,
  getBedHistory,
} = require('../controllers/bedController');
const { protect, authorize } = require('../middleware/auth');

router
  .route('/')
  .post(protect, authorize('Admin'), createBed)
  .get(protect, getBeds);

router
  .route('/:id')
  .get(protect, getBedById)
  .put(protect, authorize('Nurse', 'Admin'), updateBedStatus);

router.route('/:id/transfer').put(protect, authorize('Nurse', 'Admin'), transferBed);
router.route('/:id/history').get(protect, getBedHistory);

module.exports = router;