// Toggle collapsible section (ES5)
function toggleSection(headerEl) {
  var section = headerEl.parentElement;
  var content = section.querySelector('.section-content');

  if (section.classList.contains('collapsed')) {
    section.classList.remove('collapsed');
    content.style.display = 'block';
  } else {
    section.classList.add('collapsed');
    content.style.display = 'none';
  }
}

// formatBytes is available as window.NP.UI.formatBytes from main.js

// Tab switching with URL hash persistence
var tabBtns = document.querySelectorAll('.tab-btn');
var tabContents = document.querySelectorAll('.tab-content');

function selectTab(tabId) {
  // Update buttons
  for (var j = 0; j < tabBtns.length; j++) {
    tabBtns[j].classList.remove('active');
    if (tabBtns[j].getAttribute('data-tab') === tabId) {
      tabBtns[j].classList.add('active');
    }
  }

  // Update content
  for (var k = 0; k < tabContents.length; k++) {
    tabContents[k].classList.remove('active');
  }
  var tabContent = document.getElementById('tab-' + tabId);
  if (tabContent) {
    tabContent.classList.add('active');
  }

  // Save to URL hash (preserves state on reload)
  if (window.history && window.history.replaceState) {
    window.history.replaceState(null, null, '#' + tabId);
  } else {
    window.location.hash = tabId;
  }
}

// Attach click handlers
for (var i = 0; i < tabBtns.length; i++) {
  tabBtns[i].addEventListener('click', function() {
    selectTab(this.getAttribute('data-tab'));
  });
}

// Restore tab from URL hash on page load
(function restoreTabState() {
  var hash = window.location.hash.replace('#', '');
  if (hash && document.getElementById('tab-' + hash)) {
    selectTab(hash);
  }
})();

// Handle browser back/forward
window.addEventListener('hashchange', function() {
  var hash = window.location.hash.replace('#', '');
  if (hash && document.getElementById('tab-' + hash)) {
    selectTab(hash);
  }
});

// =====================================================

// Docker Container Filter & Search
// =====================================================

var currentDockerFilter = 'all';

function filterDockerContainers(filter, btnEl) {
  currentDockerFilter = filter;

  // Update active button
  var filterBtns = document.querySelectorAll('.docker-filter-btn');
  for (var i = 0; i < filterBtns.length; i++) {
    filterBtns[i].classList.remove('active');
  }
  if (btnEl) btnEl.classList.add('active');

  applyDockerFilters();
}

function searchDockerContainers() {
  applyDockerFilters();
}

function applyDockerFilters() {
  var table = document.getElementById('dockerContainerTable');
  if (!table) return;

  var searchInput = document.getElementById('dockerContainerSearch');
  var searchTerm = searchInput ? searchInput.value.toLowerCase() : '';

  var rows = table.querySelectorAll('tbody tr.container-row');
  var visibleCount = 0;
  var totalCount = rows.length;

  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var name = row.querySelector('.container-name');
    var image = row.querySelector('.container-image');
    var nameText = name ? name.textContent.toLowerCase() : '';
    var imageText = image ? image.textContent.toLowerCase() : '';

    var isRunning = row.classList.contains('running');
    var isStopped = row.classList.contains('exited') || row.classList.contains('created') || row.classList.contains('dead');

    var matchesFilter = true;
    if (currentDockerFilter === 'running') {
      matchesFilter = isRunning;
    } else if (currentDockerFilter === 'stopped') {
      matchesFilter = isStopped;
    }

    var matchesSearch = nameText.indexOf(searchTerm) > -1 || imageText.indexOf(searchTerm) > -1;

    if (matchesFilter && matchesSearch) {
      row.style.display = '';
      visibleCount++;
    } else {
      row.style.display = 'none';
    }
  }

  // Update count
  var countEl = document.getElementById('dockerContainerCount');
  if (countEl) {
    countEl.textContent = visibleCount + '/' + totalCount;
  }
}

