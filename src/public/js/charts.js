/**
 * nodepulse Sparkline Charts (ES5)
 * Lightweight chart library for stats visualization
 * Compatible with Chrome 50+ (Raspberry Pi, Fire HD 10)
 */

(function(window) {
  'use strict';

  // Default options
  var defaultOptions = {
    lineColor: '#5fa332',
    fillColor: 'rgba(95, 163, 50, 0.2)',
    lineWidth: 2,
    pointRadius: 0,
    showArea: true,
    padding: { top: 10, right: 10, bottom: 10, left: 10 },
    warningThreshold: null,
    criticalThreshold: null,
    warningColor: '#A47D5B',
    criticalColor: '#fc8181',
    animate: true,
    animationDuration: 500
  };

  /**
   * Create a sparkline chart
   * @param {HTMLCanvasElement} canvas - Target canvas element
   * @param {Array} data - Array of numbers or {value, timestamp} objects
   * @param {Object} options - Chart options
   */
  function Sparkline(canvas, data, options) {
    if (!canvas || !canvas.getContext) {
      console.error('Sparkline: Invalid canvas element');
      return;
    }

    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.options = mergeOptions(defaultOptions, options || {});
    this.data = normalizeData(data);
    this.animationProgress = 0;
    this.animationFrame = null;

    this.resize();
    this.draw();
  }

  /**
   * Merge options with defaults
   */
  function mergeOptions(defaults, custom) {
    var result = {};
    var key;
    for (key in defaults) {
      if (defaults.hasOwnProperty(key)) {
        result[key] = defaults[key];
      }
    }
    for (key in custom) {
      if (custom.hasOwnProperty(key)) {
        if (typeof custom[key] === 'object' && custom[key] !== null && !Array.isArray(custom[key])) {
          result[key] = mergeOptions(defaults[key] || {}, custom[key]);
        } else {
          result[key] = custom[key];
        }
      }
    }
    return result;
  }

  /**
   * Normalize data to array of values
   */
  function normalizeData(data) {
    if (!data || !data.length) return [];

    return data.map(function(item) {
      if (typeof item === 'number') return item;
      if (item && typeof item.value === 'number') return item.value;
      if (item && typeof item.cpu_percent === 'number') return item.cpu_percent;
      if (item && typeof item.ram_percent === 'number') return item.ram_percent;
      if (item && typeof item.disk_percent === 'number') return item.disk_percent;
      if (item && typeof item.temp_cpu === 'number') return item.temp_cpu;
      return 0;
    });
  }

  /**
   * Resize canvas to match CSS dimensions (for HiDPI)
   */
  Sparkline.prototype.resize = function() {
    var rect = this.canvas.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;

    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.scale(dpr, dpr);

    this.width = rect.width;
    this.height = rect.height;
  };

  /**
   * Draw the chart
   */
  Sparkline.prototype.draw = function() {
    var self = this;
    var ctx = this.ctx;
    var opts = this.options;
    var data = this.data;

    if (!data.length) {
      this.drawEmpty();
      return;
    }

    // Cancel any existing animation
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
    }

    if (opts.animate) {
      this.animationProgress = 0;
      this.animateFrame();
    } else {
      this.animationProgress = 1;
      this.renderFrame();
    }
  };

  /**
   * Animation loop
   */
  Sparkline.prototype.animateFrame = function() {
    var self = this;
    var startTime = null;
    var duration = this.options.animationDuration;

    function frame(timestamp) {
      if (!startTime) startTime = timestamp;
      var elapsed = timestamp - startTime;
      self.animationProgress = Math.min(elapsed / duration, 1);

      self.renderFrame();

      if (self.animationProgress < 1) {
        self.animationFrame = requestAnimationFrame(frame);
      }
    }

    this.animationFrame = requestAnimationFrame(frame);
  };

  /**
   * Render a single frame
   */
  Sparkline.prototype.renderFrame = function() {
    var ctx = this.ctx;
    var opts = this.options;
    var data = this.data;
    var padding = opts.padding;

    var chartWidth = this.width - padding.left - padding.right;
    var chartHeight = this.height - padding.top - padding.bottom;

    // Clear canvas
    ctx.clearRect(0, 0, this.width, this.height);

    // Calculate min/max
    var min = Math.min.apply(null, data);
    var max = Math.max.apply(null, data);

    // Add some padding to range
    var range = max - min;
    if (range === 0) range = 1;
    min = Math.max(0, min - range * 0.1);
    max = max + range * 0.1;

    // For percentage values, use 0-100 range
    if (max <= 100 && min >= 0) {
      min = 0;
      max = 100;
    }

    range = max - min;

    // Calculate points
    var points = [];
    var stepX = chartWidth / Math.max(data.length - 1, 1);
    var visiblePoints = Math.ceil(data.length * this.animationProgress);

    for (var i = 0; i < visiblePoints; i++) {
      var x = padding.left + i * stepX;
      var y = padding.top + chartHeight - ((data[i] - min) / range) * chartHeight;
      points.push({ x: x, y: y, value: data[i] });
    }

    if (points.length < 2) return;

    // Draw threshold lines
    this.drawThresholds(min, max, chartHeight, padding);

    // Draw area fill
    if (opts.showArea) {
      this.drawArea(points, chartHeight, padding);
    }

    // Draw line
    this.drawLine(points);

    // Draw points
    if (opts.pointRadius > 0) {
      this.drawPoints(points);
    }
  };

  /**
   * Draw threshold lines
   */
  Sparkline.prototype.drawThresholds = function(min, max, chartHeight, padding) {
    var ctx = this.ctx;
    var opts = this.options;
    var range = max - min;

    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;

    if (opts.warningThreshold !== null && opts.warningThreshold >= min && opts.warningThreshold <= max) {
      var warningY = padding.top + chartHeight - ((opts.warningThreshold - min) / range) * chartHeight;
      ctx.strokeStyle = opts.warningColor;
      ctx.beginPath();
      ctx.moveTo(padding.left, warningY);
      ctx.lineTo(this.width - padding.right, warningY);
      ctx.stroke();
    }

    if (opts.criticalThreshold !== null && opts.criticalThreshold >= min && opts.criticalThreshold <= max) {
      var criticalY = padding.top + chartHeight - ((opts.criticalThreshold - min) / range) * chartHeight;
      ctx.strokeStyle = opts.criticalColor;
      ctx.beginPath();
      ctx.moveTo(padding.left, criticalY);
      ctx.lineTo(this.width - padding.right, criticalY);
      ctx.stroke();
    }

    ctx.restore();
  };

  /**
   * Draw area under the line
   */
  Sparkline.prototype.drawArea = function(points, chartHeight, padding) {
    var ctx = this.ctx;
    var opts = this.options;

    ctx.beginPath();
    ctx.moveTo(points[0].x, padding.top + chartHeight);

    for (var i = 0; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }

    ctx.lineTo(points[points.length - 1].x, padding.top + chartHeight);
    ctx.closePath();

    ctx.fillStyle = opts.fillColor;
    ctx.fill();
  };

  /**
   * Draw the line
   */
  Sparkline.prototype.drawLine = function(points) {
    var ctx = this.ctx;
    var opts = this.options;

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);

    for (var i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }

    ctx.strokeStyle = opts.lineColor;
    ctx.lineWidth = opts.lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  };

  /**
   * Draw data points
   */
  Sparkline.prototype.drawPoints = function(points) {
    var ctx = this.ctx;
    var opts = this.options;

    ctx.fillStyle = opts.lineColor;

    for (var i = 0; i < points.length; i++) {
      ctx.beginPath();
      ctx.arc(points[i].x, points[i].y, opts.pointRadius, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  /**
   * Draw empty state
   */
  Sparkline.prototype.drawEmpty = function() {
    var ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    ctx.fillStyle = 'var(--color-text-muted, #888)';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Keine Daten', this.width / 2, this.height / 2);
  };

  /**
   * Update data and redraw
   */
  Sparkline.prototype.update = function(newData) {
    this.data = normalizeData(newData);
    this.draw();
  };

  /**
   * Destroy the chart
   */
  Sparkline.prototype.destroy = function() {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
    }
    this.ctx.clearRect(0, 0, this.width, this.height);
  };

  // =========================================
  // Stats Chart Helper
  // =========================================

  /**
   * Create stats charts for a node
   * @param {string} containerId - Container element ID
   * @param {number} nodeId - Node ID for API calls
   * @param {number} hours - Hours of history to show (default: 24)
   */
  function StatsCharts(containerId, nodeId, hours) {
    this.container = document.getElementById(containerId);
    this.nodeId = nodeId;
    this.hours = hours || 24;
    this.charts = {};
    this.thresholds = {};

    if (!this.container) {
      console.error('StatsCharts: Container not found:', containerId);
      return;
    }
  }

  /**
   * Set thresholds for coloring
   */
  StatsCharts.prototype.setThresholds = function(thresholds) {
    this.thresholds = thresholds || {};
  };

  /**
   * Load and render all charts
   */
  StatsCharts.prototype.load = function() {
    var self = this;

    var xhr = new XMLHttpRequest();
    xhr.open('GET', '/api/nodes/' + this.nodeId + '/stats/history?hours=' + this.hours, true);
    xhr.timeout = 30000;

    xhr.onreadystatechange = function() {
      if (xhr.readyState === 4) {
        if (xhr.status === 200) {
          try {
            var response = JSON.parse(xhr.responseText);
            if (response.success && response.data) {
              self.render(response.data);
            }
          } catch (e) {
            console.error('StatsCharts: Failed to parse response', e);
          }
        }
      }
    };

    xhr.send();
  };

  /**
   * Render charts with data
   */
  StatsCharts.prototype.render = function(data) {
    var self = this;
    var metrics = ['cpu_percent', 'ram_percent', 'disk_percent', 'temp_cpu'];
    var labels = {
      cpu_percent: 'CPU',
      ram_percent: 'RAM',
      disk_percent: 'Disk',
      temp_cpu: 'Temperatur'
    };
    var units = {
      cpu_percent: '%',
      ram_percent: '%',
      disk_percent: '%',
      temp_cpu: '°C'
    };
    var thresholdKeys = {
      cpu_percent: ['cpu_warning', 'cpu_critical'],
      ram_percent: ['ram_warning', 'ram_critical'],
      disk_percent: ['disk_warning', 'disk_critical'],
      temp_cpu: ['temp_warning', 'temp_critical']
    };

    // Clear container
    this.container.innerHTML = '';

    metrics.forEach(function(metric) {
      // Extract metric values
      var values = data.map(function(item) {
        return item[metric];
      }).filter(function(v) {
        return v !== null && v !== undefined;
      });

      // Skip if no data for this metric
      if (values.length === 0) return;

      // Calculate stats
      var stats = calculateStats(values);

      // Create chart container
      var chartDiv = document.createElement('div');
      chartDiv.className = 'chart-container';

      // Create header
      var header = document.createElement('div');
      header.className = 'chart-header';
      header.innerHTML = '<span class="chart-title">' + labels[metric] + ' (' + self.hours + 'h)</span>' +
                         '<span class="chart-current">' + (stats.last !== null ? stats.last.toFixed(1) : '-') + units[metric] + '</span>';
      chartDiv.appendChild(header);

      // Create canvas
      var canvas = document.createElement('canvas');
      canvas.className = 'chart-canvas';
      canvas.style.width = '100%';
      canvas.style.height = '80px';
      chartDiv.appendChild(canvas);

      // Create stats row
      var statsRow = document.createElement('div');
      statsRow.className = 'chart-stats';
      statsRow.innerHTML = '<span>Min: ' + stats.min.toFixed(1) + units[metric] + '</span>' +
                           '<span>Avg: ' + stats.avg.toFixed(1) + units[metric] + '</span>' +
                           '<span>Max: ' + stats.max.toFixed(1) + units[metric] + '</span>';
      chartDiv.appendChild(statsRow);

      self.container.appendChild(chartDiv);

      // Create chart
      var thresholds = thresholdKeys[metric];
      var chartOpts = {
        warningThreshold: self.thresholds[thresholds[0]] || null,
        criticalThreshold: self.thresholds[thresholds[1]] || null
      };

      // Color based on current value
      if (stats.last !== null) {
        if (chartOpts.criticalThreshold && stats.last >= chartOpts.criticalThreshold) {
          chartOpts.lineColor = '#fc8181';
          chartOpts.fillColor = 'rgba(252, 129, 129, 0.2)';
        } else if (chartOpts.warningThreshold && stats.last >= chartOpts.warningThreshold) {
          chartOpts.lineColor = '#A47D5B';
          chartOpts.fillColor = 'rgba(164, 125, 91, 0.2)';
        }
      }

      self.charts[metric] = new Sparkline(canvas, values, chartOpts);
    });
  };

  /**
   * Calculate min/max/avg stats
   */
  function calculateStats(values) {
    if (!values.length) {
      return { min: 0, max: 0, avg: 0, last: null };
    }

    var sum = 0;
    var min = values[0];
    var max = values[0];

    for (var i = 0; i < values.length; i++) {
      sum += values[i];
      if (values[i] < min) min = values[i];
      if (values[i] > max) max = values[i];
    }

    return {
      min: min,
      max: max,
      avg: sum / values.length,
      last: values[values.length - 1]
    };
  }

  /**
   * Update time range and reload
   */
  StatsCharts.prototype.setHours = function(hours) {
    this.hours = hours;
    this.load();
  };

  /**
   * Destroy all charts
   */
  StatsCharts.prototype.destroy = function() {
    for (var key in this.charts) {
      if (this.charts.hasOwnProperty(key) && this.charts[key]) {
        this.charts[key].destroy();
      }
    }
    this.charts = {};
  };

  // Export to global scope
  window.Sparkline = Sparkline;
  window.StatsCharts = StatsCharts;

})(window);
