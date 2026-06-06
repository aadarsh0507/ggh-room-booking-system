const express = require('express');
const router = express.Router();
const {
  admitPatient,
  getAdmissions,
  getAdmissionById,
  dischargePatient,
} = require('../controllers/admissionController');
const { protect, authorize } = require('../middleware/auth');
const { admissionValidation, handleValidationErrors } = require('../middleware/validation');

router
  .route('/')
  .post(protect, authorize('Receptionist', 'Nurse', 'Admin'), admissionValidation, handleValidationErrors, admitPatient)
  .get(protect, getAdmissions);

router
  .route('/:id')
  .get(protect, getAdmissionById)
  .put(protect, authorize('Nurse', 'Admin'), dischargePatient);

module.exports = router;