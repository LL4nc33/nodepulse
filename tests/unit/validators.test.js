/**
 * Unit Tests for validators.js
 * Tests IP validation and other validator functions
 */

'use strict';

var test = require('node:test');
var assert = require('node:assert');
var validators = require('../../src/lib/validators');

// =============================================================================
// isValidIP Tests
// =============================================================================

test('isValidIP - valid IPv4 addresses', function() {
  assert.strictEqual(validators.isValidIP('192.168.1.1'), true);
  assert.strictEqual(validators.isValidIP('10.0.0.1'), true);
  assert.strictEqual(validators.isValidIP('172.16.0.1'), true);
  assert.strictEqual(validators.isValidIP('255.255.255.255'), true);
  assert.strictEqual(validators.isValidIP('0.0.0.0'), true);
  assert.strictEqual(validators.isValidIP('127.0.0.1'), true);
});

test('isValidIP - invalid IPv4 addresses', function() {
  assert.strictEqual(validators.isValidIP('256.1.1.1'), false, 'Octet > 255');
  assert.strictEqual(validators.isValidIP('192.168.1'), false, 'Only 3 octets');
  assert.strictEqual(validators.isValidIP('192.168.1.1.1'), false, '5 octets');
  assert.strictEqual(validators.isValidIP('192.168.1.abc'), false, 'Non-numeric');
  assert.strictEqual(validators.isValidIP('-1.0.0.1'), false, 'Negative number');
});

test('isValidIP - valid IPv6 addresses', function() {
  assert.strictEqual(validators.isValidIP('::1'), true, 'Loopback');
  assert.strictEqual(validators.isValidIP('fe80::1'), true, 'Link-local');
  assert.strictEqual(validators.isValidIP('2001:db8::1'), true, 'Documentation');
  assert.strictEqual(validators.isValidIP('::'), true, 'All zeros');
});

test('isValidIP - edge cases and security', function() {
  assert.strictEqual(validators.isValidIP(''), false, 'Empty string');
  assert.strictEqual(validators.isValidIP(null), false, 'null');
  assert.strictEqual(validators.isValidIP(undefined), false, 'undefined');
  assert.strictEqual(validators.isValidIP(123), false, 'Number');
  assert.strictEqual(validators.isValidIP('not-an-ip'), false, 'Random text');
  assert.strictEqual(validators.isValidIP('<script>alert(1)</script>'), false, 'XSS attempt');
  assert.strictEqual(validators.isValidIP('192.168.1.1; rm -rf /'), false, 'Command injection');
});

test('isValidIP - length limit', function() {
  var longString = 'a'.repeat(50);
  assert.strictEqual(validators.isValidIP(longString), false, 'String > 45 chars');
});

// =============================================================================
// validatePort Tests
// =============================================================================

test('validatePort - valid ports', function() {
  assert.strictEqual(validators.validatePort(22).valid, true);
  assert.strictEqual(validators.validatePort(22).value, 22);
  assert.strictEqual(validators.validatePort(1).valid, true);
  assert.strictEqual(validators.validatePort(65535).valid, true);
  assert.strictEqual(validators.validatePort('3000').valid, true);
  assert.strictEqual(validators.validatePort('3000').value, 3000);
});

test('validatePort - default value', function() {
  assert.strictEqual(validators.validatePort('', 22).value, 22);
  assert.strictEqual(validators.validatePort(null, 22).value, 22);
  assert.strictEqual(validators.validatePort(undefined, 22).value, 22);
});

test('validatePort - invalid ports', function() {
  assert.strictEqual(validators.validatePort(0).valid, false);
  assert.strictEqual(validators.validatePort(-1).valid, false);
  assert.strictEqual(validators.validatePort(65536).valid, false);
});

// =============================================================================
// validateRequired Tests
// =============================================================================

test('validateRequired - valid inputs', function() {
  assert.strictEqual(validators.validateRequired('test', 'field').valid, true);
  assert.strictEqual(validators.validateRequired('  test  ', 'field').value, 'test');
});

test('validateRequired - invalid inputs', function() {
  assert.strictEqual(validators.validateRequired('', 'field').valid, false);
  assert.strictEqual(validators.validateRequired('   ', 'field').valid, false);
  assert.strictEqual(validators.validateRequired(null, 'field').valid, false);
  assert.strictEqual(validators.validateRequired(undefined, 'field').valid, false);
});
