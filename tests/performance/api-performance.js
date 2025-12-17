#!/usr/bin/env node
/**
 * API Performance Tests
 *
 * Tests:
 * - GET /api/stats - Response Time < 100ms (alle Nodes)
 * - GET / (Dashboard) - Initial Load < 2s
 * - API Throughput - 50 concurrent requests
 *
 * Usage:
 *   node tests/performance/api-performance.js
 *
 * Requirements:
 *   - nodepulse Server läuft auf localhost:3000
 *   - Mindestens 5 Nodes in DB
 */

const http = require('http');

// Config
const HOST = 'localhost';
const PORT = 3000;
const TARGET_RESPONSE_TIME = 100; // ms
const TARGET_DASHBOARD_LOAD = 2000; // ms
const CONCURRENT_REQUESTS = 50;

// Colors für Console-Output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

/**
 * HTTP Request Helper
 */
function request(path) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    const req = http.request({
      hostname: HOST,
      port: PORT,
      path: path,
      method: 'GET'
    }, (res) => {
      let data = '';

      res.on('data', chunk => {
        data += chunk;
      });

      res.on('end', () => {
        const endTime = Date.now();
        const duration = endTime - startTime;

        resolve({
          statusCode: res.statusCode,
          data: data,
          duration: duration,
          headers: res.headers
        });
      });
    });

    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.abort();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

/**
 * Test 1: API Stats Endpoint
 */
async function testApiStats() {
  console.log(`\n${colors.bold}Test 1: GET /api/stats${colors.reset}`);
  console.log('Expected: Response Time < 100ms\n');

  const samples = [];
  const iterations = 10;

  for (let i = 0; i < iterations; i++) {
    try {
      const result = await request('/api/stats');
      samples.push(result.duration);

      const status = result.duration < TARGET_RESPONSE_TIME ?
        `${colors.green}✓ PASS${colors.reset}` :
        `${colors.red}✗ FAIL${colors.reset}`;

      console.log(`  Run ${i + 1}/${iterations}: ${result.duration}ms ${status}`);
    } catch (err) {
      console.log(`  Run ${i + 1}/${iterations}: ${colors.red}ERROR${colors.reset} - ${err.message}`);
    }
  }

  const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
  const min = Math.min(...samples);
  const max = Math.max(...samples);
  const p95 = samples.sort((a, b) => a - b)[Math.floor(samples.length * 0.95)];

  console.log(`\n  ${colors.cyan}Statistics:${colors.reset}`);
  console.log(`  Average: ${avg.toFixed(2)}ms`);
  console.log(`  Min: ${min}ms`);
  console.log(`  Max: ${max}ms`);
  console.log(`  95th Percentile: ${p95}ms`);

  const passed = avg < TARGET_RESPONSE_TIME;
  console.log(`\n  ${passed ? colors.green + '✓ PASSED' : colors.red + '✗ FAILED'}${colors.reset} - Average: ${avg.toFixed(2)}ms (Target: < ${TARGET_RESPONSE_TIME}ms)`);

  return passed;
}

/**
 * Test 2: Dashboard Initial Load
 */
async function testDashboardLoad() {
  console.log(`\n${colors.bold}Test 2: GET / (Dashboard)${colors.reset}`);
  console.log('Expected: Initial Load < 2s\n');

  const samples = [];
  const iterations = 5;

  for (let i = 0; i < iterations; i++) {
    try {
      const result = await request('/');
      samples.push(result.duration);

      const status = result.duration < TARGET_DASHBOARD_LOAD ?
        `${colors.green}✓ PASS${colors.reset}` :
        `${colors.red}✗ FAIL${colors.reset}`;

      console.log(`  Run ${i + 1}/${iterations}: ${result.duration}ms ${status}`);
    } catch (err) {
      console.log(`  Run ${i + 1}/${iterations}: ${colors.red}ERROR${colors.reset} - ${err.message}`);
    }
  }

  const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
  const max = Math.max(...samples);

  console.log(`\n  ${colors.cyan}Statistics:${colors.reset}`);
  console.log(`  Average: ${avg.toFixed(2)}ms`);
  console.log(`  Max: ${max}ms`);

  const passed = avg < TARGET_DASHBOARD_LOAD;
  console.log(`\n  ${passed ? colors.green + '✓ PASSED' : colors.red + '✗ FAILED'}${colors.reset} - Average: ${avg.toFixed(2)}ms (Target: < ${TARGET_DASHBOARD_LOAD}ms)`);

  return passed;
}

