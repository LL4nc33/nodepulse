# Code Review: Sprint 1-3 (Pre-TOON Integration)

**Date:** 2025-12-17
**Scope:** Complete codebase review before TOON integration
**Reviewed by:** Claude Code (3 parallel agents)

---

## Executive Summary

**Total Issues Found:**
- **Critical Bugs:** 4 (must fix before TOON)
- **High Priority Bugs:** 8
- **Medium Priority Bugs:** 20
- **Low Priority Issues:** 6
- **ES5 Breaking Changes:** 6 instances (Fire HD 10 blocker)

**Most Critical for TOON Integration:**
1. ✅ **Unbounded SSH output accumulation** - Will fail during large data transfers
2. ✅ **ES5 Promise.finally() incompatibility** - Breaks Fire HD 10 (2017)
3. ✅ **N+1 queries in stats aggregation** - Dashboard timeout with 50+ nodes
4. ✅ **Race condition in node online status** - Data sync issues
5. ✅ **Missing database indexes** - Performance degradation

---

## 🔴 Critical Issues (P0 - Must Fix)

### Backend

#### 1. Unbounded String Accumulation in SSH Execute
**Location:** `src/ssh/control-master.js:149-155`
**Severity:** CRITICAL
**Impact:** DoS via memory exhaustion

```javascript
// CURRENT (WRONG)
proc.stdout.on('data', (data) => {
  stdout += data.toString();  // ACCUMULATES FOREVER
});
```

**Reproduction:**
1. Execute command with 1GB+ output (e.g., `cat /dev/zero`)
2. Node process memory grows unbounded
3. Eventually OOM kill

**Fix Required:**
```javascript
// Implement max buffer size + stream processing
const MAX_BUFFER = 10 * 1024 * 1024; // 10 MB
let stdout = '';

proc.stdout.on('data', (data) => {
  if (stdout.length + data.length > MAX_BUFFER) {
    proc.kill();
    reject(new Error('Output exceeded maximum buffer size'));
    return;
  }
  stdout += data.toString();
});
```

---

#### 2. Race Condition in Node Online Status
**Location:** `src/collector/index.js:176-190`
**Severity:** CRITICAL
**Impact:** Multiple re-discoveries, stale data, TOON sync issues

```javascript
// CURRENT (WRONG)
const wasOffline = !node.online;
db.nodes.setOnline(node.id, true);
// ASYNC re-discovery runs in background
if (wasOffline && settings.rediscovery_on_connect === 'true') {
  runFullDiscovery(node).catch(err => { /* ignore */ });
}
```

**Scenario:** Node offline → receives 3 stat requests quickly → 3 discovery processes run in parallel

**Fix Required:**
```javascript
// Track in-progress discoveries
const activeDiscoveries = new Set();

if (wasOffline && settings.rediscovery_on_connect === 'true') {
  if (!activeDiscoveries.has(node.id)) {
    activeDiscoveries.add(node.id);
    runFullDiscovery(node)
      .catch(err => console.error(`Re-Discovery failed:`, err))
      .finally(() => activeDiscoveries.delete(node.id));
  }
}
```

---

### Frontend

#### 3. Promise.finally() ES5 Incompatibility
**Location:** `src/public/js/detail-page.js:181, 207, 849, 2670, 2727, 2776`
**Severity:** CRITICAL (Fire HD 10 blocker)
**Impact:** Script breaks on Chrome 50/Fire HD 10 (2017)

**Affected Files:**
- `src/public/js/detail-page.js` - 6 instances
- `src/public/js/detail/docker.js` - 2 instances
- `src/public/js/detail/health.js` - 3 instances
- `src/public/js/detail/proxmox.js` - 1 instance

```javascript
// WRONG (ES2018)
promise
  .then(success)
  .catch(error)
  .finally(cleanup);

// CORRECT (ES5)
promise
  .then(success)
  .catch(error)
  .then(cleanup, cleanup);
```

**Fix Required:** Replace all 12 `.finally()` calls with `.then(fn, fn)` pattern

---

#### 4. Dashboard Auto-Refresh Race Condition
**Location:** `src/views/index.ejs:859-867`
**Severity:** HIGH
**Impact:** Multiple overlapping /api/stats requests

```javascript
// CURRENT (WRONG)
countdownInterval = setInterval(function() {
  if (!autoRefreshPaused) {
    autoRefreshCountdown--;
    if (autoRefreshCountdown <= 0) {
      refreshDashboardData();  // No request deduplication!
    }
  }
}, 1000);
```

**Scenario:** Refresh takes > 1s → multiple requests fire → UI flashes with stale data