// Discovery function - uses NP.API and NP.UI
function runDiscovery(nodeId) {
  var resultEl = document.getElementById('test-result');
  var btnEl = document.getElementById('btn-discover');
  var secondaryBtns = document.querySelectorAll('.btn-discover-secondary');

  if (!resultEl) return;

  // Show loading using NP.UI
  NP.UI.showAlert(resultEl, 'info', 'Discovery läuft... (kann 1-2 Minuten dauern)');
  NP.UI.setButtonLoading(btnEl, true);
  NP.UI.setButtonsLoading('.btn-discover-secondary', true);

  // Use NP.API for the request
  NP.API.post('/api/nodes/' + nodeId + '/discover', null, { timeout: 180000 })
    .then(function(data) {
      var msg = 'Discovery erfolgreich! Node-Typ: ' + (data.nodeType || 'Unbekannt');
      if (data.hardwareError) {
        msg += ' (Hardware-Warnung: ' + data.hardwareError + ')';
      }
      msg += '. Seite wird neu geladen...';
      NP.UI.showAlert(resultEl, 'success', msg);
      NP.UI.toast(msg, 'success');
      // ES5: cleanup moved here (instead of .finally)
      NP.UI.setButtonLoading(btnEl, false);
      NP.UI.setButtonsLoading('.btn-discover-secondary', false);
      setTimeout(function() {
        window.location.reload();
      }, 1500);
    })
    .catch(function(error) {
      var errMsg = error.message || 'Discovery fehlgeschlagen';
      NP.UI.showAlert(resultEl, 'error', 'Fehler: ' + errMsg);
      NP.UI.toast(errMsg, 'error');
      // ES5: cleanup moved here (instead of .finally)
      NP.UI.setButtonLoading(btnEl, false);
      NP.UI.setButtonsLoading('.btn-discover-secondary', false);
    });
}

// Docker functions - uses NP.API and NP.UI
function refreshDocker(nodeId) {
  var resultEl = document.getElementById('docker-result');
  var btnEl = document.getElementById('btn-refresh-docker');

  NP.UI.showAlert(resultEl, 'info', 'Docker-Daten werden geladen...');
  NP.UI.setButtonLoading(btnEl, true);

  NP.API.post('/api/nodes/' + nodeId + '/docker', null, { timeout: 120000 })
    .then(function(data) {
      NP.UI.showAlert(resultEl, 'success', 'Docker-Daten aktualisiert. Seite wird neu geladen...');
      NP.UI.toast('Docker-Daten aktualisiert', 'success');
      // ES5: cleanup moved here (instead of .finally)
      NP.UI.setButtonLoading(btnEl, false);
      setTimeout(function() {
        window.location.reload();
      }, 1000);
    })
    .catch(function(error) {
      NP.UI.showAlert(resultEl, 'error', 'Fehler: ' + (error.message || 'Unbekannter Fehler'));
      NP.UI.toast(error.message || 'Docker-Fehler', 'error');
      // ES5: cleanup moved here (instead of .finally)
      NP.UI.setButtonLoading(btnEl, false);
    });
}

function containerAction(nodeId, containerId, action) {
  var resultEl = document.getElementById('docker-result');
  var actionNames = {
    'start': 'Starten',
    'stop': 'Stoppen',
    'restart': 'Neustarten',
    'pause': 'Pausieren',
    'unpause': 'Fortsetzen'
  };

  NP.UI.showAlert(resultEl, 'info', 'Container wird ' + (actionNames[action] || action) + '...');

  NP.API.post('/api/nodes/' + nodeId + '/docker/containers/' + containerId + '/' + action, null, { timeout: 60000 })
    .then(function(data) {
      NP.UI.showAlert(resultEl, 'success', 'Container ' + action + ' erfolgreich. Aktualisiere...');
      NP.UI.toast('Container ' + action + ' erfolgreich', 'success');
      setTimeout(function() {
        refreshDocker(nodeId);
      }, 500);
    })
    .catch(function(error) {
      NP.UI.showAlert(resultEl, 'error', 'Fehler: ' + (error.message || 'Unbekannter Fehler'));
      NP.UI.toast(error.message || 'Fehler', 'error');
    });
}

// Track active logs XHR for cancellation
var activeLogsXHR = null;

function showLogs(nodeId, containerId, containerName) {
  var modal = document.getElementById('logs-modal');
  var title = document.getElementById('logs-title');
  var content = document.getElementById('logs-content');

  if (!modal || !content) return;

  // Abort previous XHR if still running
  if (activeLogsXHR) {
    activeLogsXHR.abort();
  }

  modal.style.display = 'flex';
  title.textContent = 'Logs: ' + containerName;
  content.textContent = 'Lade Logs...';

  var xhr = new XMLHttpRequest();
  activeLogsXHR = xhr;
  xhr.open('GET', '/api/nodes/' + nodeId + '/docker/containers/' + containerId + '/logs?tail=100', true);
  xhr.timeout = 30000;

  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      activeLogsXHR = null;
      var response;
      try {
        response = JSON.parse(xhr.responseText);
      } catch (e) {
        response = { success: false, error: { message: 'Ungueltige Antwort' } };
      }

      if (xhr.status >= 200 && xhr.status < 300 && response.success) {
        content.textContent = response.data.logs || '(Keine Logs vorhanden)';
      } else {
        content.textContent = 'Fehler: ' + (response.error ? response.error.message : 'Unbekannter Fehler');
      }
    }
  };

  xhr.onerror = function() {
    activeLogsXHR = null;
    content.textContent = 'Netzwerkfehler beim Laden der Logs';
  };

  xhr.ontimeout = function() {
    activeLogsXHR = null;
    content.textContent = 'Timeout beim Laden der Logs';
  };

  xhr.send();
}

