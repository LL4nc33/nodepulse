/**
 * Alerts API Routes
 */
const express = require('express');
const router = express.Router();
const db = require('../../db');
const { asyncHandler, apiResponse } = require('./helpers');

// Get alert counts for header badge
router.get('/count', asyncHandler(async (req, res) => {
  const counts = {
    total: db.alerts.getActiveCount(),
    warning: db.alerts.getActiveCountByLevel('warning'),
    critical: db.alerts.getActiveCountByLevel('critical')
  };
  apiResponse(res, 200, counts);
}));

// Get all active alerts (node_name already included via LEFT JOIN)
router.get('/', asyncHandler(async (req, res) => {
  const alerts = db.alerts.getActive();
  apiResponse(res, 200, alerts);
}));

// Acknowledge an alert
router.post('/:id/acknowledge', asyncHandler(async (req, res) => {
  const alertId = parseInt(req.params.id, 10);
  if (isNaN(alertId)) {
    return apiResponse(res, 400, null, { code: 'INVALID_ID', message: 'Ungueltige Alert-ID' });
  }

  db.alerts.acknowledge(alertId);
  apiResponse(res, 200, { acknowledged: true });
}));

module.exports = router;
