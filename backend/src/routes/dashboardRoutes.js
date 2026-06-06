const express = require('express');
const router = express.Router();
const { getStats, toggleBedStatus, getDischargeInitiated, getNullRoomTypeBeds, getHisSyncStatus, triggerSync, syncHISBedDetailsNow } = require('../controllers/dashboardController');
const { protect, authorize } = require('../middleware/auth');

router.get('/stats',              protect, getStats);
router.get('/discharge-initiated',protect, getDischargeInitiated);
router.get('/sync-status',        protect, getHisSyncStatus);
router.post('/sync',              protect, authorize('Admin'), triggerSync);
router.post('/sync-his-beds',     protect, authorize('Admin'), syncHISBedDetailsNow);
router.get('/null-roomtype-beds', protect, authorize('Admin'), getNullRoomTypeBeds);
router.patch('/beds/:bedNo/toggle-status', protect, authorize('Admin', 'Receptionist'), toggleBedStatus);

module.exports = router;