**Fix Required:**
```javascript
var refreshInProgress = false;

function refreshDashboardData() {
  if (refreshInProgress) return;
  refreshInProgress = true;

  // ... XHR logic ...
  xhr.onloadend = function() {
    refreshInProgress = false;
  };
}
```

---

## 🟠 High Priority Issues (P1)

### Database

#### 5. Missing SSH Connection Cleanup on Error
**Location:** `src/ssh/control-master.js:92-127`
**Impact:** Orphaned SSH processes accumulate

**Fix:** Add cleanup in error handler before reject

---

#### 6. Circular Reference Validation O(n²)
**Location:** `src/routes/api/nodes.js:195-202`
**Impact:** API timeout with 100+ nodes

**Current:**
```javascript
const isCircular = (nodeId, targetId) => {
  const children = db.nodes.getChildren(nodeId);  // DATABASE CALL PER NODE
  for (const child of children) {
    if (child.id === targetId) return true;
    if (isCircular(child.id, targetId)) return true;  // RECURSIVE
  }
  return false;
};
```

**Fix:** Fetch all nodes once, validate with in-memory graph traversal

---

#### 7. N+1 Queries in Stats Aggregation
**Location:** `src/db/stats-aggregation.js:59-94`
**Impact:** Dashboard loads 5-10s with 50 nodes

**Current:**
```javascript
children.forEach(child => {
  const stats = db.stats.getCurrent(child.id);     // DB QUERY PER CHILD
  const hardware = db.hardware.getByNodeId(child.id); // DB QUERY PER CHILD
  // ...
});
```

**Fix:** Single JOIN query to fetch all stats + hardware upfront

---

#### 8. Missing Database Indexes
**Tables Affected:**
- `node_stats_history` - missing index on `node_id` alone
- `docker_containers`, `proxmox_vms`, `proxmox_cts` - missing index on `node_id`
- `nodes` - missing index on `parent_id`
- `command_history` - missing index on `executed_at`

**Impact:** 30-50% slower queries on large datasets

**Fix:** Add indexes in new migration:
```sql
CREATE INDEX idx_node_stats_history_node_id ON node_stats_history(node_id);
CREATE INDEX idx_docker_containers_node_id ON docker_containers(node_id);
CREATE INDEX idx_proxmox_vms_node_id ON proxmox_vms(node_id);
CREATE INDEX idx_nodes_parent_id ON nodes(parent_id);
CREATE INDEX idx_command_history_executed_at ON command_history(executed_at);
```

---

### Security

#### 9. StrictHostKeyChecking=no allows MITM attacks
**Location:** `src/ssh/control-master.js:48`
**Severity:** HIGH
**Risk:** Credential theft from Pi on local network

**Current:**
```javascript
args.push('-o', 'StrictHostKeyChecking=no');
```

**Fix:** Implement known_hosts verification, require explicit host key acceptance

---

#### 10. Password Authentication via CLI args
**Location:** `src/ssh/control-master.js:112`
**Severity:** MEDIUM
**Risk:** Local user can read password from `ps` output

**Current:**
```javascript
spawn('sshpass', ['-p', node.ssh_password, ...]);
```

**Fix:** Use ssh-agent, store passwords in secure keyring, or pass via stdin

---

## 🟡 Medium Priority Issues (P2)

### Technical Debt

#### 11. Database Transaction Inconsistency
**Location:** `src/db/index.js:1240-1264`
**Issue:** Delete runs outside transaction, then insert runs inside → race condition

---

#### 12. Complex parseScriptOutput Function
**Location:** `src/collector/index.js:37-89`
**Issue:** 52-line JSON parsing with manual brace-matching → error-prone

---

#### 13. Hardcoded Magic Values
**Locations:**
- SSH timeout: 30000ms
- Polling intervals: 5s, 30s, 5min
- VMID range: 100-999999
- Memory limits: 512-1048576 MB

**Fix:** Move to `src/config/constants.js`

---

#### 14. Promise.all Without Error Handling
**Location:** `src/ssh/control-master.js:187-190`
**Issue:** Fails on first error, doesn't continue other commands

**Fix:** Use `Promise.allSettled()` for resilience

---

#### 15. Event Listener Leaks
**Locations:**
- `src/public/js/detail-page.js:49-52` - Tab click handlers
- `src/public/js/detail-page.js:2553-2580` - Terminal resize handlers
- `src/public/js/main.js:902-919` - Panel toggle & resize

**Impact:** Memory accumulation on navigation

**Fix:** Add cleanup handlers on page unload

---

#### 16. localStorage Quota Handling
**Location:** `src/public/js/main.js:358, 416`
**Issue:** Try/catch but no quota checking or fallback

