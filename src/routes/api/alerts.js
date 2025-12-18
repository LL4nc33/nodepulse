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

// Get alerts with optional filter (active, all, archived)
router.get('/', asyncHandler(async (req, res) => {
  var filter = req.query.filter || 'active';
  var alerts = [];

  if (filter === 'active') {
    alerts = db.alerts.getActive();
  } else if (filter === 'archived') {
    alerts = db.alerts.getAll().filter(function(a) { return a.resolved_at !== null; });
  } else {
    alerts = db.alerts.getAll();
  }

  // Add counts
  var counts = {
    active: db.alerts.getActiveCount(),
    warning: db.alerts.getActiveCountByLevel('warning'),
    critical: db.alerts.getActiveCountByLevel('critical')
  };

  apiResponse(res, 200, { alerts: alerts, counts: counts, filter: filter });
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
