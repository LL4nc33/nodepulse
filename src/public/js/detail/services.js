// =====================================================
// Services Tab Functions
// =====================================================

var servicesData = [];
var activeServicesXHR = null;

function loadServices(nodeId) {
  var listEl = document.getElementById('services-list');
  var btn = document.querySelector('#tab-services .btn');

  if (!listEl) return;

  // Cancel any pending request
  if (activeServicesXHR) {
    activeServicesXHR.abort();
    activeServicesXHR = null;
  }

  // Show loading
  listEl.innerHTML = '<div class="loading-placeholder"><span class="spinner"></span><span>Services werden geladen...</span></div>';

  if (btn) {
    btn.classList.add('loading');
    btn.disabled = true;
  }

  var xhr = new XMLHttpRequest();
  activeServicesXHR = xhr;
  xhr.open('GET', '/api/nodes/' + nodeId + '/services', true);
  xhr.timeout = 60000;

  function resetState() {
    activeServicesXHR = null;
    if (btn) {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  }

  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      resetState();

      var response;
      try {
        response = JSON.parse(xhr.responseText);
      } catch (e) {
        response = { success: false, error: { message: 'Ungueltige Antwort' } };
      }

      if (xhr.status >= 200 && xhr.status < 300 && response.success) {
        servicesData = response.data.services || [];
        renderServices();
      } else {
        var errMsg = response.error ? response.error.message : 'Fehler beim Laden der Services';
        listEl.innerHTML = '<div class="empty-state"><p>' + escapeHtml(errMsg) + '</p></div>';
      }
    }
  };

  xhr.onerror = function() {
    resetState();
    listEl.innerHTML = '<div class="empty-state"><p>Netzwerkfehler</p></div>';
  };

  xhr.ontimeout = function() {
    resetState();
    listEl.innerHTML = '<div class="empty-state"><p>Timeout - Server antwortet nicht</p></div>';
  };

  xhr.send();
}

function renderServices() {
  var listEl = document.getElementById('services-list');
  if (!listEl) return;

  // Update Summary Cards
  var totalEl = document.getElementById('services-total');
  var runningEl = document.getElementById('services-running');
  var exitedEl = document.getElementById('services-exited');
  var failedEl = document.getElementById('services-failed');

  var runningCount = 0;
  var exitedCount = 0;
  var failedCount = 0;

  for (var c = 0; c < servicesData.length; c++) {
    var s = servicesData[c];
    if (s.sub === 'running') runningCount++;
    else if (s.sub === 'exited') exitedCount++;
    else if (s.sub === 'failed' || s.active === 'failed') failedCount++;
  }

  if (totalEl) totalEl.textContent = servicesData.length;
  if (runningEl) runningEl.textContent = runningCount;
  if (exitedEl) exitedEl.textContent = exitedCount;
  if (failedEl) failedEl.textContent = failedCount;

  var searchTerm = (document.getElementById('services-search').value || '').toLowerCase();
  var statusFilter = document.getElementById('services-status-filter').value;

  var filtered = servicesData.filter(function(svc) {
    var matchesSearch = !searchTerm || svc.name.toLowerCase().indexOf(searchTerm) !== -1 ||
                        (svc.description && svc.description.toLowerCase().indexOf(searchTerm) !== -1);
    var matchesStatus = !statusFilter || svc.sub === statusFilter;
    return matchesSearch && matchesStatus;
  });

  if (filtered.length === 0) {
    if (servicesData.length === 0) {
      listEl.innerHTML = '<div class="empty-state"><p>Keine Services gefunden.</p></div>';
    } else {
      listEl.innerHTML = '<div class="empty-state"><p>Keine Services gefunden für diesen Filter.</p></div>';
    }
    return;
  }

  var html = '<div class="table-responsive"><table class="table services-table">';
  html += '<thead><tr><th>Service</th><th>Status</th><th>Beschreibung</th><th>Aktionen</th></tr></thead>';
  html += '<tbody>';

  for (var i = 0; i < filtered.length; i++) {
    var svc = filtered[i];
    var statusClass = 'status-' + svc.sub;
    if (svc.active === 'failed') statusClass = 'status-failed';

    html += '<tr>';
    html += '<td class="service-name">' + escapeHtml(svc.name) + '</td>';
    html += '<td><span class="service-status ' + statusClass + '">' + escapeHtml(svc.sub) + '</span></td>';
    html += '<td class="service-desc">' + escapeHtml(svc.description || '-') + '</td>';
    html += '<td class="service-actions">';
    if (svc.sub === 'running') {
      html += '<button class="btn btn-sm btn-warning" onclick="controlService(' + nodeId + ', \'' + escapeForJsString(svc.name) + '\', \'restart\')">Restart</button>';
      html += '<button class="btn btn-sm btn-danger" onclick="controlService(' + nodeId + ', \'' + escapeForJsString(svc.name) + '\', \'stop\')">Stop</button>';
    } else if (svc.sub === 'exited' || svc.sub === 'dead' || svc.sub === 'failed') {
      html += '<button class="btn btn-sm btn-success" onclick="controlService(' + nodeId + ', \'' + escapeForJsString(svc.name) + '\', \'start\')">Start</button>';
    }
    html += '</td>';
    html += '</tr>';
  }

  html += '</tbody></table></div>';
  html += '<div class="services-summary"><small>' + filtered.length + ' von ' + servicesData.length + ' Services</small></div>';

  listEl.innerHTML = html;
}

function filterServices() {
  renderServices();
}

function controlService(nodeId, serviceName, action) {
  var confirmMsg = 'Service "' + serviceName + '" ' + action + '?';
  if (action === 'stop') {
    confirmMsg = 'Warnung: Service "' + serviceName + '" stoppen?';
  }

  if (!confirm(confirmMsg)) return;

  var xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/nodes/' + nodeId + '/services/' + encodeURIComponent(serviceName) + '/' + action, true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.timeout = 30000;

  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      var response;
      try {
        response = JSON.parse(xhr.responseText);
      } catch (e) {
        response = { success: false, error: { message: 'Ungueltige Antwort' } };
      }

      if (xhr.status >= 200 && xhr.status < 300 && response.success) {
        // Reload services after action
        loadServices(nodeId);
      } else {
        var errMsg = response.error ? response.error.message : 'Aktion fehlgeschlagen';
        alert('Fehler: ' + errMsg);
      }
    }
  };

  xhr.onerror = function() {
    alert('Netzwerkfehler');
  };

  xhr.send();
}

// Load services when services tab is clicked
(function initServicesTab() {
  var servicesTabBtn = document.querySelector('[data-tab="services"]');
  if (servicesTabBtn && !servicesTabBtn.hasAttribute('data-services-listener')) {
    servicesTabBtn.addEventListener('click', function() {
      if (servicesData.length === 0) {
        loadServices(nodeId);
      }
    });
    servicesTabBtn.setAttribute('data-services-listener', 'true');
  }

  // Auto-load if services tab is active on page load (from URL hash)
  var hash = window.location.hash.replace('#', '');
  if (hash === 'services' && document.getElementById('tab-services')) {
    // Small delay to ensure DOM is ready
    setTimeout(function() {
      if (servicesData.length === 0) {
        loadServices(nodeId);
      }
    }, 100);
  }
})();

// =====================================================
