/**
 * Settings API Routes
 */
const express = require('express');
const router = express.Router();
const db = require('../../db');
const { asyncHandler, apiResponse, VALID_SETTINGS_KEYS } = require('./helpers');

// Get all settings
router.get('/', asyncHandler(async (req, res) => {
  const settings = db.settings.getAll();
  apiResponse(res, 200, settings);
}));

// Update a setting
router.put('/:key', asyncHandler(async (req, res) => {
  const { key } = req.params;
  const { value } = req.body;

  // Validate key against whitelist
  if (!VALID_SETTINGS_KEYS.includes(key)) {
    return apiResponse(res, 400, null, { code: 'INVALID_KEY', message: `Ungueltiger Settings-Key: ${key}` });
  }

  if (value === undefined) {
    return apiResponse(res, 400, null, { code: 'MISSING_VALUE', message: 'value ist erforderlich' });
  }

  db.settings.set(key, String(value));
  apiResponse(res, 200, { key, value: String(value) });
}));

// Bulk update settings (POST /api/settings)
router.post('/', asyncHandler(async (req, res) => {
  var settings = req.body;
  var updated = [];
  var errors = [];

  Object.keys(settings).forEach(function(key) {
    if (VALID_SETTINGS_KEYS.includes(key)) {
      var value = settings[key];
      db.settings.set(key, String(value));
      updated.push(key);
    } else {
      errors.push(key);
    }
  });

  if (errors.length > 0) {
    apiResponse(res, 207, { updated: updated, invalid: errors });
  } else {
    apiResponse(res, 200, { updated: updated });
  }
}));

module.exports = router;
