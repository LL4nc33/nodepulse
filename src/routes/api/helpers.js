/**
 * API Helpers
 * Shared utilities for all API routes
 */

// Import zentrale Module
const validators = require('../../lib/validators');
const thresholds = require('../../lib/thresholds');

// Wrap async route handlers to catch errors
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Standard API response format
const apiResponse = (res, statusCode, data, error = null) => {
  if (error) {
    return res.status(statusCode).json({
      success: false,
      error: typeof error === 'string' ? { code: 'ERROR', message: error } : error,
    });
  }
  return res.status(statusCode).json({
    success: true,
    data,
  });
};

// Validate node input - delegiert an zentrale Validierung
const validateNodeInput = (data) => {
  const result = validators.validateNodeInput(data);
  return result.errors;
};

// Re-export VALID_SETTINGS_KEYS aus zentralem Modul
const VALID_SETTINGS_KEYS = thresholds.VALID_SETTINGS_KEYS;

module.exports = {
  asyncHandler,
  apiResponse,
  validateNodeInput,
  VALID_SETTINGS_KEYS,
};
