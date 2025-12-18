// ============================================================
// Live Metrics Update (Auto-Refresh Hero Cards)
// ============================================================

var liveMetricsInterval = null;
var LIVE_METRICS_INTERVAL_MS = 5000; // 5 Sekunden

/**
 * Format bytes to human-readable string (ES5)
 */
function formatBytesLive(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  var sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  var i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + sizes[i];
}

/**
 * Update CSS class for metric level
 */
function getMetricLevel(value, warningThreshold, criticalThreshold) {
  if (value >= criticalThreshold) return 'critical';
  if (value >= warningThreshold) return 'warning';
  return 'ok';
}

/**
 * Update a hero metric card with new data
 */
function updateHeroCard(selector, value, warningThreshold, criticalThreshold, formatFn) {
  var card = document.querySelector(selector);
  if (!card) return;

  var valueEl = card.querySelector('.value-large');
  var fillEl = card.querySelector('.hero-metric-fill');

  if (value === null || value === undefined) {
    if (valueEl) valueEl.textContent = '-';
    if (fillEl) fillEl.style.width = '0%';
    return;
  }

  var level = getMetricLevel(value, warningThreshold, criticalThreshold);
  var displayValue = formatFn ? formatFn(value) : Math.round(value) + '%';

  // Update value
  if (valueEl) {
    valueEl.textContent = displayValue;
    valueEl.className = 'value-large';
    if (level === 'warning') valueEl.classList.add('warning');
    if (level === 'critical') valueEl.classList.add('critical');
  }

  // Update bar
  if (fillEl) {
    fillEl.style.width = Math.min(value, 100) + '%';
    fillEl.className = 'hero-metric-fill ' + level;
  }

  // Update card state
  card.classList.remove('warning', 'critical', 'offline');
  if (level !== 'ok') {
    card.classList.add(level);
  }
}

/**
 * Fetch and update live metrics
 */
function updateLiveMetrics() {
  var id = (typeof nodeId !== 'undefined') ? nodeId : null;
  if (!id) return;

  var xhr = new XMLHttpRequest();
  xhr.open('GET', '/api/nodes/' + id + '/stats', true);
  xhr.timeout = 4000;

  xhr.onreadystatechange = function() {
    if (xhr.readyState !== 4) return;

    if (xhr.status === 200) {
      try {
        var response = JSON.parse(xhr.responseText);
        var stats = response.data;

        if (!stats) return;

        // Update CPU
        updateHeroCard(
          '.hero-metric-card:nth-child(1)',
          stats.cpu_percent,
          70, 90
        );

        // Update Memory
        updateHeroCard(
          '.hero-metric-card:nth-child(2)',
          stats.ram_percent,
          75, 90
        );

        // Update Memory details (used / total)
        var memCard = document.querySelector('.hero-metric-card:nth-child(2)');
        if (memCard && stats.ram_used_bytes) {
          var memDetails = memCard.querySelector('.hero-metric-details span');
          if (memDetails && stats.ram_total_bytes) {
            memDetails.textContent = formatBytesLive(stats.ram_used_bytes) + ' / ' + formatBytesLive(stats.ram_total_bytes);
          }
        }

        // Update Storage
        updateHeroCard(
          '.hero-metric-card:nth-child(3)',
          stats.disk_percent,
          80, 90
        );

        // Update Storage details
        var diskCard = document.querySelector('.hero-metric-card:nth-child(3)');
        if (diskCard && stats.disk_used_bytes && stats.disk_total_bytes) {
          var diskDetails = diskCard.querySelector('.hero-metric-details span');
          if (diskDetails) {
            diskDetails.textContent = formatBytesLive(stats.disk_used_bytes) + ' / ' + formatBytesLive(stats.disk_total_bytes);
          }
        }

        // Update Network card
        var netCard = document.querySelector('.hero-metric-card:nth-child(4)');
        if (netCard) {
          var netStats = netCard.querySelector('.network-stats');
          if (netStats) {
            var rxEl = netStats.querySelector('.net-rx');
            var txEl = netStats.querySelector('.net-tx');
            if (rxEl && stats.net_rx_bytes !== undefined) {
              rxEl.innerHTML = '<span class="net-arrow">↓</span> ' + formatBytesLive(stats.net_rx_bytes || 0);
            }
            if (txEl && stats.net_tx_bytes !== undefined) {
              txEl.innerHTML = '<span class="net-arrow">↑</span> ' + formatBytesLive(stats.net_tx_bytes || 0);
            }
          }

          // Update Load
          var loadEl = netCard.querySelector('.hero-metric-details span');
          if (loadEl && stats.load_1m !== undefined) {
            loadEl.textContent = 'Load: ' + stats.load_1m.toFixed(2);
          }
        }

      } catch (e) {
        console.warn('[LiveMetrics] Parse error:', e);
      }
    }
  };

  xhr.onerror = function() {
    console.warn('[LiveMetrics] Network error');
  };

  xhr.send();
}

/**
 * Start live metrics auto-refresh
 */
function startLiveMetrics() {
  if (liveMetricsInterval) return;

  // Initial update
  updateLiveMetrics();

  // Start interval
  liveMetricsInterval = setInterval(updateLiveMetrics, LIVE_METRICS_INTERVAL_MS);
  console.log('[LiveMetrics] Started (interval: ' + LIVE_METRICS_INTERVAL_MS + 'ms)');
}

/**
 * Stop live metrics auto-refresh
 */
function stopLiveMetrics() {
  if (liveMetricsInterval) {
    clearInterval(liveMetricsInterval);
    liveMetricsInterval = null;
    console.log('[LiveMetrics] Stopped');
  }
}

// Auto-start live metrics when page loads
(function initLiveMetrics() {
  // Only start if we're on a node detail page
  if (typeof nodeId !== 'undefined' && nodeId) {
    // Start immediately
    startLiveMetrics();

    // Pause when browser tab is hidden, resume when visible (save resources)
    document.addEventListener('visibilitychange', function() {
      if (document.hidden) {
        stopLiveMetrics();
      } else {
        startLiveMetrics();
      }
    });
  }
})();
