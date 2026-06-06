const express = require('express');
const router = express.Router();
const {
  createPatient,
  getPatients,
  getPatientById,
  updatePatient,
  getOccupiedBedsFromHIS,
  searchPatientFromHIS,
  syncPatientFromHIS,
} = require('../controllers/patientController');
const { protect, authorize } = require('../middleware/auth');
const { patientValidation, handleValidationErrors } = require('../middleware/validation');

router
  .route('/')
  .post(protect, authorize('Receptionist', 'Admin'), patientValidation, handleValidationErrors, createPatient)
  .get(protect, getPatients);

router.route('/his/occupied-beds').get(protect, getOccupiedBedsFromHIS);
router.route('/search').get(protect, searchPatientFromHIS);
router.route('/sync/:uhid').post(protect, syncPatientFromHIS);

router
  .route('/:id')
  .get(protect, getPatientById)
  .put(protect, authorize('Receptionist', 'Admin'), updatePatient);

module.exports = router;