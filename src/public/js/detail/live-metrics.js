// ============================================================
// Live Metrics Update (Auto-Refresh Hero Cards + Sparklines)
// ============================================================

var liveMetricsInterval = null;
var LIVE_METRICS_INTERVAL_MS = 5000; // 5 Sekunden
var SPARKLINE_HISTORY_HOURS = 1; // 1 Stunde History fuer Sparklines

// Sparkline instances
var sparklineCpu = null;
var sparklineRam = null;
var sparklineDisk = null;

// Stats history buffer for sparklines
var statsHistory = {
  cpu: [],
  ram: [],
  disk: []
};

// Previous network stats for rate calculation
var prevNetStats = {
  rx_bytes: null,
  tx_bytes: null,
  timestamp: null
};

/**
 * Format network rate (bytes per second) to human-readable string
 */
function formatNetRate(bytesPerSec) {
  if (!bytesPerSec || bytesPerSec < 0) return '0 B/s';
  if (bytesPerSec < 1024) return Math.round(bytesPerSec) + ' B/s';
  if (bytesPerSec < 1024 * 1024) return (bytesPerSec / 1024).toFixed(1) + ' KB/s';
  return (bytesPerSec / (1024 * 1024)).toFixed(2) + ' MB/s';
}

/**
 * Calculate network rates from current and previous readings
 */