function closeLogs() {
  var modal = document.getElementById('logs-modal');
  if (modal) {
    modal.style.display = 'none';
  }
  // Abort active XHR if running
  if (activeLogsXHR) {
    activeLogsXHR.abort();
    activeLogsXHR = null;
  }
}

function togglePruneMenu() {
  var menu = document.getElementById('prune-menu');
  if (menu) {
    menu.classList.toggle('open');
  }
}

function pruneDocker(nodeId, type) {
  var resultEl = document.getElementById('docker-result');
  var typeNames = {
    'system': 'System',
    'containers': 'Container',
    'images': 'Images',
    'volumes': 'Volumes',
    'networks': 'Networks'
  };

  var confirmMsg = 'Wirklich ' + (typeNames[type] || type) + ' aufraeumen?';
  if (type === 'system') {
    confirmMsg = 'ACHTUNG: System Prune entfernt alle unbenutzten Container, Images, Volumes und Networks. Fortfahren?';
  }

  if (!confirm(confirmMsg)) {
    return;
  }

  // Close menu
  var menu = document.getElementById('prune-menu');
  if (menu) {
    menu.classList.remove('open');
  }

  if (resultEl) {
    resultEl.className = 'alert alert-info';
    resultEl.textContent = 'Fuehre ' + (typeNames[type] || type) + ' Prune aus...';
    resultEl.style.display = 'block';
  }

  var xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/nodes/' + nodeId + '/docker/prune/' + type, true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.timeout = 120000;

  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      var response;
      try {
        response = JSON.parse(xhr.responseText);
      } catch (e) {
        response = { success: false, error: { message: 'Ungueltige Antwort' } };
      }

      if (xhr.status >= 200 && xhr.status < 300 && response.success) {
        if (resultEl) {
          resultEl.className = 'alert alert-success';
          resultEl.textContent = 'Prune erfolgreich. Aktualisiere...';
        }
        setTimeout(function() {
          refreshDocker(nodeId);
        }, 1000);
      } else {
        if (resultEl) {
          resultEl.className = 'alert alert-error';
          resultEl.textContent = 'Fehler: ' + (response.error ? response.error.message : 'Unbekannter Fehler');
        }
      }
    }
  };

  xhr.onerror = function() {
    if (resultEl) {
      resultEl.className = 'alert alert-error';
      resultEl.textContent = 'Netzwerkfehler';
    }
  };

  xhr.ontimeout = function() {
    if (resultEl) {
      resultEl.className = 'alert alert-error';
      resultEl.textContent = 'Timeout (2 Minuten)';
    }
  };

  xhr.send();
}

// Close dropdown when clicking outside
document.addEventListener('click', function(e) {
  var menu = document.getElementById('prune-menu');
  var toggle = document.querySelector('.dropdown-toggle');
  if (menu && toggle && !toggle.contains(e.target) && !menu.contains(e.target)) {
    menu.classList.remove('open');
  }
});

// =====================================================
// Docker Delete Functions
// =====================================================

var pendingDelete = null;