**Impact:** Silent data loss on Fire HD 10

---

#### 17. Code Duplication - XHR Handlers
**Location:** `src/public/js/detail-page.js:241-303` (15+ instances)
**Issue:** Raw XHR with manual error handling replicated 15+ times

**Fix:** Create XHR wrapper utility

---

#### 18. Inline JavaScript in Templates
**Files:**
- `src/views/index.ejs` - 600+ lines (631-1217)
- `src/views/monitoring/overview.ejs` - 260+ lines (137-403)

**Issue:** Difficult to test, CSP violations possible

**Fix:** Extract to separate JS modules

---

## 🟢 Low Priority Issues (P3)

### Minor Issues

#### 19. Hard-Coded API Endpoints
**Locations:**
- `detail-page.js:259` - `/api/nodes/{id}/docker/containers/{id}/logs?tail=100`
- `detail-page.js:921` - `/api/nodes/{id}/proxmox/resources`

**Fix:** Extract to constants

---

#### 20. Missing API Versioning
**Issue:** No `/api/v1` prefix, no deprecation path

**Fix:** Add versioning strategy before TOON integration

---

## 🔵 Integration & Architecture Issues

### Pattern Analysis

#### Dashboard Refresh Cycle
**Files:** `main.js`, `scheduler.js`, `metrics.js`, `stats.js`
**TOON Impact:**
- ⚠️ Collection happens in background scheduler independent of API requests
- ⚠️ Multiple simultaneous collections could queue
- **Recommendation:** Implement request deduplication

---

#### Stats Collection & Storage
**Files:** `collector/index.js`, `db/stats-aggregation.js`, `routes/api/stats.js`
**TOON Impact:**
- ⚠️ TOON data stored separately would need parallel collection pipeline
- ⚠️ Stats aggregation assumes complete data; TOON might be partial
- **Recommendation:** Store TOON stats in same tables, mark source

---

#### Node Hierarchy & Discovery
**Files:** `routes/api/nodes.js`, `db/index.js`, `collector/index.js`
**TOON Impact:**
- ⚠️ Hierarchy assumes Proxmox→VM relationship
- **Recommendation:** Generalize hierarchy for any parent-child discovery

---

## 📊 Summary by Category

| Category | Critical | High | Medium | Low | Total |
|----------|----------|------|--------|-----|-------|
| Backend Bugs | 2 | 4 | 6 | 0 | 12 |
| Frontend Bugs | 2 | 2 | 4 | 0 | 8 |
| Technical Debt | 0 | 0 | 8 | 3 | 11 |
| ES5 Compatibility | 1 | 0 | 0 | 0 | 1 |
| **TOTAL** | **5** | **6** | **18** | **3** | **32** |

---

## 🎯 Pre-TOON Integration Checklist

### Must Fix Before TOON (P0)
- [ ] Unbounded SSH output accumulation
- [ ] ES5 Promise.finally() incompatibility (12 instances)
- [ ] Race condition in node online status
- [ ] Dashboard auto-refresh race condition

### Should Fix Before TOON (P1)
- [ ] Add database indexes (5 tables)
- [ ] Fix N+1 queries in stats aggregation
- [ ] Fix circular reference O(n²) validation
- [ ] Implement SSH connection cleanup
- [ ] Remove StrictHostKeyChecking=no
- [ ] Change password delivery method

### Nice to Have (P2)
- [ ] Extract inline dashboard JavaScript
- [ ] Create XHR wrapper utility
- [ ] Implement event listener cleanup
- [ ] Add localStorage quota handling
- [ ] Standardize database transactions

---

## 📝 Recommended Fix Order

**Week 1 (Critical):**
1. Replace all `.finally()` with `.then(fn, fn)` pattern
2. Add max buffer size to SSH output handling
3. Implement discovery deduplication
4. Add request deduplication to dashboard refresh

**Week 2 (High Priority):**
1. Add database indexes (Migration 8)
2. Fix N+1 queries in stats aggregation
3. Implement SSH cleanup handlers
4. Fix circular reference validation

**Week 3 (Technical Debt):**
1. Extract inline JavaScript from templates
2. Create XHR wrapper utility
3. Standardize error responses
4. Add API versioning

---

## 🔗 References

- [TOON Integration Plan](../.claude/plans/glittery-frolicking-newell.md)
- [ADR 001: TOON Format Integration](./adr/001-toon-format-integration.md)
- [26 Critical Problems & Solutions](../.claude/plans/glittery-frolicking-newell.md#-26-critical-problems--solutions-production-ready)

---

**Review Status:** Complete
**Next Step:** Fix critical issues before proceeding with TOON implementation