function calculateNetRates(currentRx, currentTx) {
  var now = Date.now();
  var rates = { rx: 0, tx: 0 };

  if (prevNetStats.timestamp !== null && prevNetStats.rx_bytes !== null) {
    var timeDiff = (now - prevNetStats.timestamp) / 1000; // seconds
    if (timeDiff > 0) {
      // Handle counter wrap-around (unlikely but possible)
      var rxDiff = currentRx - prevNetStats.rx_bytes;
      var txDiff = currentTx - prevNetStats.tx_bytes;

      if (rxDiff >= 0) rates.rx = rxDiff / timeDiff;
      if (txDiff >= 0) rates.tx = txDiff / timeDiff;
    }
  }

  // Store current values for next calculation
  prevNetStats.rx_bytes = currentRx;
  prevNetStats.tx_bytes = currentTx;
  prevNetStats.timestamp = now;

  return rates;
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
            memDetails.textContent = formatBytes(stats.ram_used_bytes) + ' / ' + formatBytes(stats.ram_total_bytes);
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
            diskDetails.textContent = formatBytes(stats.disk_used_bytes) + ' / ' + formatBytes(stats.disk_total_bytes);
          }
        }

        // Update Network card with rates
        var netCard = document.querySelector('.hero-metric-card:nth-child(4)');
        if (netCard) {
          var netStats = netCard.querySelector('.network-stats');
          if (netStats && stats.net_rx_bytes !== undefined && stats.net_tx_bytes !== undefined) {
            // Calculate rates
            var rates = calculateNetRates(stats.net_rx_bytes, stats.net_tx_bytes);

            var rxEl = netStats.querySelector('.net-rx');
            var txEl = netStats.querySelector('.net-tx');
            if (rxEl) {
              rxEl.innerHTML = '<span class="net-arrow">↓</span> ' + formatNetRate(rates.rx);
            }
            if (txEl) {
              txEl.innerHTML = '<span class="net-arrow">↑</span> ' + formatNetRate(rates.tx);
            }
          }

          // Update Load with all three averages
          var loadEl = netCard.querySelector('.hero-metric-details');
          if (loadEl && stats.load_1m !== undefined) {
            var load1 = stats.load_1m ? stats.load_1m.toFixed(2) : '0.00';
            var load5 = stats.load_5m ? stats.load_5m.toFixed(2) : '0.00';
            var load15 = stats.load_15m ? stats.load_15m.toFixed(2) : '0.00';
            loadEl.innerHTML = '<span>Load: ' + load1 + ' / ' + load5 + ' / ' + load15 + '</span>';
          }
        }

        // Update CPU temperature if available
        if (stats.temp_cpu && stats.temp_cpu > 0) {
          var tempEl = document.getElementById('cpu-temp');
          if (tempEl) {
            tempEl.textContent = Math.round(stats.temp_cpu) + '°C';
            tempEl.className = 'hero-metric-temp';
            if (stats.temp_cpu >= 80) tempEl.classList.add('critical');
            else if (stats.temp_cpu >= 60) tempEl.classList.add('warning');
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

/**
 * Merge objects (ES5 compatible Object.assign alternative)
 */
function mergeSparklineOptions(base, custom) {
  var result = {};
  var key;
  for (key in base) {
    if (base.hasOwnProperty(key)) {
      result[key] = base[key];
    }
  }
  for (key in custom) {
    if (custom.hasOwnProperty(key)) {
      result[key] = custom[key];
    }
  }
  return result;
}

/**
 * Initialize sparkline charts
 */
function initSparklines() {
  // Check if Sparkline class is available
  if (typeof Sparkline === 'undefined') {
    console.warn('[LiveMetrics] Sparkline class not available');
    return;
  }

  var cpuCanvas = document.getElementById('sparkline-cpu');
  var ramCanvas = document.getElementById('sparkline-ram');
  var diskCanvas = document.getElementById('sparkline-disk');

  var baseOptions = {
    lineWidth: 1.5,
    pointRadius: 0,
    showArea: true,
    padding: { top: 2, right: 2, bottom: 2, left: 2 },
    animate: false
  };

  if (cpuCanvas) {
    sparklineCpu = new Sparkline(cpuCanvas, [], mergeSparklineOptions(baseOptions, {
      lineColor: '#5fa332',
      fillColor: 'rgba(95, 163, 50, 0.3)',
      warningThreshold: 70,
      criticalThreshold: 90
    }));
  }

  if (ramCanvas) {
    sparklineRam = new Sparkline(ramCanvas, [], mergeSparklineOptions(baseOptions, {
      lineColor: '#3b82f6',
      fillColor: 'rgba(59, 130, 246, 0.3)',
      warningThreshold: 75,
      criticalThreshold: 90
    }));
  }

  if (diskCanvas) {
    sparklineDisk = new Sparkline(diskCanvas, [], mergeSparklineOptions(baseOptions, {
      lineColor: '#A47D5B',
      fillColor: 'rgba(164, 125, 91, 0.3)',
      warningThreshold: 80,
      criticalThreshold: 90
    }));
  }
}

/**
 * Load initial stats history for sparklines
 */
function loadStatsHistory() {
  var id = (typeof nodeId !== 'undefined') ? nodeId : null;
  if (!id) return;

  var xhr = new XMLHttpRequest();
  xhr.open('GET', '/api/nodes/' + id + '/stats/history?hours=' + SPARKLINE_HISTORY_HOURS, true);
  xhr.timeout = 10000;

  xhr.onreadystatechange = function() {
    if (xhr.readyState !== 4) return;

    if (xhr.status === 200) {
      try {
        var response = JSON.parse(xhr.responseText);
        var data = response.data;

        if (data && data.length > 0) {
          // Extract values and store in history buffer
          statsHistory.cpu = data.map(function(item) { return item.cpu_percent; }).filter(function(v) { return v !== null; });
          statsHistory.ram = data.map(function(item) { return item.ram_percent; }).filter(function(v) { return v !== null; });
          statsHistory.disk = data.map(function(item) { return item.disk_percent; }).filter(function(v) { return v !== null; });

          // Update sparklines
          updateSparklines();
        }
      } catch (e) {
        console.warn('[LiveMetrics] History parse error:', e);
      }
    }
  };

  xhr.send();
}

/**
 * Update sparklines with current history data
 */
function updateSparklines() {
  // Limit to last 60 data points (1 hour at 1 min intervals)
  var maxPoints = 60;

  if (sparklineCpu && statsHistory.cpu.length > 0) {
    sparklineCpu.update(statsHistory.cpu.slice(-maxPoints));
  }

  if (sparklineRam && statsHistory.ram.length > 0) {
    sparklineRam.update(statsHistory.ram.slice(-maxPoints));
  }

  if (sparklineDisk && statsHistory.disk.length > 0) {
    sparklineDisk.update(statsHistory.disk.slice(-maxPoints));
  }
}

/**
 * Add new data point to sparkline history
 */
function addSparklineDataPoint(stats) {
  if (!stats) return;

  // Add new values to history
  if (stats.cpu_percent !== null && stats.cpu_percent !== undefined) {
    statsHistory.cpu.push(stats.cpu_percent);
    if (statsHistory.cpu.length > 120) statsHistory.cpu.shift(); // Keep max 2 hours
  }

  if (stats.ram_percent !== null && stats.ram_percent !== undefined) {
    statsHistory.ram.push(stats.ram_percent);
    if (statsHistory.ram.length > 120) statsHistory.ram.shift();
  }

  if (stats.disk_percent !== null && stats.disk_percent !== undefined) {
    statsHistory.disk.push(stats.disk_percent);
    if (statsHistory.disk.length > 120) statsHistory.disk.shift();
  }

  // Update sparklines
  updateSparklines();
}

// Auto-start live metrics when page loads
(function initLiveMetrics() {
  // Only start if we're on a node detail page
  if (typeof nodeId !== 'undefined' && nodeId) {
    // Initialize sparklines
    initSparklines();

    // Load initial history
    loadStatsHistory();

    // Start live updates
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
