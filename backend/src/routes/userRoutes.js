const express = require('express');
const router  = express.Router();
const { listUsers, createUser, updateUser, resetPassword, deactivateUser, changePassword } = require('../controllers/userController');
const { protect, authorize } = require('../middleware/auth');

router.patch('/me/change-password', protect, changePassword);
router.get('/',                    protect, authorize('Admin'), listUsers);
router.post('/',                   protect, authorize('Admin'), createUser);
router.put('/:id',                 protect, authorize('Admin'), updateUser);
router.patch('/:id/reset-password',protect, authorize('Admin'), resetPassword);
router.delete('/:id',              protect, authorize('Admin'), deactivateUser);

module.exports = router;