/**
 * Test 3: Concurrent Requests (Throughput)
 */
async function testConcurrentRequests() {
  console.log(`\n${colors.bold}Test 3: Concurrent Requests (${CONCURRENT_REQUESTS} parallel)${colors.reset}`);
  console.log('Expected: No failures, reasonable response times\n');

  const startTime = Date.now();
  const promises = [];

  for (let i = 0; i < CONCURRENT_REQUESTS; i++) {
    promises.push(request('/api/stats'));
  }

  try {
    const results = await Promise.all(promises);
    const endTime = Date.now();
    const totalDuration = endTime - startTime;

    const durations = results.map(r => r.duration);
    const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
    const min = Math.min(...durations);
    const max = Math.max(...durations);
    const failures = results.filter(r => r.statusCode !== 200).length;

    console.log(`  Total Duration: ${totalDuration}ms`);
    console.log(`  Requests: ${CONCURRENT_REQUESTS}`);
    console.log(`  Failures: ${failures}`);
    console.log(`\n  ${colors.cyan}Response Times:${colors.reset}`);
    console.log(`  Average: ${avg.toFixed(2)}ms`);
    console.log(`  Min: ${min}ms`);
    console.log(`  Max: ${max}ms`);
    console.log(`  Throughput: ${(CONCURRENT_REQUESTS / (totalDuration / 1000)).toFixed(2)} req/s`);

    const passed = failures === 0 && avg < 500;
    console.log(`\n  ${passed ? colors.green + '✓ PASSED' : colors.red + '✗ FAILED'}${colors.reset}`);

    return passed;
  } catch (err) {
    console.log(`  ${colors.red}✗ FAILED${colors.reset} - ${err.message}`);
    return false;
  }
}

/**
 * Main Test Runner
 */
async function runTests() {
  console.log(`${colors.bold}${colors.cyan}`);
  console.log('='.repeat(60));
  console.log('  NodePulse API Performance Tests');
  console.log('='.repeat(60));
  console.log(colors.reset);
  console.log(`  Target: ${HOST}:${PORT}`);
  console.log(`  API Response Time Target: < ${TARGET_RESPONSE_TIME}ms`);
  console.log(`  Dashboard Load Target: < ${TARGET_DASHBOARD_LOAD}ms`);

  const results = [];

  try {
    results.push(await testApiStats());
    results.push(await testDashboardLoad());
    results.push(await testConcurrentRequests());
  } catch (err) {
    console.error(`\n${colors.red}Test Suite Error:${colors.reset}`, err);
    process.exit(1);
  }

  // Summary
  console.log(`\n${colors.bold}${colors.cyan}${'='.repeat(60)}`);
  console.log('  Test Summary');
  console.log('='.repeat(60));
  console.log(colors.reset);

  const passed = results.filter(r => r).length;
  const total = results.length;

  console.log(`  Passed: ${passed}/${total}`);
  console.log(`  Failed: ${total - passed}/${total}`);

  if (passed === total) {
    console.log(`\n  ${colors.green}${colors.bold}✓ ALL TESTS PASSED${colors.reset}\n`);
    process.exit(0);
  } else {
    console.log(`\n  ${colors.red}${colors.bold}✗ SOME TESTS FAILED${colors.reset}\n`);
    process.exit(1);
  }
}

// Run tests
runTests().catch(err => {
  console.error('Fatal Error:', err);
  process.exit(1);
});
