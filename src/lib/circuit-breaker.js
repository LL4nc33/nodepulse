/**
 * =============================================================================
 * CIRCUIT BREAKER PATTERN (TOON Integration)
 * =============================================================================
 *
 * Prevents excessive SSH connection attempts to offline nodes.
 *
 * Problem: Offline node → runStats() fails → 100x SSH timeout errors in 10 min
 * Solution: Circuit breaker opens after 3 failures, stays open for 60s
 *
 * States:
 * - CLOSED: Normal operation (all requests go through)
 * - OPEN: Too many failures (block all requests)
 * - HALF-OPEN: Testing after timeout (allow 1 request to test)
 *
 * Configuration:
 * - FAILURE_THRESHOLD: 3 consecutive failures
 * - OPEN_TIMEOUT: 60000ms (1 minute)
 * - HALF_OPEN_MAX_CALLS: 1 (single test request)
 *
 * Usage:
 *   if (!CircuitBreaker.canExecute(nodeId)) {
 *     console.log('Circuit breaker open, skipping collection');
 *     return;
 *   }
 *
 *   try {
 *     const stats = await runStats(node);
 *     CircuitBreaker.recordSuccess(nodeId);
 *   } catch (err) {
 *     CircuitBreaker.recordFailure(nodeId);
 *     throw err;
 *   }
 *
 * =============================================================================
 */

const FAILURE_THRESHOLD = 3;
const OPEN_TIMEOUT = 60000; // 1 min
const HALF_OPEN_MAX_CALLS = 1;

/**
 * Circuit Breaker State Machine
 * Structure: Map<nodeId, {failures: number, lastFailure: timestamp, state: string, halfOpenCalls: number}>
 */
const states = new Map();

/**
 * Get or initialize circuit breaker state for a node
 *
 * @param {number} nodeId - Node ID
 * @returns {Object} - State object {failures, lastFailure, state, halfOpenCalls}
 */
function getState(nodeId) {
  if (!states.has(nodeId)) {
    states.set(nodeId, {
      failures: 0,
      lastFailure: 0,
      state: 'closed',
      halfOpenCalls: 0
    });
  }
  return states.get(nodeId);
}

/**
 * Check if request can execute (circuit breaker allows it)
 *
 * State Transitions:
 * - CLOSED: Always allow
 * - OPEN: Check if timeout expired → transition to HALF-OPEN or stay OPEN
 * - HALF-OPEN: Allow if halfOpenCalls < HALF_OPEN_MAX_CALLS
 *
 * @param {number} nodeId - Node ID
 * @returns {boolean} - True if request should proceed, false if blocked
 */
function canExecute(nodeId) {
  const state = getState(nodeId);
  const now = Date.now();

  if (state.state === 'closed') {
    return true;
  }

  if (state.state === 'open') {
    // Check if timeout expired
    if (now - state.lastFailure > OPEN_TIMEOUT) {
      // Transition to half-open
      state.state = 'half-open';
      state.halfOpenCalls = 0;
      console.log(`[CircuitBreaker] Node ${nodeId} breaker transitioning to HALF-OPEN (testing)`);
      return true;
    }
    // Still open - block request
    return false;
  }

  if (state.state === 'half-open') {
    // Allow limited test calls
    if (state.halfOpenCalls < HALF_OPEN_MAX_CALLS) {
      state.halfOpenCalls++;
      return true;
    }
    // Max test calls reached - stay half-open until success or failure
    return false;
  }

  // Unknown state - allow by default (fail-open)
  return true;
}

/**
 * Record successful request
 * Resets failure count and closes circuit
 *
 * @param {number} nodeId - Node ID
 */
function recordSuccess(nodeId) {
  const state = getState(nodeId);

  if (state.state === 'open' || state.state === 'half-open') {
    console.log(`[CircuitBreaker] Node ${nodeId} breaker CLOSED (request succeeded)`);
  }

  state.failures = 0;
  state.state = 'closed';
  state.halfOpenCalls = 0;
}

/**
 * Record failed request
 * Increments failure count, may open circuit if threshold exceeded
 *
 * State Transitions:
 * - CLOSED → OPEN if failures >= FAILURE_THRESHOLD
 * - HALF-OPEN → OPEN if test request fails
 *
 * @param {number} nodeId - Node ID
 */
function recordFailure(nodeId) {
  const state = getState(nodeId);
  state.failures++;
  state.lastFailure = Date.now();

  if (state.state === 'half-open') {
    // Test request failed - reopen circuit
    state.state = 'open';
    console.log(`[CircuitBreaker] Node ${nodeId} breaker REOPENED (test failed, ${state.failures} total failures)`);
    return;
  }

  if (state.failures >= FAILURE_THRESHOLD) {
    state.state = 'open';
    console.log(`[CircuitBreaker] Node ${nodeId} breaker OPENED (${state.failures} consecutive failures)`);
  }
}

/**
 * Get circuit breaker statistics
 * Useful for monitoring and debugging
 *
 * @returns {Object} - Statistics {total: number, open: number, halfOpen: number, closed: number}
 */
function getStats() {
  const stats = {
    total: states.size,
    open: 0,
    halfOpen: 0,
    closed: 0
  };

  states.forEach((state) => {
    if (state.state === 'open') stats.open++;
    else if (state.state === 'half-open') stats.halfOpen++;
    else stats.closed++;
  });

  return stats;
}

/**
 * Reset circuit breaker for a specific node
 * Useful for manual recovery or testing
 *
 * @param {number} nodeId - Node ID
 */
function reset(nodeId) {
  states.delete(nodeId);
  console.log(`[CircuitBreaker] Node ${nodeId} breaker RESET`);
}

/**
 * Reset all circuit breakers
 * Useful for system-wide recovery
 */
function resetAll() {
  const count = states.size;
  states.clear();
  console.log(`[CircuitBreaker] All ${count} breakers RESET`);
}

module.exports = {
  canExecute,
  recordSuccess,
  recordFailure,
  getStats,
  reset,
  resetAll,
  // Export constants for testing
  FAILURE_THRESHOLD,
  OPEN_TIMEOUT,
  HALF_OPEN_MAX_CALLS
};