function confirmDeleteDocker(nodeId, resourceType, resourceId, resourceName, state, inUse) {
  var modal = document.getElementById('docker-delete-modal');
  var titleEl = document.getElementById('delete-modal-title');
  var messageEl = document.getElementById('delete-modal-message');
  var forceOption = document.getElementById('delete-force-option');
  var forceCheckbox = document.getElementById('delete-force-checkbox');
  var errorEl = document.getElementById('delete-modal-error');

  if (!modal) return;

  // Reset state
  forceCheckbox.checked = false;
  errorEl.style.display = 'none';
  forceOption.style.display = 'none';

  // Store pending delete info
  pendingDelete = {
    nodeId: nodeId,
    type: resourceType,
    id: resourceId,
    name: resourceName
  };

  // Set title and message based on resource type
  var typeNames = {
    'containers': 'Container',
    'images': 'Image',
    'volumes': 'Volume',
    'networks': 'Network'
  };

  titleEl.textContent = typeNames[resourceType] + ' loeschen?';

  var message = '';
  if (resourceType === 'containers') {
    message = '<strong>' + escapeHtml(resourceName) + '</strong> wird unwiderruflich geloescht.<br>';
    message += 'Alle Daten im Container gehen verloren.';
    if (state === 'running') {
      message += '<br><br><span class="text-danger">Container laeuft noch!</span>';
      forceOption.style.display = 'block';
    }
  } else if (resourceType === 'images') {
    message = 'Image <strong>' + escapeHtml(resourceName) + '</strong> wird geloescht.<br>';
    message += 'Container die dieses Image nutzen funktionieren weiterhin.';
    forceOption.style.display = 'block'; // Images might be in use
  } else if (resourceType === 'volumes') {
    message = '<span class="text-danger"><strong>WARNUNG:</strong></span> Volume <strong>' + escapeHtml(resourceName) + '</strong> ';
    message += 'und <strong>ALLE DATEN</strong> darin werden <strong>UNWIDERRUFLICH</strong> geloescht!';
    if (inUse) {
      message += '<br><br><span class="text-danger">Volume wird verwendet und kann nicht geloescht werden.</span>';
    }
  } else if (resourceType === 'networks') {
    message = 'Network <strong>' + escapeHtml(resourceName) + '</strong> wird geloescht.';
  }

  messageEl.innerHTML = message;
  modal.style.display = 'flex';
}

function closeDeleteModal() {
  var modal = document.getElementById('docker-delete-modal');
  if (modal) {
    modal.style.display = 'none';
  }
  pendingDelete = null;
}

function executeDockerDelete() {
  if (!pendingDelete) return;

  var btnEl = document.getElementById('btn-confirm-delete');
  var errorEl = document.getElementById('delete-modal-error');
  var forceCheckbox = document.getElementById('delete-force-checkbox');
  var force = forceCheckbox ? forceCheckbox.checked : false;

  // Show loading
  if (btnEl) {
    btnEl.classList.add('loading');
    btnEl.disabled = true;
  }
  errorEl.style.display = 'none';

  var url = '/api/nodes/' + pendingDelete.nodeId + '/docker/' + pendingDelete.type + '/' + encodeURIComponent(pendingDelete.id);
  if (force) {
    url += '?force=true';
  }

  var xhr = new XMLHttpRequest();
  xhr.open('DELETE', url, true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.timeout = 60000;

  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      if (btnEl) {
        btnEl.classList.remove('loading');
        btnEl.disabled = false;
      }

      var response;
      try {
        response = JSON.parse(xhr.responseText);
      } catch (e) {
        response = { success: false, error: { message: 'Ungueltige Antwort' } };
      }

      if (xhr.status >= 200 && xhr.status < 300 && response.success) {
        closeDeleteModal();
        var resultEl = document.getElementById('docker-result');
        if (resultEl) {
          resultEl.className = 'alert alert-success';
          resultEl.textContent = 'Erfolgreich geloescht. Aktualisiere...';
          resultEl.style.display = 'block';
        }
        setTimeout(function() {
          refreshDocker(pendingDelete.nodeId);
        }, 500);
      } else {
        var errMsg = response.error ? response.error.message : 'Loeschen fehlgeschlagen';
        errorEl.textContent = errMsg;
        errorEl.style.display = 'block';

        // Show force option if container is running
        if (response.error && response.error.code === 'CONTAINER_RUNNING') {
          document.getElementById('delete-force-option').style.display = 'block';
        }
        // Show force option if image is in use
        if (response.error && response.error.code === 'IMAGE_IN_USE') {
          document.getElementById('delete-force-option').style.display = 'block';
        }
      }
    }
  };

  xhr.onerror = function() {
    if (btnEl) {
      btnEl.classList.remove('loading');
      btnEl.disabled = false;
    }
    errorEl.textContent = 'Netzwerkfehler';
    errorEl.style.display = 'block';
  };

  xhr.ontimeout = function() {
    if (btnEl) {
      btnEl.classList.remove('loading');
      btnEl.disabled = false;
    }
    errorEl.textContent = 'Timeout (60 Sekunden)';
    errorEl.style.display = 'block';
  };

  xhr.send();
}

// =====================================================