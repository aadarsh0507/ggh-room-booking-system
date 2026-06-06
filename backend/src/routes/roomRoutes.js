const express = require('express');
const router = express.Router();
const {
  createRoom,
  getRooms,
  getRoomById,
  updateRoom,
  deleteRoom,
  getRoomAvailability,
} = require('../controllers/roomController');
const { protect, authorize } = require('../middleware/auth');
const { roomValidation, handleValidationErrors } = require('../middleware/validation');

router
  .route('/')
  .post(protect, authorize('Admin'), roomValidation, handleValidationErrors, createRoom)
  .get(protect, getRooms);

router.route('/availability').get(protect, getRoomAvailability);

router
  .route('/:id')
  .get(protect, getRoomById)
  .put(protect, authorize('Admin'), updateRoom)
  .delete(protect, authorize('Admin'), deleteRoom);

module.exports = router;