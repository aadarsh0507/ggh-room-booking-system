const express = require('express');
const router  = express.Router();
const {
  getAvailableBeds,
  suggestRooms,
  listPrebookings,
  createPrebooking,
  updatePrebooking,
  cancelPrebooking,
  admitPrebooking,
  updatePriority,
  lookupPatient,
  getRestrictions,
  blockRoomType,
  unblockRoomType,
  getWhatsappLogs,
  getAutoAllocationSuggestion,
  allocateNow,
} = require('../controllers/prebookingController');
const { getSyncStatus, triggerSync } = require('../controllers/dashboardController');
const { protect, authorize } = require('../middleware/auth');

// Specific routes FIRST (before :id routes)
router.get('/whatsapp-logs',                            protect, getWhatsappLogs);
router.get('/sync-status',                             protect, getSyncStatus);
router.post('/sync',                                   protect, authorize('Admin'), triggerSync);
router.get('/available-beds',                          protect, getAvailableBeds);
router.get('/suggest-rooms',                           protect, suggestRooms);
router.get('/auto-allocate',                           protect, getAutoAllocationSuggestion);
router.get('/room-type-restrictions',                  protect, getRestrictions);
router.post('/room-type-restrictions',                 protect, authorize('Admin'), blockRoomType);
router.delete('/room-type-restrictions/:roomType',     protect, authorize('Admin'), unblockRoomType);
router.get('/patient/:ptNo',                           protect, lookupPatient);

// Generic routes LAST (after specific routes)
router.get('/',                                        protect, listPrebookings);
router.post('/',                                       protect, createPrebooking);
router.patch('/:id',                                   protect, updatePrebooking);
router.patch('/:id/cancel',                            protect, cancelPrebooking);
router.patch('/:id/admit',                             protect, admitPrebooking);
router.patch('/:id/priority',                          protect, updatePriority);
router.post('/:prebookingId/allocate-now',             protect, allocateNow);

module.exports = router;
