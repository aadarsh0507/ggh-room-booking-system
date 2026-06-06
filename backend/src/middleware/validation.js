const { body, validationResult } = require('express-validator');

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

const roomValidation = [
  body('roomNumber').notEmpty().withMessage('Room number is required'),
  body('floor').notEmpty().withMessage('Floor is required'),
  body('wing').notEmpty().withMessage('Wing is required'),
  body('category').isIn(['General Ward', 'Semi Private', 'Private', 'Deluxe', 'ICU', 'NICU']).withMessage('Invalid category'),
  body('bedCount').isInt({ min: 1 }).withMessage('Bed count must be at least 1'),
  body('price').isFloat({ min: 0 }).withMessage('Price must be positive'),
];

const patientValidation = [
  body('uhid').notEmpty().withMessage('UHID is required'),
  body('patientId').notEmpty().withMessage('Patient ID is required'),
  body('name').notEmpty().withMessage('Name is required'),
  body('gender').isIn(['Male', 'Female', 'Other']).withMessage('Invalid gender'),
  body('dob').isISO8601().withMessage('Invalid date of birth'),
  body('doctor').notEmpty().withMessage('Doctor is required'),
  body('department').notEmpty().withMessage('Department is required'),
];

const admissionValidation = [
  body('patient').isMongoId().withMessage('Invalid patient ID'),
  body('bed').isMongoId().withMessage('Invalid bed ID'),
  body('room').isMongoId().withMessage('Invalid room ID'),
  body('estimatedDischargeDate').optional().isISO8601().withMessage('Invalid discharge date'),
];

module.exports = {
  handleValidationErrors,
  roomValidation,
  patientValidation,
  admissionValidation,
};