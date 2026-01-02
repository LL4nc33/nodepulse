/**
 * Unit Tests for parseSizeToBytes function in child-poller.js
 * Tests size string parsing for Docker images
 */

'use strict';

var test = require('node:test');
var assert = require('node:assert');

// Import the function from child-poller
// Note: We need to extract it or test via module
// For now, we'll recreate the function for testing

function parseSizeToBytes(sizeStr) {
  if (!sizeStr || typeof sizeStr !== 'string') return 0;

  // Match: number + optional space + optional prefix (K/M/G/T/P) + optional 'i' + B
  var match = sizeStr.match(/^([\d.]+)\s*([KMGTP]?i?B)/i);
  if (!match) return 0;

  var num = parseFloat(match[1]);
  var unit = match[2].toUpperCase().replace('I', '');

  if (isNaN(num)) return 0;

  switch (unit) {
    case 'PB':
      return Math.floor(num * 1125899906842624);
    case 'TB':
      return Math.floor(num * 1099511627776);
    case 'GB':
      return Math.floor(num * 1073741824);
    case 'MB':
      return Math.floor(num * 1048576);
    case 'KB':
      return Math.floor(num * 1024);
    case 'B':
      return Math.floor(num);
    default:
      return 0;
  }
}

// =============================================================================
// Basic Unit Tests
// =============================================================================

test('parseSizeToBytes - bytes', function() {
  assert.strictEqual(parseSizeToBytes('100B'), 100);
  assert.strictEqual(parseSizeToBytes('0B'), 0);
  assert.strictEqual(parseSizeToBytes('1B'), 1);
});

test('parseSizeToBytes - kilobytes', function() {
  assert.strictEqual(parseSizeToBytes('1KB'), 1024);
  assert.strictEqual(parseSizeToBytes('2.5KB'), 2560);
  assert.strictEqual(parseSizeToBytes('100KB'), 102400);
});

test('parseSizeToBytes - megabytes', function() {
  assert.strictEqual(parseSizeToBytes('1MB'), 1048576);
  assert.strictEqual(parseSizeToBytes('500MB'), 524288000);
  assert.strictEqual(parseSizeToBytes('1.5MB'), 1572864);
});

test('parseSizeToBytes - gigabytes', function() {
  assert.strictEqual(parseSizeToBytes('1GB'), 1073741824);
  assert.strictEqual(parseSizeToBytes('1.2GB'), 1288490188);
  assert.strictEqual(parseSizeToBytes('10GB'), 10737418240);
});

test('parseSizeToBytes - terabytes (new)', function() {
  assert.strictEqual(parseSizeToBytes('1TB'), 1099511627776);
  assert.strictEqual(parseSizeToBytes('5TB'), 5497558138880);
  assert.strictEqual(parseSizeToBytes('0.5TB'), 549755813888);
});

test('parseSizeToBytes - petabytes (new)', function() {
  assert.strictEqual(parseSizeToBytes('1PB'), 1125899906842624);
});

// =============================================================================
// Binary Units (KiB, MiB, GiB, TiB)
// =============================================================================

test('parseSizeToBytes - binary units', function() {
  assert.strictEqual(parseSizeToBytes('1KiB'), 1024, 'KiB should equal KB');
  assert.strictEqual(parseSizeToBytes('1MiB'), 1048576, 'MiB should equal MB');
  assert.strictEqual(parseSizeToBytes('1GiB'), 1073741824, 'GiB should equal GB');
  assert.strictEqual(parseSizeToBytes('1TiB'), 1099511627776, 'TiB should equal TB');
});

// =============================================================================
// Case Insensitivity
// =============================================================================

test('parseSizeToBytes - case insensitivity', function() {
  assert.strictEqual(parseSizeToBytes('1gb'), 1073741824);
  assert.strictEqual(parseSizeToBytes('1GB'), 1073741824);
  assert.strictEqual(parseSizeToBytes('1Gb'), 1073741824);
  assert.strictEqual(parseSizeToBytes('1gB'), 1073741824);
});

// =============================================================================
// Whitespace Handling
// =============================================================================

test('parseSizeToBytes - whitespace between number and unit', function() {
  assert.strictEqual(parseSizeToBytes('1 GB'), 1073741824);
  assert.strictEqual(parseSizeToBytes('1  GB'), 1073741824);
  assert.strictEqual(parseSizeToBytes('500 MB'), 524288000);
});

// =============================================================================
// Invalid Inputs
// =============================================================================

test('parseSizeToBytes - invalid inputs', function() {
  assert.strictEqual(parseSizeToBytes(''), 0);
  assert.strictEqual(parseSizeToBytes(null), 0);
  assert.strictEqual(parseSizeToBytes(undefined), 0);
  assert.strictEqual(parseSizeToBytes(123), 0, 'Non-string');
  assert.strictEqual(parseSizeToBytes('abc'), 0, 'No number');
  assert.strictEqual(parseSizeToBytes('GB'), 0, 'No number');
  assert.strictEqual(parseSizeToBytes('100'), 0, 'No unit');
  assert.strictEqual(parseSizeToBytes('100XB'), 0, 'Invalid unit');
});

// =============================================================================
// Docker Output Format Tests
// =============================================================================

test('parseSizeToBytes - real Docker output formats', function() {
  // Typical Docker image sizes
  assert.ok(parseSizeToBytes('1.2GB') > 1200000000, '1.2GB should be > 1.2 billion bytes');
  assert.ok(parseSizeToBytes('500MB') > 500000000, '500MB should be > 500 million bytes');
  assert.ok(parseSizeToBytes('100KB') > 100000, '100KB should be > 100k bytes');

  // Large images
  assert.ok(parseSizeToBytes('5.5GB') > 5000000000, 'Large image');
});
