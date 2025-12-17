/**
 * Tags API Routes
 */
const express = require('express');
const router = express.Router();
const db = require('../../db');
const { asyncHandler, apiResponse } = require('./helpers');

// Get all tags
router.get('/', asyncHandler(async (req, res) => {
  const tags = db.tags.getAll();
  apiResponse(res, 200, tags);
}));

// Get tags for node
router.get('/node/:id', asyncHandler(async (req, res) => {
  const node = db.nodes.getById(req.params.id);
  if (!node) {
    return apiResponse(res, 404, null, { code: 'NOT_FOUND', message: 'Node nicht gefunden' });
  }

  const tags = db.tags.getForNode(node.id);
  apiResponse(res, 200, tags);
}));

module.exports = router;
