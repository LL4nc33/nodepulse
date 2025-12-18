// Escape string for use in JavaScript string literals (ES5)
function escapeForJsString(str) {
  if (!str) return '';
  return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
}

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


/* Built from modular JavaScript v0.4.0
   Generated: 2025-12-18T17:10:56.181Z
*/


// ============================================================
// FROM: docker.js (485 lines)
// ============================================================

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
        response = { success: false, error: { message: 'Ungültige Antwort' } };
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
        response = { success: false, error: { message: 'Ungültige Antwort' } };
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

  titleEl.textContent = typeNames[resourceType] + ' löschen?';

  var message = '';
  if (resourceType === 'containers') {
    message = '<strong>' + escapeHtml(resourceName) + '</strong> wird unwiderruflich gelöscht.<br>';
    message += 'Alle Daten im Container gehen verloren.';
    if (state === 'running') {
      message += '<br><br><span class="text-danger">Container läuft noch!</span>';
      forceOption.style.display = 'block';
    }
  } else if (resourceType === 'images') {
    message = 'Image <strong>' + escapeHtml(resourceName) + '</strong> wird gelöscht.<br>';
    message += 'Container die dieses Image nutzen funktionieren weiterhin.';
    forceOption.style.display = 'block'; // Images might be in use
  } else if (resourceType === 'volumes') {
    message = '<span class="text-danger"><strong>WARNUNG:</strong></span> Volume <strong>' + escapeHtml(resourceName) + '</strong> ';
    message += 'und <strong>ALLE DATEN</strong> darin werden <strong>UNWIDERRUFLICH</strong> gelöscht!';
    if (inUse) {
      message += '<br><br><span class="text-danger">Volume wird verwendet und kann nicht gelöscht werden.</span>';
    }
  } else if (resourceType === 'networks') {
    message = 'Network <strong>' + escapeHtml(resourceName) + '</strong> wird gelöscht.';
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
        response = { success: false, error: { message: 'Ungültige Antwort' } };
      }

      if (xhr.status >= 200 && xhr.status < 300 && response.success) {
        closeDeleteModal();
        var resultEl = document.getElementById('docker-result');
        if (resultEl) {
          resultEl.className = 'alert alert-success';
          resultEl.textContent = 'Erfolgreich gelöscht. Aktualisiere...';
          resultEl.style.display = 'block';
        }
        setTimeout(function() {
          refreshDocker(pendingDelete.nodeId);
        }, 500);
      } else {
        var errMsg = response.error ? response.error.message : 'Löschen fehlgeschlagen';
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

// ============================================================
// FROM: proxmox.js (326 lines)
// ============================================================

// =====================================================

// Proxmox Config/Clone/Template Functions
// =====================================================

var pendingConfig = null;
var pendingClone = null;
var pendingTemplate = null;

// Config Modal (CPU/RAM)
function openConfigModal(nodeId, vmType, vmid, name, currentCores, currentMemory) {
  var modal = document.getElementById('proxmox-config-modal');
  if (!modal) return;

  pendingConfig = { nodeId: nodeId, type: vmType, vmid: vmid };

  var typeLabel = vmType === 'vm' ? 'VM' : 'CT';
  document.getElementById('config-modal-title').textContent = typeLabel + ' ' + vmid + ' konfigurieren';
  document.getElementById('config-modal-info').textContent = name ? 'Name: ' + name : typeLabel + ' ' + vmid;
  document.getElementById('config-cores').value = currentCores || 1;
  document.getElementById('config-memory').value = currentMemory || 512;
  document.getElementById('config-modal-error').style.display = 'none';

  modal.style.display = 'flex';
}

function closeConfigModal() {
  var modal = document.getElementById('proxmox-config-modal');
  if (modal) modal.style.display = 'none';
  pendingConfig = null;
}

function saveConfig() {
  if (!pendingConfig) return;

  var btnEl = document.getElementById('btn-save-config');
  var errorEl = document.getElementById('config-modal-error');
  var cores = parseInt(document.getElementById('config-cores').value, 10);
  var memory = parseInt(document.getElementById('config-memory').value, 10);

  if (isNaN(cores) || cores < 1 || cores > 128) {
    errorEl.textContent = 'Cores muss zwischen 1 und 128 liegen';
    errorEl.style.display = 'block';
    return;
  }
  if (isNaN(memory) || memory < 64 || memory > 1048576) {
    errorEl.textContent = 'Memory muss zwischen 64 und 1048576 MB liegen';
    errorEl.style.display = 'block';
    return;
  }

  if (btnEl) { btnEl.classList.add('loading'); btnEl.disabled = true; }
  errorEl.style.display = 'none';

  var endpoint = pendingConfig.type === 'vm' ? 'vms' : 'cts';
  var url = '/api/nodes/' + pendingConfig.nodeId + '/proxmox/' + endpoint + '/' + pendingConfig.vmid + '/config';

  var xhr = new XMLHttpRequest();
  xhr.open('PATCH', url, true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.timeout = 60000;

  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      if (btnEl) { btnEl.classList.remove('loading'); btnEl.disabled = false; }

      var response;
      try { response = JSON.parse(xhr.responseText); } catch (e) { response = { success: false }; }

      if (xhr.status >= 200 && xhr.status < 300 && response.success) {
        closeConfigModal();
        var resultEl = document.getElementById('proxmox-result');
        if (resultEl) {
          resultEl.className = 'alert alert-success';
          resultEl.textContent = 'Konfiguration gespeichert. Seite wird neu geladen...';
          resultEl.style.display = 'block';
        }
        setTimeout(function() { location.reload(); }, 1500);
      } else {
        errorEl.textContent = response.error ? response.error.message : 'Speichern fehlgeschlagen';
        errorEl.style.display = 'block';
      }
    }
  };

  xhr.onerror = function() {
    if (btnEl) { btnEl.classList.remove('loading'); btnEl.disabled = false; }
    errorEl.textContent = 'Netzwerkfehler';
    errorEl.style.display = 'block';
  };

  xhr.send(JSON.stringify({ cores: cores, memory: memory }));
}

// Clone Modal
function openCloneModal(nodeId, vmType, vmid, name) {
  var modal = document.getElementById('proxmox-clone-modal');
  if (!modal) return;

  pendingClone = { nodeId: nodeId, type: vmType, vmid: vmid };

  var typeLabel = vmType === 'vm' ? 'VM' : 'CT';
  document.getElementById('clone-modal-title').textContent = typeLabel + ' ' + vmid + ' klonen';
  document.getElementById('clone-modal-info').textContent = name ? 'Quelle: ' + name + ' (' + vmid + ')' : 'Quelle: ' + typeLabel + ' ' + vmid;
  document.getElementById('clone-newid').value = '';
  document.getElementById('clone-name').value = name ? name + '-clone' : '';
  document.getElementById('clone-full').checked = true;
  document.getElementById('clone-modal-error').style.display = 'none';

  modal.style.display = 'flex';
}

function closeCloneModal() {
  var modal = document.getElementById('proxmox-clone-modal');
  if (modal) modal.style.display = 'none';
  pendingClone = null;
}

function startClone() {
  if (!pendingClone) return;

  var btnEl = document.getElementById('btn-start-clone');
  var errorEl = document.getElementById('clone-modal-error');
  var newid = parseInt(document.getElementById('clone-newid').value, 10);
  var name = document.getElementById('clone-name').value.trim();
  var full = document.getElementById('clone-full').checked;

  if (isNaN(newid) || newid < 100 || newid > 999999) {
    errorEl.textContent = 'Neue ID muss zwischen 100 und 999999 liegen';
    errorEl.style.display = 'block';
    return;
  }

  if (btnEl) { btnEl.classList.add('loading'); btnEl.disabled = true; }
  errorEl.style.display = 'none';

  var endpoint = pendingClone.type === 'vm' ? 'vms' : 'cts';
  var url = '/api/nodes/' + pendingClone.nodeId + '/proxmox/' + endpoint + '/' + pendingClone.vmid + '/clone';

  var body = { newid: newid, full: full };
  if (pendingClone.type === 'vm' && name) {
    body.name = name;
  } else if (pendingClone.type === 'ct' && name) {
    body.hostname = name;
  }

  var xhr = new XMLHttpRequest();
  xhr.open('POST', url, true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.timeout = 600000; // 10 min for clone

  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      if (btnEl) { btnEl.classList.remove('loading'); btnEl.disabled = false; }

      var response;
      try { response = JSON.parse(xhr.responseText); } catch (e) { response = { success: false }; }

      if (xhr.status >= 200 && xhr.status < 300 && response.success) {
        closeCloneModal();
        var resultEl = document.getElementById('proxmox-result');
        if (resultEl) {
          resultEl.className = 'alert alert-success';
          resultEl.textContent = 'Clone erfolgreich erstellt! Seite wird neu geladen...';
          resultEl.style.display = 'block';
        }
        setTimeout(function() { location.reload(); }, 2000);
      } else {
        errorEl.textContent = response.error ? response.error.message : 'Clone fehlgeschlagen';
        errorEl.style.display = 'block';
      }
    }
  };

  xhr.onerror = function() {
    if (btnEl) { btnEl.classList.remove('loading'); btnEl.disabled = false; }
    errorEl.textContent = 'Netzwerkfehler';
    errorEl.style.display = 'block';
  };

  xhr.ontimeout = function() {
    if (btnEl) { btnEl.classList.remove('loading'); btnEl.disabled = false; }
    errorEl.textContent = 'Timeout - Clone dauert zu lange. Pruefe Proxmox manuell.';
    errorEl.style.display = 'block';
  };

  xhr.send(JSON.stringify(body));
}

// Template Modal
function confirmTemplate(nodeId, vmType, vmid, name) {
  var modal = document.getElementById('proxmox-template-modal');
  if (!modal) return;

  pendingTemplate = { nodeId: nodeId, type: vmType, vmid: vmid };

  var typeLabel = vmType === 'vm' ? 'VM' : 'CT';
  document.getElementById('template-modal-title').textContent = typeLabel + ' ' + vmid + ' zu Template?';
  var msgEl = document.getElementById('template-modal-message');
  msgEl.innerHTML = '<strong>WARNUNG:</strong> ' + (name || typeLabel + ' ' + vmid) + ' wird zu einem Template konvertiert!<br><br>' +
    'Diese Aktion kann <strong>NICHT rueckgaengig</strong> gemacht werden.<br>' +
    'Die ' + typeLabel + ' kann danach <strong>NICHT mehr gestartet</strong> werden.';
  document.getElementById('template-modal-error').style.display = 'none';

  modal.style.display = 'flex';
}

function closeTemplateModal() {
  var modal = document.getElementById('proxmox-template-modal');
  if (modal) modal.style.display = 'none';
  pendingTemplate = null;
}

function convertToTemplate() {
  if (!pendingTemplate) return;

  var btnEl = document.getElementById('btn-convert-template');
  var errorEl = document.getElementById('template-modal-error');

  if (btnEl) { btnEl.classList.add('loading'); btnEl.disabled = true; }
  errorEl.style.display = 'none';

  var endpoint = pendingTemplate.type === 'vm' ? 'vms' : 'cts';
  var url = '/api/nodes/' + pendingTemplate.nodeId + '/proxmox/' + endpoint + '/' + pendingTemplate.vmid + '/template';

  var xhr = new XMLHttpRequest();
  xhr.open('POST', url, true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.timeout = 120000;

  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      if (btnEl) { btnEl.classList.remove('loading'); btnEl.disabled = false; }

      var response;
      try { response = JSON.parse(xhr.responseText); } catch (e) { response = { success: false }; }

      if (xhr.status >= 200 && xhr.status < 300 && response.success) {
        closeTemplateModal();
        var resultEl = document.getElementById('proxmox-result');
        if (resultEl) {
          resultEl.className = 'alert alert-success';
          resultEl.textContent = 'Template erstellt! Seite wird neu geladen...';
          resultEl.style.display = 'block';
        }
        setTimeout(function() { location.reload(); }, 1500);
      } else {
        errorEl.textContent = response.error ? response.error.message : 'Konvertierung fehlgeschlagen';
        errorEl.style.display = 'block';
      }
    }
  };

  xhr.onerror = function() {
    if (btnEl) { btnEl.classList.remove('loading'); btnEl.disabled = false; }
    errorEl.textContent = 'Netzwerkfehler';
    errorEl.style.display = 'block';
  };

  xhr.send('{}');
}

// Proxmox functions - uses NP.API and NP.UI
function refreshProxmox(nodeId) {
  var resultEl = document.getElementById('proxmox-result');
  var btnEl = document.getElementById('btn-refresh-proxmox');

  NP.UI.showAlert(resultEl, 'info', 'Proxmox-Daten werden geladen...');
  NP.UI.setButtonLoading(btnEl, true);

  NP.API.post('/api/nodes/' + nodeId + '/proxmox', null, { timeout: 180000 })
    .then(function(data) {
      NP.UI.showAlert(resultEl, 'success', 'Proxmox-Daten aktualisiert. Seite wird neu geladen...');
      NP.UI.toast('Proxmox-Daten aktualisiert', 'success');
      // ES5: cleanup moved here (instead of .finally)
      NP.UI.setButtonLoading(btnEl, false);
      setTimeout(function() {
        window.location.reload();
      }, 1000);
    })
    .catch(function(error) {
      NP.UI.showAlert(resultEl, 'error', 'Fehler: ' + (error.message || 'Unbekannter Fehler'));
      NP.UI.toast(error.message || 'Proxmox-Fehler', 'error');
      // ES5: cleanup moved here (instead of .finally)
      NP.UI.setButtonLoading(btnEl, false);
    });
}

function proxmoxAction(nodeId, vmType, vmid, action) {
  var resultEl = document.getElementById('proxmox-result');
  var actionNames = {
    'start': 'Starten',
    'stop': 'Stoppen',
    'shutdown': 'Herunterfahren',
    'reboot': 'Neustarten',
    'reset': 'Reset',
    'suspend': 'Suspendieren',
    'resume': 'Fortsetzen'
  };

  var typeName = vmType === 'vm' ? 'VM' : 'Container';

  if (action === 'stop') {
    if (!confirm('ACHTUNG: ' + typeName + ' ' + vmid + ' wird hart gestoppt. Fortfahren?')) {
      return;
    }
  }

  NP.UI.showAlert(resultEl, 'info', typeName + ' ' + vmid + ' wird ' + (actionNames[action] || action) + '...');

  var endpoint = vmType === 'vm' ? 'vms' : 'cts';
  NP.API.post('/api/nodes/' + nodeId + '/proxmox/' + endpoint + '/' + vmid + '/' + action, null, { timeout: 180000 })
    .then(function(data) {
      NP.UI.showAlert(resultEl, 'success', typeName + ' ' + action + ' erfolgreich. Aktualisiere...');
      NP.UI.toast(typeName + ' ' + action + ' erfolgreich', 'success');
      setTimeout(function() {
        refreshProxmox(nodeId);
      }, 1000);
    })
    .catch(function(error) {
      NP.UI.showAlert(resultEl, 'error', 'Fehler: ' + (error.message || 'Unbekannter Fehler'));
      NP.UI.toast(error.message || 'Fehler', 'error');
    });
}

// =====================================================

// ============================================================
// FROM: modals.js (680 lines)
// ============================================================

// =====================================================

// VM/CT Creation Modal Functions
// =====================================================

var createVmNodeId = null;
var createCtNodeId = null;

function openCreateVmModal(nodeId) {
  createVmNodeId = nodeId;
  var modal = document.getElementById('create-vm-modal');
  var loading = document.getElementById('create-vm-loading');
  var form = document.getElementById('create-vm-form');
  var btn = document.getElementById('btn-create-vm');
  var error = document.getElementById('create-vm-error');

  if (modal) modal.style.display = 'flex';
  if (loading) loading.style.display = 'flex';
  if (form) form.style.display = 'none';
  if (btn) btn.disabled = true;
  if (error) error.style.display = 'none';

  // Load resources from API
  var xhr = new XMLHttpRequest();
  xhr.open('GET', '/api/nodes/' + nodeId + '/proxmox/resources', true);
  xhr.timeout = 60000;

  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      if (loading) loading.style.display = 'none';

      var response;
      try {
        response = JSON.parse(xhr.responseText);
      } catch (e) {
        response = { success: false, error: { message: 'Ungültige Antwort' } };
      }

      if (xhr.status >= 200 && xhr.status < 300 && response.success) {
        populateVmForm(response.data);
        if (form) form.style.display = 'block';
        if (btn) btn.disabled = false;
      } else {
        if (error) {
          error.textContent = 'Fehler beim Laden der Ressourcen: ' + (response.error ? response.error.message : 'Unbekannter Fehler');
          error.style.display = 'block';
        }
      }
    }
  };

  xhr.onerror = function() {
    if (loading) loading.style.display = 'none';
    if (error) {
      error.textContent = 'Netzwerkfehler beim Laden der Ressourcen';
      error.style.display = 'block';
    }
  };

  xhr.send();
}

function populateVmForm(data) {
  // Populate ISOs
  var isoSelect = document.getElementById('vm-iso');
  if (isoSelect && data.isos) {
    isoSelect.innerHTML = '<option value="">-- ISO wählen --</option>';
    data.isos.forEach(function(iso) {
      var opt = document.createElement('option');
      opt.value = iso.volid;
      opt.textContent = iso.filename + ' (' + iso.storage + ')';
      isoSelect.appendChild(opt);
    });
  }

  // Populate Storage (only those supporting images/rootdir)
  var storageSelect = document.getElementById('vm-storage');
  if (storageSelect && data.storage) {
    storageSelect.innerHTML = '<option value="">-- Storage wählen --</option>';
    data.storage.forEach(function(s) {
      if (s.content && (s.content.indexOf('images') > -1 || s.content.indexOf('rootdir') > -1)) {
        var opt = document.createElement('option');
        opt.value = s.name;
        var avail = s.available_bytes ? ' - ' + window.NP.UI.formatBytes(s.available_bytes) + ' frei' : '';
        opt.textContent = s.name + ' (' + s.type + ')' + avail;
        storageSelect.appendChild(opt);
      }
    });
  }

  // Populate Bridges
  var bridgeSelect = document.getElementById('vm-bridge');
  if (bridgeSelect && data.bridges) {
    bridgeSelect.innerHTML = '';
    if (data.bridges.length === 0) {
      var opt = document.createElement('option');
      opt.value = 'vmbr0';
      opt.textContent = 'vmbr0 (Standard)';
      bridgeSelect.appendChild(opt);
    } else {
      data.bridges.forEach(function(br) {
        var opt = document.createElement('option');
        opt.value = br.name;
        opt.textContent = br.name + (br.cidr ? ' (' + br.cidr + ')' : '');
        bridgeSelect.appendChild(opt);
      });
    }
  }

  // Set next VMID
  var vmidInput = document.getElementById('vm-vmid');
  if (vmidInput && data.nextid) {
    vmidInput.value = data.nextid;
  }
}

function closeCreateVmModal() {
  var modal = document.getElementById('create-vm-modal');
  if (modal) modal.style.display = 'none';

  // Reset form
  var form = document.getElementById('create-vm-form');
  if (form) form.reset();
  var error = document.getElementById('create-vm-error');
  if (error) error.style.display = 'none';
  var btn = document.getElementById('btn-create-vm');
  if (btn) {
    btn.classList.remove('loading');
    btn.disabled = false;
  }
  createVmNodeId = null;
}

function submitCreateVmBtn() {
  var form = document.getElementById('create-vm-form');
  if (form) {
    // Trigger form submit
    var event = new Event('submit', { cancelable: true });
    form.dispatchEvent(event);
  }
}

function submitCreateVm(event) {
  event.preventDefault();

  if (!createVmNodeId) return;

  var btn = document.getElementById('btn-create-vm');
  var error = document.getElementById('create-vm-error');

  if (btn) {
    btn.classList.add('loading');
    btn.disabled = true;
  }
  if (error) error.style.display = 'none';

  var formData = {
    vmid: parseInt(document.getElementById('vm-vmid').value, 10),
    name: document.getElementById('vm-name').value,
    iso: document.getElementById('vm-iso').value,
    storage: document.getElementById('vm-storage').value,
    cores: parseInt(document.getElementById('vm-cores').value, 10),
    sockets: parseInt(document.getElementById('vm-sockets').value, 10),
    memory: parseInt(document.getElementById('vm-memory').value, 10),
    disk_size: parseInt(document.getElementById('vm-disk').value, 10),
    ostype: document.getElementById('vm-ostype').value,
    bios: document.getElementById('vm-bios').value,
    net_bridge: document.getElementById('vm-bridge').value,
    net_model: document.getElementById('vm-netmodel').value,
    start_on_boot: document.getElementById('vm-onboot').checked,
    description: document.getElementById('vm-description').value
  };

  var xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/nodes/' + createVmNodeId + '/proxmox/vms/create', true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.timeout = 180000;

  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      if (btn) {
        btn.classList.remove('loading');
        btn.disabled = false;
      }

      var response;
      try {
        response = JSON.parse(xhr.responseText);
      } catch (e) {
        response = { success: false, error: { message: 'Ungültige Antwort' } };
      }

      if (xhr.status >= 200 && xhr.status < 300 && response.success) {
        alert('VM ' + formData.vmid + ' erfolgreich erstellt!');
        closeCreateVmModal();
        window.location.reload();
      } else {
        if (error) {
          error.textContent = 'Fehler: ' + (response.error ? response.error.message : 'Unbekannter Fehler');
          error.style.display = 'block';
        }
      }
    }
  };

  xhr.onerror = function() {
    if (btn) {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
    if (error) {
      error.textContent = 'Netzwerkfehler';
      error.style.display = 'block';
    }
  };

  xhr.ontimeout = function() {
    if (btn) {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
    if (error) {
      error.textContent = 'Timeout (3 Minuten)';
      error.style.display = 'block';
    }
  };

  xhr.send(JSON.stringify(formData));
}

// CT Creation Functions
function openCreateCtModal(nodeId) {
  createCtNodeId = nodeId;
  var modal = document.getElementById('create-ct-modal');
  var loading = document.getElementById('create-ct-loading');
  var form = document.getElementById('create-ct-form');
  var btn = document.getElementById('btn-create-ct');
  var error = document.getElementById('create-ct-error');

  if (modal) modal.style.display = 'flex';
  if (loading) loading.style.display = 'flex';
  if (form) form.style.display = 'none';
  if (btn) btn.disabled = true;
  if (error) error.style.display = 'none';

  // Load resources from API
  var xhr = new XMLHttpRequest();
  xhr.open('GET', '/api/nodes/' + nodeId + '/proxmox/resources', true);
  xhr.timeout = 60000;

  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      if (loading) loading.style.display = 'none';

      var response;
      try {
        response = JSON.parse(xhr.responseText);
      } catch (e) {
        response = { success: false, error: { message: 'Ungültige Antwort' } };
      }

      if (xhr.status >= 200 && xhr.status < 300 && response.success) {
        populateCtForm(response.data);
        if (form) form.style.display = 'block';
        if (btn) btn.disabled = false;
      } else {
        if (error) {
          error.textContent = 'Fehler beim Laden der Ressourcen: ' + (response.error ? response.error.message : 'Unbekannter Fehler');
          error.style.display = 'block';
        }
      }
    }
  };

  xhr.onerror = function() {
    if (loading) loading.style.display = 'none';
    if (error) {
      error.textContent = 'Netzwerkfehler beim Laden der Ressourcen';
      error.style.display = 'block';
    }
  };

  xhr.send();
}

function populateCtForm(data) {
  // Populate Templates
  var templateSelect = document.getElementById('ct-template');
  if (templateSelect && data.templates) {
    templateSelect.innerHTML = '<option value="">-- Template wählen --</option>';
    data.templates.forEach(function(tpl) {
      var opt = document.createElement('option');
      opt.value = tpl.volid;
      opt.textContent = tpl.filename + ' (' + tpl.storage + ')';
      templateSelect.appendChild(opt);
    });
  }

  // Populate Storage (only those supporting rootdir)
  var storageSelect = document.getElementById('ct-storage');
  if (storageSelect && data.storage) {
    storageSelect.innerHTML = '<option value="">-- Storage wählen --</option>';
    data.storage.forEach(function(s) {
      if (s.content && s.content.indexOf('rootdir') > -1) {
        var opt = document.createElement('option');
        opt.value = s.name;
        var avail = s.available_bytes ? ' - ' + window.NP.UI.formatBytes(s.available_bytes) + ' frei' : '';
        opt.textContent = s.name + ' (' + s.type + ')' + avail;
        storageSelect.appendChild(opt);
      }
    });
  }

  // Populate Bridges
  var bridgeSelect = document.getElementById('ct-bridge');
  if (bridgeSelect && data.bridges) {
    bridgeSelect.innerHTML = '';
    if (data.bridges.length === 0) {
      var opt = document.createElement('option');
      opt.value = 'vmbr0';
      opt.textContent = 'vmbr0 (Standard)';
      bridgeSelect.appendChild(opt);
    } else {
      data.bridges.forEach(function(br) {
        var opt = document.createElement('option');
        opt.value = br.name;
        opt.textContent = br.name + (br.cidr ? ' (' + br.cidr + ')' : '');
        bridgeSelect.appendChild(opt);
      });
    }
  }

  // Set next CTID
  var ctidInput = document.getElementById('ct-ctid');
  if (ctidInput && data.nextid) {
    ctidInput.value = data.nextid;
  }
}

function closeCreateCtModal() {
  var modal = document.getElementById('create-ct-modal');
  if (modal) modal.style.display = 'none';

  // Reset form
  var form = document.getElementById('create-ct-form');
  if (form) form.reset();
  var error = document.getElementById('create-ct-error');
  if (error) error.style.display = 'none';
  var btn = document.getElementById('btn-create-ct');
  if (btn) {
    btn.classList.remove('loading');
    btn.disabled = false;
  }
  // Reset IP config
  var staticFields = document.getElementById('ct-static-ip-fields');
  if (staticFields) staticFields.style.display = 'none';
  var ipTypeSelect = document.getElementById('ct-ipconfig-type');
  if (ipTypeSelect) ipTypeSelect.value = 'dhcp';

  createCtNodeId = null;
}

function toggleCtIpConfig() {
  var ipTypeSelect = document.getElementById('ct-ipconfig-type');
  var staticFields = document.getElementById('ct-static-ip-fields');
  var ipInput = document.getElementById('ct-ip');

  if (ipTypeSelect && staticFields) {
    if (ipTypeSelect.value === 'static') {
      staticFields.style.display = 'block';
      if (ipInput) ipInput.required = true;
    } else {
      staticFields.style.display = 'none';
      if (ipInput) ipInput.required = false;
    }
  }
}

function submitCreateCtBtn() {
  var form = document.getElementById('create-ct-form');
  if (form) {
    var event = new Event('submit', { cancelable: true });
    form.dispatchEvent(event);
  }
}

function submitCreateCt(event) {
  event.preventDefault();

  if (!createCtNodeId) return;

  var btn = document.getElementById('btn-create-ct');
  var error = document.getElementById('create-ct-error');

  if (btn) {
    btn.classList.add('loading');
    btn.disabled = true;
  }
  if (error) error.style.display = 'none';

  var ipConfigType = document.getElementById('ct-ipconfig-type').value;
  var ipConfig = 'dhcp';
  var gateway = '';

  if (ipConfigType === 'static') {
    ipConfig = document.getElementById('ct-ip').value;
    gateway = document.getElementById('ct-gateway').value;
  }

  var formData = {
    ctid: parseInt(document.getElementById('ct-ctid').value, 10),
    hostname: document.getElementById('ct-hostname').value,
    template: document.getElementById('ct-template').value,
    storage: document.getElementById('ct-storage').value,
    password: document.getElementById('ct-password').value,
    cores: parseInt(document.getElementById('ct-cores').value, 10),
    memory: parseInt(document.getElementById('ct-memory').value, 10),
    swap: parseInt(document.getElementById('ct-swap').value, 10),
    disk_size: parseInt(document.getElementById('ct-disk').value, 10),
    net_bridge: document.getElementById('ct-bridge').value,
    ip_config: ipConfig,
    gateway: gateway,
    unprivileged: document.getElementById('ct-unprivileged').checked,
    nesting: document.getElementById('ct-nesting').checked,
    start_on_boot: document.getElementById('ct-onboot').checked,
    description: document.getElementById('ct-description').value
  };

  var xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/nodes/' + createCtNodeId + '/proxmox/cts/create', true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.timeout = 180000;

  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      if (btn) {
        btn.classList.remove('loading');
        btn.disabled = false;
      }

      var response;
      try {
        response = JSON.parse(xhr.responseText);
      } catch (e) {
        response = { success: false, error: { message: 'Ungültige Antwort' } };
      }

      if (xhr.status >= 200 && xhr.status < 300 && response.success) {
        alert('CT ' + formData.ctid + ' erfolgreich erstellt!');
        closeCreateCtModal();
        window.location.reload();
      } else {
        if (error) {
          error.textContent = 'Fehler: ' + (response.error ? response.error.message : 'Unbekannter Fehler');
          error.style.display = 'block';
        }
      }
    }
  };

  xhr.onerror = function() {
    if (btn) {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
    if (error) {
      error.textContent = 'Netzwerkfehler';
      error.style.display = 'block';
    }
  };

  xhr.ontimeout = function() {
    if (btn) {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
    if (error) {
      error.textContent = 'Timeout (3 Minuten)';
      error.style.display = 'block';
    }
  };

  xhr.send(JSON.stringify(formData));
}

// Track active snapshot XHR for cancellation
var activeSnapshotXHR = null;

function toggleSnapshotModal() {
  var modal = document.getElementById('snapshot-modal');
  if (modal) {
    if (modal.style.display === 'none') {
      modal.style.display = 'flex';
    } else {
      modal.style.display = 'none';
      // Abort active XHR if running
      if (activeSnapshotXHR) {
        activeSnapshotXHR.abort();
        activeSnapshotXHR = null;
      }
      // Reset form
      var form = document.getElementById('snapshot-form');
      if (form) form.reset();
      var resultEl = document.getElementById('snapshot-form-result');
      if (resultEl) resultEl.style.display = 'none';
      // Reset button state
      var btnEl = document.getElementById('btn-create-snapshot');
      if (btnEl) {
        btnEl.classList.remove('loading');
        btnEl.disabled = false;
      }
    }
  }
}

function createSnapshot(event, nodeId) {
  event.preventDefault();

  var form = document.getElementById('snapshot-form');
  var resultEl = document.getElementById('snapshot-form-result');
  var btnEl = document.getElementById('btn-create-snapshot');

  var vmType = document.getElementById('snap-vm-type').value;
  var vmid = document.getElementById('snap-vmid').value;
  var snapName = document.getElementById('snap-name').value;
  var description = document.getElementById('snap-desc').value;

  // Frontend validation
  if (!vmid || isNaN(parseInt(vmid, 10))) {
    if (resultEl) {
      resultEl.className = 'alert alert-error';
      resultEl.textContent = 'VMID/CTID muss eine Zahl sein';
      resultEl.style.display = 'block';
    }
    return;
  }

  if (resultEl) {
    resultEl.className = 'alert alert-info';
    resultEl.textContent = 'Snapshot wird erstellt...';
    resultEl.style.display = 'block';
  }

  if (btnEl) {
    btnEl.classList.add('loading');
    btnEl.disabled = true;
  }

  var xhr = new XMLHttpRequest();
  activeSnapshotXHR = xhr;
  xhr.open('POST', '/api/nodes/' + nodeId + '/proxmox/snapshots', true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.timeout = 300000;

  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      activeSnapshotXHR = null;
      if (btnEl) {
        btnEl.classList.remove('loading');
        btnEl.disabled = false;
      }

      var response;
      try {
        response = JSON.parse(xhr.responseText);
      } catch (e) {
        response = { success: false, error: { message: 'Ungültige Antwort' } };
      }

      if (xhr.status >= 200 && xhr.status < 300 && response.success) {
        if (resultEl) {
          resultEl.className = 'alert alert-success';
          resultEl.textContent = 'Snapshot erstellt. Seite wird neu geladen...';
        }
        setTimeout(function() {
          window.location.reload();
        }, 1500);
      } else {
        if (resultEl) {
          resultEl.className = 'alert alert-error';
          resultEl.textContent = 'Fehler: ' + (response.error ? response.error.message : 'Unbekannter Fehler');
        }
      }
    }
  };

  xhr.onerror = function() {
    activeSnapshotXHR = null;
    if (btnEl) {
      btnEl.classList.remove('loading');
      btnEl.disabled = false;
    }
    if (resultEl) {
      resultEl.className = 'alert alert-error';
      resultEl.textContent = 'Netzwerkfehler';
    }
  };

  xhr.ontimeout = function() {
    activeSnapshotXHR = null;
    if (btnEl) {
      btnEl.classList.remove('loading');
      btnEl.disabled = false;
    }
    if (resultEl) {
      resultEl.className = 'alert alert-error';
      resultEl.textContent = 'Timeout (5 Minuten)';
    }
  };

  xhr.send(JSON.stringify({
    vm_type: vmType,
    vmid: parseInt(vmid, 10),
    snap_name: snapName,
    description: description
  }));
}

function deleteSnapshot(nodeId, vmType, vmid, snapName) {
  var resultEl = document.getElementById('proxmox-result');

  if (!confirm('Snapshot "' + snapName + '" wirklich löschen?')) {
    return;
  }

  if (resultEl) {
    resultEl.className = 'alert alert-info';
    resultEl.textContent = 'Snapshot wird gelöscht...';
    resultEl.style.display = 'block';
  }

  var xhr = new XMLHttpRequest();
  xhr.open('DELETE', '/api/nodes/' + nodeId + '/proxmox/snapshots/' + encodeURIComponent(vmType) + '/' + encodeURIComponent(vmid) + '/' + encodeURIComponent(snapName), true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.timeout = 300000;

  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      var response;
      try {
        response = JSON.parse(xhr.responseText);
      } catch (e) {
        response = { success: false, error: { message: 'Ungültige Antwort' } };
      }

      if (xhr.status >= 200 && xhr.status < 300 && response.success) {
        if (resultEl) {
          resultEl.className = 'alert alert-success';
          resultEl.textContent = 'Snapshot gelöscht. Aktualisiere...';
        }
        setTimeout(function() {
          refreshProxmox(nodeId);
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
      resultEl.textContent = 'Timeout (5 Minuten)';
    }
  };

  xhr.send();
}

// =====================================================

// ============================================================
// FROM: terminal.js (881 lines)
// ============================================================

// ==================================================
// MULTI-TAB TERMINAL - Real Terminal Style
// PowerShell 7-Style with Bash Prompt
// ==================================================

// ==================================================
// Phase 3: Tab Rendering & Switching
// ==================================================

/**
 * Render all tabs in the tab bar
 * @returns {boolean} True if rendered successfully
 */
function renderTabs() {
  var tabManager = window.NP && window.NP.TerminalTabs;
  if (!tabManager) {
    return false;
  }

  var tabBar = document.getElementById('terminalTabBar');
  if (!tabBar) {
    return false;
  }

  if (!tabManager.tabs || !Array.isArray(tabManager.tabs)) {
    tabManager.tabs = [];
  }

  var html = '';

  for (var i = 0; i < tabManager.tabs.length; i++) {
    var tab = tabManager.tabs[i];
    var isActive = tab.id === tabManager.activeTabId;

    html += '<div class="terminal-tab' + (isActive ? ' active' : '') + '" ';
    html += 'data-tab-id="' + tab.id + '" ';
    html += 'onclick="switchToTab(\'' + tab.id + '\')">';
    html += '<span class="tab-icon">›_</span>';
    html += '<span class="tab-title" ondblclick="startTabRename(event, \'' + tab.id + '\')">';
    html += escapeHtml(tab.title);
    html += '</span>';

    if (tabManager.tabs.length > 1) {
      html += '<button class="tab-close-btn" onclick="closeTab(\'' + tab.id + '\', event)" title="Tab schliessen">&times;</button>';
    }

    html += '</div>';
  }

  html += '<button class="terminal-tab-new" onclick="createNewTab()" title="Neuer Tab (Ctrl+T)">';
  html += '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">';
  html += '<line x1="12" y1="5" x2="12" y2="19"/>';
  html += '<line x1="5" y1="12" x2="19" y2="12"/>';
  html += '</svg>';
  html += '</button>';

  tabBar.innerHTML = html;
  return true;
}

/**
 * Switch to a specific tab
 * @param {string} tabId - ID of the tab to switch to
 */
function switchToTab(tabId) {
  var tabManager = window.NP && window.NP.TerminalTabs;
  if (!tabManager) return;

  var previousTab = tabManager.getActiveTab();

  // Save current tab history before switching
  if (previousTab) {
    var historyEl = document.getElementById('terminalHistory');
    if (historyEl) {
      previousTab.historyHtml = historyEl.innerHTML;
    }
    tabManager.updateTab(previousTab.id, previousTab);
  }

  var success = tabManager.switchTab(tabId);
  if (!success) return;

  var newTab = tabManager.getActiveTab();
  if (!newTab) return;

  renderTabs();

  // Restore history
  var historyEl = document.getElementById('terminalHistory');
  if (historyEl) {
    historyEl.innerHTML = newTab.historyHtml || '';
    scrollToBottom();
  }

  // Update prompt display
  updatePromptDisplay(newTab.prompt);

  // Clear and focus input
  var input = document.getElementById('terminalInput');
  if (input) {
    input.value = '';
    input.focus();
  }
}

/**
 * Update the bash-style prompt display
 * @param {Object} promptData - Object with username, hostname, path
 */
function updatePromptDisplay(promptData) {
  var promptEl = document.getElementById('terminalPrompt');
  if (!promptEl) return;

  // Use nodeData if promptData not available
  var data = promptData || {};
  var username = data.username || (typeof nodeData !== 'undefined' ? nodeData.sshUser : 'root') || 'root';
  var hostname = data.hostname || (typeof nodeData !== 'undefined' ? nodeData.name : 'server') || 'server';
  var path = data.path || '~';

  var html = '';
  html += '<span class="prompt-user">' + escapeHtml(username) + '</span>';
  html += '<span class="prompt-at">@</span>';
  html += '<span class="prompt-host">' + escapeHtml(hostname) + '</span>';
  html += '<span class="prompt-colon">:</span>';
  html += '<span class="prompt-path">' + escapeHtml(path) + '</span>';
  html += '<span class="prompt-dollar">$</span>';

  promptEl.innerHTML = html;
}

/**
 * Build prompt HTML string for history entry
 * @param {Object} promptData - Prompt data
 * @returns {string} HTML string
 */
function buildPromptHtml(promptData) {
  var data = promptData || {};
  var username = data.username || (typeof nodeData !== 'undefined' ? nodeData.sshUser : 'root') || 'root';
  var hostname = data.hostname || (typeof nodeData !== 'undefined' ? nodeData.name : 'server') || 'server';
  var path = data.path || '~';

  var html = '';
  html += '<span class="prompt-user">' + escapeHtml(username) + '</span>';
  html += '<span class="prompt-at">@</span>';
  html += '<span class="prompt-host">' + escapeHtml(hostname) + '</span>';
  html += '<span class="prompt-colon">:</span>';
  html += '<span class="prompt-path">' + escapeHtml(path) + '</span>';
  html += '<span class="prompt-dollar">$</span>';

  return html;
}

/**
 * Escape HTML to prevent XSS
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  var div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Strip ANSI escape codes from string
 * Used for commands like fastfetch, neofetch that output colored text
 * @param {string} str - String with potential ANSI codes
 * @returns {string} Clean string without ANSI codes
 */
function stripAnsiCodes(str) {
  if (typeof str !== 'string') return '';
  // Match ANSI escape sequences:
  // - CSI sequences: \x1b[ followed by params and letter (e.g., \x1b[31m, \x1b[1;32m, \x1b[0m)
  // - SGR reset: \x1b(B
  // - OSC sequences: \x1b] followed by content and terminator
  // - Other escape sequences: \x1b followed by single char
  var ansiRegex = /\x1b\[[0-9;?]*[A-Za-z]|\x1b\([A-Za-z]|\x1b\][^\x07]*\x07|\x1b[A-Za-z]/g;
  return str.replace(ansiRegex, '');
}

/**
 * Scroll terminal history to bottom
 */
function scrollToBottom() {
  var historyEl = document.getElementById('terminalHistory');
  var bodyEl = document.getElementById('terminalBody');
  if (bodyEl) {
    bodyEl.scrollTop = bodyEl.scrollHeight;
  }
}

// ==================================================
// Phase 4: Tab Management (Create, Close, Rename)
// ==================================================

/**
 * Create a new terminal tab
 */
function createNewTab() {
  var tabManager = window.NP && window.NP.TerminalTabs;
  if (!tabManager) return;

  // IMPORTANT: Save current tab's history BEFORE creating new tab
  var currentTab = tabManager.getActiveTab();
  if (currentTab) {
    var historyEl = document.getElementById('terminalHistory');
    if (historyEl) {
      currentTab.historyHtml = historyEl.innerHTML;
      tabManager.updateTab(currentTab.id, currentTab);
    }
  }

  // Create new tab
  var newTab = tabManager.createTab();

  if (typeof nodeData !== 'undefined') {
    newTab.prompt = {
      username: nodeData.sshUser || 'root',
      hostname: nodeData.name || 'server',
      path: '~'
    };
    newTab.workingDir = '~';
  }
  // Always start with empty history for new tab
  newTab.historyHtml = '';
  tabManager.updateTab(newTab.id, newTab);

  // Clear the history DOM before switching
  var historyEl = document.getElementById('terminalHistory');
  if (historyEl) {
    historyEl.innerHTML = '';
  }

  // Switch to new tab (don't call tabManager.switchTab first!)
  tabManager.activeTabId = newTab.id;
  tabManager.save();
  renderTabs();
  updatePromptDisplay(newTab.prompt);

  var input = document.getElementById('terminalInput');
  if (input) {
    input.value = '';
    input.focus();
  }
}

/**
 * Close a terminal tab
 * @param {string} tabId - ID of tab to close
 * @param {Event} event - Click event
 */
function closeTab(tabId, event) {
  if (event) {
    event.stopPropagation();
  }

  var tabManager = window.NP && window.NP.TerminalTabs;
  if (!tabManager) return;

  if (tabManager.tabs.length === 1) {
    if (window.NP && window.NP.Toast) {
      window.NP.Toast.show('Letztes Terminal-Tab kann nicht geschlossen werden.', 'warning');
    }
    return;
  }

  var tab = tabManager.getTabById(tabId);
  if (!tab) return;

  if (tabId === tabManager.activeTabId) {
    var currentIndex = -1;
    for (var i = 0; i < tabManager.tabs.length; i++) {
      if (tabManager.tabs[i].id === tabId) {
        currentIndex = i;
        break;
      }
    }

    var nextTab = tabManager.tabs[currentIndex + 1] || tabManager.tabs[currentIndex - 1];
    if (nextTab) {
      tabManager.switchTab(nextTab.id);
    }
  }

  tabManager.removeTab(tabId);
  renderTabs();

  if (tabManager.activeTabId) {
    switchToTab(tabManager.activeTabId);
  }
}

/**
 * Start tab rename (double-click on tab title)
 * @param {Event} event - Click event
 * @param {string} tabId - ID of tab to rename
 */
function startTabRename(event, tabId) {
  if (event) {
    event.stopPropagation();
  }

  var tabManager = window.NP && window.NP.TerminalTabs;
  if (!tabManager) return;

  var tab = tabManager.getTabById(tabId);
  if (!tab) return;

  var newTitle = prompt('Tab umbenennen:', tab.title);
  if (newTitle && newTitle.trim()) {
    tab.title = newTitle.trim();
    tabManager.updateTab(tabId, tab);
    renderTabs();
  }
}

// ==================================================
// Phase 5: Keyboard Shortcuts
// ==================================================

document.addEventListener('keydown', function(e) {
  var terminalPanel = document.getElementById('terminalPanel');
  if (!terminalPanel) return;

  var tabManager = window.NP && window.NP.TerminalTabs;
  if (!tabManager) return;

  // Ctrl+T: New Tab
  if (e.ctrlKey && e.key === 't') {
    e.preventDefault();
    createNewTab();
    return;
  }

  // Ctrl+W: Close Tab
  if (e.ctrlKey && e.key === 'w') {
    e.preventDefault();
    var activeTab = tabManager.getActiveTab();
    if (activeTab) {
      closeTab(activeTab.id, e);
    }
    return;
  }

  // Ctrl+L: Clear Terminal
  if (e.ctrlKey && e.key === 'l') {
    e.preventDefault();
    clearTerminal();
    return;
  }

  // Ctrl+Tab: Next Tab
  if (e.ctrlKey && e.key === 'Tab' && !e.shiftKey) {
    e.preventDefault();
    var currentIndex = -1;
    for (var i = 0; i < tabManager.tabs.length; i++) {
      if (tabManager.tabs[i].id === tabManager.activeTabId) {
        currentIndex = i;
        break;
      }
    }
    var nextIndex = (currentIndex + 1) % tabManager.tabs.length;
    if (tabManager.tabs[nextIndex]) {
      switchToTab(tabManager.tabs[nextIndex].id);
    }
    return;
  }

  // Ctrl+Shift+Tab: Previous Tab
  if (e.ctrlKey && e.key === 'Tab' && e.shiftKey) {
    e.preventDefault();
    var currentIndex = -1;
    for (var i = 0; i < tabManager.tabs.length; i++) {
      if (tabManager.tabs[i].id === tabManager.activeTabId) {
        currentIndex = i;
        break;
      }
    }
    var prevIndex = (currentIndex - 1 + tabManager.tabs.length) % tabManager.tabs.length;
    if (tabManager.tabs[prevIndex]) {
      switchToTab(tabManager.tabs[prevIndex].id);
    }
    return;
  }

  // Ctrl+1-9: Jump to Tab N
  if (e.ctrlKey && e.key >= '1' && e.key <= '9') {
    e.preventDefault();
    var index = parseInt(e.key, 10) - 1;
    if (tabManager.tabs[index]) {
      switchToTab(tabManager.tabs[index].id);
    }
    return;
  }
});

// ==================================================
// Phase 6: Initialization & Migration
// ==================================================

var terminalTabsInitialized = false;
var initRetryCount = 0;
var MAX_INIT_RETRIES = 10;

/**
 * Initialize terminal tab system with retry mechanism
 */
function initializeTerminalTabs() {
  if (terminalTabsInitialized) {
    return;
  }

  if (typeof nodeId === 'undefined') {
    return;
  }

  if (!window.NP || !window.NP.TerminalTabs) {
    if (initRetryCount < MAX_INIT_RETRIES) {
      initRetryCount++;
      setTimeout(initializeTerminalTabs, 100);
    }
    return;
  }

  var tabBar = document.getElementById('terminalTabBar');
  var terminalPanel = document.getElementById('terminalPanel');
  if (!tabBar || !terminalPanel) {
    if (initRetryCount < MAX_INIT_RETRIES) {
      initRetryCount++;
      setTimeout(initializeTerminalTabs, 100);
    }
    return;
  }

  terminalTabsInitialized = true;

  window.NP.TerminalTabs.init(nodeId);

  migrateOldTerminalState(nodeId);

  var activeTab = window.NP.TerminalTabs.getActiveTab();
  if (activeTab && typeof nodeData !== 'undefined') {
    activeTab.prompt = activeTab.prompt || {};
    activeTab.prompt.username = nodeData.sshUser || activeTab.prompt.username || 'root';
    activeTab.prompt.hostname = nodeData.name || activeTab.prompt.hostname || 'server';
    activeTab.prompt.path = activeTab.prompt.path || activeTab.workingDir || '~';
    window.NP.TerminalTabs.updateTab(activeTab.id, activeTab);
  }

  renderTabs();

  if (activeTab) {
    switchToTab(activeTab.id);
  }

  restoreTerminalTheme();
  setupTerminalInput();
  setupQuickCmdDropdown();
}

/**
 * Setup Enter key handler for terminal input
 */
function setupTerminalInput() {
  var input = document.getElementById('terminalInput');
  if (!input) return;

  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      executeTerminalCommand();
    }
  });
}

/**
 * Setup quick command dropdown toggle
 */
function setupQuickCmdDropdown() {
  var toggle = document.getElementById('quickCmdToggle');
  var menu = document.getElementById('quickCmdMenu');
  if (!toggle || !menu) return;

  toggle.addEventListener('click', function(e) {
    e.stopPropagation();
    menu.classList.toggle('open');
  });

  // Close on outside click
  document.addEventListener('click', function() {
    menu.classList.remove('open');
  });

  // Prevent menu clicks from closing
  menu.addEventListener('click', function(e) {
    e.stopPropagation();
  });
}

/**
 * Migrate old single-terminal state to multi-tab format
 * @param {number} nodeId - Node ID
 */
function migrateOldTerminalState(nodeId) {
  var oldKey = 'nodepulse-terminal-state-' + nodeId;
  var oldState = null;

  try {
    var stored = localStorage.getItem(oldKey);
    if (stored) {
      oldState = JSON.parse(stored);
    }
  } catch(e) {}

  var tabManager = window.NP.TerminalTabs;

  if (oldState && tabManager.tabs.length === 0) {
    var firstTab = tabManager.createTab('Terminal 1');

    firstTab.prompt = {
      username: (typeof nodeData !== 'undefined' && nodeData.sshUser) || 'root',
      hostname: (typeof nodeData !== 'undefined' && nodeData.name) || 'server',
      path: '~'
    };

    firstTab.workingDir = '~';
    firstTab.historyHtml = '';

    tabManager.updateTab(firstTab.id, firstTab);
    tabManager.activeTabId = firstTab.id;
    tabManager.save();

    try {
      localStorage.removeItem(oldKey);
    } catch(e) {}
  }
}

// ==================================================
// Phase 7: Working Directory Tracking
// ==================================================

/**
 * Update working directory locally after cd command
 * @param {Object} tab - Tab object
 * @param {string} newPath - New path from cd command
 */
function updateWorkingDirLocally(tab, newPath) {
  if (!tab || !newPath) {
    return;
  }

  var currentDir = tab.workingDir || '~';
  var resolvedPath;

  if (newPath === '~' || newPath === '') {
    resolvedPath = '~';
  } else if (newPath === '-') {
    resolvedPath = tab.previousDir || '~';
    tab.previousDir = currentDir;
  } else if (newPath === '..') {
    if (currentDir === '~' || currentDir === '/') {
      resolvedPath = currentDir;
    } else {
      var parts = currentDir.split('/');
      parts.pop();
      resolvedPath = parts.length === 0 ? '/' : parts.join('/');
      if (resolvedPath === '') resolvedPath = '/';
    }
  } else if (newPath.charAt(0) === '/') {
    resolvedPath = newPath;
  } else if (newPath.substring(0, 2) === '~/') {
    resolvedPath = newPath;
  } else {
    if (currentDir === '~') {
      resolvedPath = '~/' + newPath;
    } else if (currentDir === '/') {
      resolvedPath = '/' + newPath;
    } else {
      resolvedPath = currentDir + '/' + newPath;
    }
  }

  tab.previousDir = currentDir;
  tab.workingDir = resolvedPath;
  if (!tab.prompt) {
    tab.prompt = {};
  }
  tab.prompt.path = resolvedPath;

  var tabManager = window.NP && window.NP.TerminalTabs;
  if (tabManager && typeof tabManager.updateTab === 'function') {
    tabManager.updateTab(tab.id, tab);
  }
}

// ==================================================
// Phase 8: Real Terminal Command Execution
// ==================================================

/**
 * Execute command and append to history (real terminal style)
 */
function executeTerminalCommand() {
  var nodeIdToUse = (typeof nodeId !== 'undefined') ? nodeId : null;
  if (!nodeIdToUse) {
    console.error('executeTerminalCommand: No nodeId available');
    return;
  }

  var tabManager = window.NP && window.NP.TerminalTabs;
  var activeTab = null;

  if (tabManager && typeof tabManager.getActiveTab === 'function') {
    activeTab = tabManager.getActiveTab();
  }

  var input = document.getElementById('terminalInput');
  var historyEl = document.getElementById('terminalHistory');

  var command = input ? input.value.trim() : '';

  if (!command) {
    return;
  }

  // Handle 'clear' command locally (don't send to server)
  if (command === 'clear' || command === 'cls') {
    clearTerminal();
    return;
  }

  // Add to tab's command history
  if (activeTab && tabManager) {
    if (!activeTab.commandHistory) {
      activeTab.commandHistory = [];
    }
    activeTab.commandHistory.push(command);
  }

  // Build prompt HTML for this command
  var promptHtml = buildPromptHtml(activeTab ? activeTab.prompt : null);

  // Create command entry in history
  var entryDiv = document.createElement('div');
  entryDiv.className = 'terminal-entry';

  var cmdLineDiv = document.createElement('div');
  cmdLineDiv.className = 'terminal-cmd-line';
  cmdLineDiv.innerHTML = '<span class="terminal-prompt">' + promptHtml + '</span> <span class="terminal-cmd-text">' + escapeHtml(command) + '</span>';
  entryDiv.appendChild(cmdLineDiv);

  // Create output placeholder
  var outputDiv = document.createElement('div');
  outputDiv.className = 'terminal-cmd-output loading';
  outputDiv.textContent = 'Ausfuehrung...';
  entryDiv.appendChild(outputDiv);

  // Append to history
  if (historyEl) {
    historyEl.appendChild(entryDiv);
    scrollToBottom();
  }

  // Clear input
  if (input) {
    input.value = '';
  }

  // Working Directory Tracking: Parse cd commands BEFORE sending
  var cdMatch = command.match(/^cd\s*(.*)$/);
  if (cdMatch && activeTab) {
    var newPath = cdMatch[1].trim() || '~';
    updateWorkingDirLocally(activeTab, newPath);
    updatePromptDisplay(activeTab.prompt);
  }

  // Execute command via API
  var xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/commands/execute/' + nodeIdToUse, true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.timeout = 125000;

  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      var response;
      try {
        response = JSON.parse(xhr.responseText);
      } catch(e) {
        outputDiv.textContent = 'Fehler beim Parsen der Antwort.';
        outputDiv.className = 'terminal-cmd-output error';
        return;
      }

      outputDiv.classList.remove('loading');

      if (response.success && response.data) {
        var data = response.data;
        var outputText = '';

        if (data.output) {
          outputText += data.output;
        }

        if (data.error && data.error.trim()) {
          if (data.output) outputText += '\n';
          outputText += data.error;
        }

        if (!data.output && !data.error) {
          outputText = '';
        }

        // Strip ANSI escape codes (for fastfetch, neofetch, etc.)
        outputText = stripAnsiCodes(outputText);

        outputDiv.textContent = outputText;
        outputDiv.className = 'terminal-cmd-output ' + (data.status === 'success' ? 'success' : 'error');

        // Hide empty output
        if (!outputText) {
          outputDiv.style.display = 'none';
        }
      } else if (response.error) {
        outputDiv.textContent = 'Fehler: ' + (response.error.message || 'Unbekannter Fehler');
        outputDiv.className = 'terminal-cmd-output error';
      }

      scrollToBottom();

      // Save history to tab
      if (activeTab && tabManager && historyEl) {
        activeTab.historyHtml = historyEl.innerHTML;
        tabManager.updateTab(activeTab.id, activeTab);
      }
    }
  };

  xhr.onerror = function() {
    outputDiv.textContent = 'Netzwerkfehler beim Ausfuehren des Befehls.';
    outputDiv.className = 'terminal-cmd-output error';
    scrollToBottom();
  };

  xhr.ontimeout = function() {
    outputDiv.textContent = 'Timeout: Befehl dauert zu lange (> 2 Minuten).';
    outputDiv.className = 'terminal-cmd-output error';
    scrollToBottom();
  };

  xhr.send(JSON.stringify({ command: command }));
}

/**
 * Run a quick command directly
 * @param {string} cmd - Command to run
 */
function runQuickCommand(cmd) {
  var input = document.getElementById('terminalInput');
  if (input) {
    input.value = cmd;
  }

  // Close dropdown
  var menu = document.getElementById('quickCmdMenu');
  if (menu) {
    menu.classList.remove('open');
  }

  executeTerminalCommand();
}

/**
 * Clear terminal history
 */
function clearTerminal() {
  var historyEl = document.getElementById('terminalHistory');
  if (historyEl) {
    historyEl.innerHTML = '';
  }

  var tabManager = window.NP && window.NP.TerminalTabs;
  var activeTab = tabManager ? tabManager.getActiveTab() : null;

  if (activeTab && tabManager) {
    activeTab.historyHtml = '';
    tabManager.updateTab(activeTab.id, activeTab);
  }

  // Clear input and refocus
  var input = document.getElementById('terminalInput');
  if (input) {
    input.value = '';
    input.focus();
  }
}

// ==================================================
// Phase 9: Theme Toggle (Light/Dark Mode)
// ==================================================

function toggleTerminalTheme() {
  var panel = document.getElementById('terminalPanel');
  if (!panel) return;

  var isLightMode = panel.classList.contains('light-mode');

  if (isLightMode) {
    panel.classList.remove('light-mode');
    try {
      localStorage.setItem('nodepulse-terminal-theme', 'dark');
    } catch(e) {}
  } else {
    panel.classList.add('light-mode');
    try {
      localStorage.setItem('nodepulse-terminal-theme', 'light');
    } catch(e) {}
  }
}

function restoreTerminalTheme() {
  var theme = 'dark';

  try {
    var stored = localStorage.getItem('nodepulse-terminal-theme');
    if (stored) {
      theme = stored;
    }
  } catch(e) {}

  var panel = document.getElementById('terminalPanel');
  if (panel && theme === 'light') {
    panel.classList.add('light-mode');
  }
}

// ==================================================
// Terminal Panel Toggle (for minimize button & FAB)
// ==================================================

function toggleTerminalPanel() {
  var panel = document.getElementById('terminalPanel');
  var toggleBtn = document.getElementById('terminalToggleBtn');
  if (!panel) return;

  if (panel.classList.contains('hidden')) {
    panel.classList.remove('hidden');
    panel.classList.remove('minimized');
    if (toggleBtn) toggleBtn.style.display = 'none';

    var input = document.getElementById('terminalInput');
    if (input) {
      setTimeout(function() { input.focus(); }, 100);
    }
  } else if (panel.classList.contains('minimized')) {
    panel.classList.remove('minimized');
    if (toggleBtn) toggleBtn.style.display = 'none';

    var input = document.getElementById('terminalInput');
    if (input) {
      setTimeout(function() { input.focus(); }, 100);
    }
  } else {
    panel.classList.add('minimized');
    if (toggleBtn) toggleBtn.style.display = 'flex';
  }
}

// ==================================================
// Auto-Initialize Terminal Tabs on Page Load
// ==================================================

(function() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeTerminalTabs);
  } else {
    initializeTerminalTabs();
  }
})();


// ============================================================
// FROM: services.js (218 lines)
// ============================================================

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


// ============================================================
// FROM: storage.js (375 lines)
// ============================================================

// =====================================================
// Modal Functions
// =====================================================

function openCreateVgModal() {
  var modal = document.getElementById('createVgModal');
  if (modal) {
    modal.style.display = 'flex';
  }
}

function openCreateThinPoolModal() {
  var modal = document.getElementById('createThinPoolModal');
  if (modal) {
    modal.style.display = 'flex';
  }
}

function openRegisterModal(type, vgName, poolName) {
  var modal = document.getElementById('registerStorageModal');
  if (!modal) return;

  document.getElementById('registerType').value = type;
  document.getElementById('registerVgName').value = vgName;
  document.getElementById('registerPoolName').value = poolName || '';

  // Pre-fill storage ID based on VG/Pool name
  var suggestedId = type === 'lvmthin' ? poolName : vgName;
  document.getElementById('storageId').value = suggestedId.toLowerCase().replace(/[^a-z0-9-_]/g, '');

  modal.style.display = 'flex';
}

function closeModal(modalId) {
  var modal = document.getElementById(modalId);
  if (modal) {
    modal.style.display = 'none';
  }
}

// =====================================================
// Toggle Functions
// =====================================================

function toggleStorageSection(titleElement) {
  var section = titleElement.closest('.storage-section');
  if (section) {
    section.classList.toggle('collapsed');
  }
}

// =====================================================
// API Functions
// =====================================================

function refreshLvmData() {
  var btn = event.target.closest('button');
  var originalText = btn.innerHTML;
  btn.innerHTML = '<span class="spinner"></span> Aktualisiere...';
  btn.disabled = true;

  var xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/nodes/' + nodeId + '/storage/lvm/refresh', true);
  xhr.setRequestHeader('Content-Type', 'application/json');

  xhr.onload = function() {
    if (xhr.status === 200) {
      window.location.reload();
    } else {
      var response = JSON.parse(xhr.responseText);
      alert('Fehler: ' + (response.error ? response.error.message : 'Unbekannter Fehler'));
      btn.innerHTML = originalText;
      btn.disabled = false;
    }
  };

  xhr.onerror = function() {
    alert('Netzwerkfehler beim Aktualisieren');
    btn.innerHTML = originalText;
    btn.disabled = false;
  };

  xhr.send();
}

function submitCreateVg(event) {
  event.preventDefault();

  var form = event.target;
  var vgName = form.vg_name.value.trim();
  var deviceCheckboxes = form.querySelectorAll('input[name="devices"]:checked');

  if (!vgName) {
    alert('VG Name ist erforderlich');
    return;
  }

  if (deviceCheckboxes.length === 0) {
    alert('Mindestens ein Device muss ausgewählt werden');
    return;
  }

  var devices = [];
  for (var i = 0; i < deviceCheckboxes.length; i++) {
    devices.push(deviceCheckboxes[i].value);
  }

  var submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="spinner"></span> Erstelle...';

  var xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/nodes/' + nodeId + '/storage/lvm/vg', true);
  xhr.setRequestHeader('Content-Type', 'application/json');

  xhr.onload = function() {
    if (xhr.status === 201) {
      closeModal('createVgModal');
      window.location.reload();
    } else {
      var response = JSON.parse(xhr.responseText);
      alert('Fehler: ' + (response.error ? response.error.message : 'VG konnte nicht erstellt werden'));
      submitBtn.disabled = false;
      submitBtn.innerHTML = 'VG erstellen';
    }
  };

  xhr.onerror = function() {
    alert('Netzwerkfehler');
    submitBtn.disabled = false;
    submitBtn.innerHTML = 'VG erstellen';
  };

  xhr.send(JSON.stringify({
    vg_name: vgName,
    devices: devices
  }));
}

function submitCreateThinPool(event) {
  event.preventDefault();

  var form = event.target;
  var vgName = form.vg_name.value;
  var poolName = form.pool_name.value.trim();
  var sizePercent = parseInt(form.size_percent.value, 10);

  if (!vgName) {
    alert('VG muss ausgewählt werden');
    return;
  }

  if (!poolName) {
    alert('Pool Name ist erforderlich');
    return;
  }

  var submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="spinner"></span> Erstelle...';

  var xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/nodes/' + nodeId + '/storage/lvm/thinpool', true);
  xhr.setRequestHeader('Content-Type', 'application/json');

  xhr.onload = function() {
    if (xhr.status === 201) {
      closeModal('createThinPoolModal');
      window.location.reload();
    } else {
      var response = JSON.parse(xhr.responseText);
      alert('Fehler: ' + (response.error ? response.error.message : 'Thin Pool konnte nicht erstellt werden'));
      submitBtn.disabled = false;
      submitBtn.innerHTML = 'Thin Pool erstellen';
    }
  };

  xhr.onerror = function() {
    alert('Netzwerkfehler');
    submitBtn.disabled = false;
    submitBtn.innerHTML = 'Thin Pool erstellen';
  };

  xhr.send(JSON.stringify({
    vg_name: vgName,
    pool_name: poolName,
    size_percent: sizePercent
  }));
}

function submitRegisterStorage(event) {
  event.preventDefault();

  var form = event.target;
  var type = form.type.value;
  var vgName = form.vg_name.value;
  var poolName = form.pool_name.value;
  var storageId = form.storage_id.value.trim();
  var content = form.content.value;

  if (!storageId) {
    alert('Storage ID ist erforderlich');
    return;
  }

  var submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="spinner"></span> Registriere...';

  var xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/nodes/' + nodeId + '/storage/lvm/register', true);
  xhr.setRequestHeader('Content-Type', 'application/json');

  xhr.onload = function() {
    if (xhr.status === 201) {
      closeModal('registerStorageModal');
      window.location.reload();
    } else {
      var response = JSON.parse(xhr.responseText);
      alert('Fehler: ' + (response.error ? response.error.message : 'Storage konnte nicht registriert werden'));
      submitBtn.disabled = false;
      submitBtn.innerHTML = 'Registrieren';
    }
  };

  xhr.onerror = function() {
    alert('Netzwerkfehler');
    submitBtn.disabled = false;
    submitBtn.innerHTML = 'Registrieren';
  };

  xhr.send(JSON.stringify({
    type: type,
    vg_name: vgName,
    pool_name: poolName,
    storage_id: storageId,
    content: content
  }));
}

function deleteVg(vgName) {
  var modal = document.getElementById('deleteStorageModal');
  if (!modal) return;

  document.getElementById('deleteType').value = 'vg';
  document.getElementById('deleteVgName').value = vgName;
  document.getElementById('deletePoolName').value = '';
  document.getElementById('confirmName').value = '';

  document.getElementById('deleteWarningText').innerHTML =
    'Die Volume Group <strong>' + vgName + '</strong> und alle enthaltenen LVs werden unwiderruflich gelöscht!';
  document.getElementById('confirmHint').innerHTML =
    'Geben Sie <strong>' + vgName + '</strong> ein um zu bestätigen.';

  modal.style.display = 'flex';
}

function deleteThinPool(vgName, poolName) {
  var modal = document.getElementById('deleteStorageModal');
  if (!modal) return;

  document.getElementById('deleteType').value = 'thinpool';
  document.getElementById('deleteVgName').value = vgName;
  document.getElementById('deletePoolName').value = poolName;
  document.getElementById('confirmName').value = '';

  document.getElementById('deleteWarningText').innerHTML =
    'Der Thin Pool <strong>' + poolName + '</strong> und alle Thin LVs werden unwiderruflich gelöscht!';
  document.getElementById('confirmHint').innerHTML =
    'Geben Sie <strong>' + poolName + '</strong> ein um zu bestätigen.';

  modal.style.display = 'flex';
}

function submitDeleteStorage(event) {
  event.preventDefault();

  var form = event.target;
  var type = form.type.value;
  var vgName = form.vg_name.value;
  var poolName = form.pool_name.value;
  var confirmName = form.confirm_name.value.trim();

  var expectedName = type === 'thinpool' ? poolName : vgName;

  if (confirmName !== expectedName) {
    alert('Name stimmt nicht ueberein. Loeschung abgebrochen.');
    return;
  }

  var submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="spinner"></span> Loesche...';

  var url;
  if (type === 'thinpool') {
    url = '/api/nodes/' + nodeId + '/storage/lvm/thinpool/' + encodeURIComponent(vgName) + '/' + encodeURIComponent(poolName);
  } else {
    url = '/api/nodes/' + nodeId + '/storage/lvm/vg/' + encodeURIComponent(vgName);
  }

  var xhr = new XMLHttpRequest();
  xhr.open('DELETE', url, true);
  xhr.setRequestHeader('Content-Type', 'application/json');

  xhr.onload = function() {
    if (xhr.status === 200) {
      closeModal('deleteStorageModal');
      window.location.reload();
    } else {
      var response = JSON.parse(xhr.responseText);
      alert('Fehler: ' + (response.error ? response.error.message : 'Loeschung fehlgeschlagen'));
      submitBtn.disabled = false;
      submitBtn.innerHTML = 'Endgültig löschen';
    }
  };

  xhr.onerror = function() {
    alert('Netzwerkfehler');
    submitBtn.disabled = false;
    submitBtn.innerHTML = 'Endgültig löschen';
  };

  xhr.send(JSON.stringify({
    confirm_name: confirmName
  }));
}

function unregisterStorage(storageId) {
  if (!confirm('Storage "' + storageId + '" aus Proxmox entfernen?\n\nDie Daten bleiben erhalten, aber Proxmox kann nicht mehr darauf zugreifen.')) {
    return;
  }

  var xhr = new XMLHttpRequest();
  xhr.open('DELETE', '/api/nodes/' + nodeId + '/storage/lvm/unregister/' + encodeURIComponent(storageId), true);
  xhr.setRequestHeader('Content-Type', 'application/json');

  xhr.onload = function() {
    if (xhr.status === 200) {
      window.location.reload();
    } else {
      var response = JSON.parse(xhr.responseText);
      alert('Fehler: ' + (response.error ? response.error.message : 'Entfernen fehlgeschlagen'));
    }
  };

  xhr.onerror = function() {
    alert('Netzwerkfehler');
  };

  xhr.send();
}

// =====================================================
// Initialize (close modals on ESC key)
// =====================================================

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    var modals = document.querySelectorAll('.modal');
    for (var i = 0; i < modals.length; i++) {
      if (modals[i].style.display === 'flex') {
        modals[i].style.display = 'none';
      }
    }
  }
});

// Close modal when clicking outside
document.addEventListener('click', function(e) {
  if (e.target.classList.contains('modal')) {
    e.target.style.display = 'none';
  }
});


// ============================================================
// FROM: backup.js (434 lines)
// ============================================================

// =====================================================
// Backup Tab Functions (ES5 compatible)
// =====================================================

var backupData = {
  storages: [],
  backups: [],
  jobs: [],
  summary: {}
};

var activeBackupXHR = null;

// Load backup data from API
function loadBackupData() {
  if (typeof nodeId === 'undefined') return;

  // Cancel any pending request
  if (activeBackupXHR) {
    activeBackupXHR.abort();
    activeBackupXHR = null;
  }

  var xhr = new XMLHttpRequest();
  activeBackupXHR = xhr;
  xhr.open('GET', '/api/nodes/' + nodeId + '/backup', true);
  xhr.timeout = 60000;

  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      activeBackupXHR = null;

      var response;
      try {
        response = JSON.parse(xhr.responseText);
      } catch (e) {
        response = { success: false, error: { message: 'Ungültige Antwort' } };
      }

      if (xhr.status >= 200 && xhr.status < 300 && response.success) {
        backupData = response.data;
        renderBackupData();
      } else {
        var errMsg = response.error ? response.error.message : 'Fehler beim Laden';
        console.error('[Backup] Load error:', errMsg);
      }
    }
  };

  xhr.onerror = function() {
    activeBackupXHR = null;
    console.error('[Backup] Network error');
  };

  xhr.send();
}

// Refresh backup data (with loading indicator)
function refreshBackupData() {
  var btn = document.querySelector('#tab-backup .backup-actions .btn:last-child');
  if (btn) {
    btn.classList.add('loading');
    btn.disabled = true;
  }

  var xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/nodes/' + nodeId + '/backup/refresh', true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.timeout = 120000;

  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      if (btn) {
        btn.classList.remove('loading');
        btn.disabled = false;
      }

      var response;
      try {
        response = JSON.parse(xhr.responseText);
      } catch (e) {
        response = { success: false, error: { message: 'Ungültige Antwort' } };
      }

      if (xhr.status >= 200 && xhr.status < 300 && response.success) {
        // Reload data after refresh
        loadBackupData();
        window.NP && window.NP.UI && window.NP.UI.showToast && window.NP.UI.showToast('Backup-Daten aktualisiert', 'success');
      } else {
        var errMsg = response.error ? response.error.message : 'Aktualisierung fehlgeschlagen';
        alert('Fehler: ' + errMsg);
      }
    }
  };

  xhr.send();
}

// Render backup data (used for dynamic updates)
function renderBackupData() {
  // Update summary cards
  var summaryCards = document.querySelectorAll('#tab-backup .backup-summary .summary-card');
  if (summaryCards.length >= 4 && backupData.summary) {
    summaryCards[0].querySelector('.summary-value').textContent = backupData.summary.total_backups || 0;
    summaryCards[1].querySelector('.summary-value').textContent = window.NP && window.NP.UI ? window.NP.UI.formatBytes(backupData.summary.total_size_bytes || 0) : (backupData.summary.total_size_bytes || 0);
    summaryCards[2].querySelector('.summary-value').textContent = backupData.summary.storage_count || 0;
    summaryCards[3].querySelector('.summary-value').textContent = backupData.summary.job_count || 0;
  }

  // Update badge in tab button
  var tabBadge = document.querySelector('[data-tab="backup"] .tab-badge');
  if (tabBadge && backupData.summary) {
    tabBadge.textContent = backupData.summary.total_backups || 0;
  }

  // Re-render backups list will be done via filterBackups
  filterBackups();
}

// Filter backups
function filterBackups() {
  var searchEl = document.getElementById('backup-search');
  var typeFilterEl = document.getElementById('backup-type-filter');
  var listEl = document.getElementById('backups-list');

  if (!listEl) return;

  var searchTerm = searchEl ? searchEl.value.toLowerCase() : '';
  var typeFilter = typeFilterEl ? typeFilterEl.value : '';

  var filtered = (backupData.backups || []).filter(function(bkp) {
    var matchesSearch = !searchTerm ||
      String(bkp.vmid).indexOf(searchTerm) !== -1 ||
      (bkp.storage && bkp.storage.toLowerCase().indexOf(searchTerm) !== -1) ||
      (bkp.notes && bkp.notes.toLowerCase().indexOf(searchTerm) !== -1);
    var matchesType = !typeFilter || bkp.vmtype === typeFilter;
    return matchesSearch && matchesType;
  });

  if (filtered.length === 0) {
    listEl.innerHTML = '<div class="empty-state compact"><p>Keine Backups gefunden.</p></div>';
    return;
  }

  var html = '<div class="backup-table-wrapper"><table class="backup-table">';
  html += '<thead><tr><th>VMID</th><th>Typ</th><th>Storage</th><th>Größe</th><th>Erstellt</th><th>Notizen</th><th>Aktionen</th></tr></thead>';
  html += '<tbody>';

  for (var i = 0; i < filtered.length; i++) {
    var bkp = filtered[i];
    var typeBadge = bkp.vmtype === 'qemu' ? 'vm' : 'ct';
    var typeLabel = bkp.vmtype === 'qemu' ? 'VM' : 'CT';
    var sizeStr = window.NP && window.NP.UI ? window.NP.UI.formatBytes(bkp.size || 0) : (bkp.size || 0);
    var timeStr = formatBackupTime(bkp.ctime);
    var fullDate = bkp.ctime ? new Date(bkp.ctime * 1000).toLocaleString('de-DE') : '-';

    html += '<tr data-vmid="' + bkp.vmid + '" data-type="' + bkp.vmtype + '">';
    html += '<td><strong>' + bkp.vmid + '</strong></td>';
    html += '<td><span class="badge badge-' + typeBadge + '">' + typeLabel + '</span></td>';
    html += '<td>' + escapeHtml(bkp.storage || '-') + '</td>';
    html += '<td>' + sizeStr + '</td>';
    html += '<td title="' + fullDate + '">' + timeStr + '</td>';
    html += '<td class="backup-notes">' + escapeHtml(bkp.notes || '-') + '</td>';
    html += '<td class="actions-cell">';
    html += '<button type="button" class="btn btn-sm btn-primary" onclick="openRestoreModal(\'' + escapeForAttr(bkp.volid) + '\', \'' + bkp.vmtype + '\', ' + bkp.vmid + ')" title="Wiederherstellen">';
    html += '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>';
    html += '</button>';
    html += '<button type="button" class="btn btn-sm btn-danger" onclick="deleteBackup(\'' + escapeForAttr(bkp.volid) + '\')" title="Löschen">';
    html += '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
    html += '</button>';
    html += '</td></tr>';
  }

  html += '</tbody></table></div>';
  listEl.innerHTML = html;
}

// Format backup time as "time ago"
function formatBackupTime(timestamp) {
  if (!timestamp) return '-';
  var now = Math.floor(Date.now() / 1000);
  var diff = now - timestamp;
  if (diff < 60) return 'gerade eben';
  if (diff < 3600) return Math.floor(diff / 60) + ' Min.';
  if (diff < 86400) return Math.floor(diff / 3600) + ' Std.';
  if (diff < 604800) return Math.floor(diff / 86400) + ' Tage';
  return new Date(timestamp * 1000).toLocaleDateString('de-DE');
}

// Escape HTML
function escapeHtml(str) {
  if (!str) return '';
  var div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Escape for attribute (single quotes)
function escapeForAttr(str) {
  if (!str) return '';
  return String(str).replace(/'/g, "\\'").replace(/"/g, '\\"');
}

// Toggle collapsible backup section
function toggleBackupSection(headerEl) {
  var section = headerEl.parentElement;
  var content = section.querySelector('.section-content');
  var icon = headerEl.querySelector('.collapse-icon');

  if (section.classList.contains('collapsed')) {
    section.classList.remove('collapsed');
    if (content) content.style.display = 'block';
  } else {
    section.classList.add('collapsed');
    if (content) content.style.display = 'none';
  }
}

// =====================================================
// Modal Functions
// =====================================================

function openCreateBackupModal() {
  var modal = document.getElementById('createBackupModal');
  if (modal) {
    modal.style.display = 'flex';
  }
}

function openRestoreModal(volid, vmtype, originalVmid) {
  document.getElementById('restoreVolid').value = volid;
  document.getElementById('restoreType').value = vmtype;
  document.getElementById('restoreVmid').value = originalVmid + 1000; // Suggest new VMID

  var modal = document.getElementById('restoreBackupModal');
  if (modal) {
    modal.style.display = 'flex';
  }
}

function deleteBackup(volid) {
  document.getElementById('deleteVolid').value = volid;
  document.getElementById('confirmVolid').value = '';
  document.getElementById('deleteBackupHint').textContent = 'Volume-ID: ' + volid;

  var modal = document.getElementById('deleteBackupModal');
  if (modal) {
    modal.style.display = 'flex';
  }
}

function closeModal(modalId) {
  var modal = document.getElementById(modalId);
  if (modal) {
    modal.style.display = 'none';
  }
}

// =====================================================
// Form Submissions
// =====================================================

function submitCreateBackup(event) {
  event.preventDefault();

  var form = document.getElementById('createBackupForm');
  var formData = new FormData(form);

  var data = {
    vmid: parseInt(formData.get('vmid'), 10),
    storage: formData.get('storage') || undefined,
    mode: formData.get('mode'),
    compress: formData.get('compress'),
    notes: formData.get('notes') || undefined
  };

  var btn = form.querySelector('button[type="submit"]');
  if (btn) {
    btn.classList.add('loading');
    btn.disabled = true;
  }

  var xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/nodes/' + nodeId + '/backup/create', true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.timeout = 600000; // 10 min for backup

  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      if (btn) {
        btn.classList.remove('loading');
        btn.disabled = false;
      }

      var response;
      try {
        response = JSON.parse(xhr.responseText);
      } catch (e) {
        response = { success: false, error: { message: 'Ungültige Antwort' } };
      }

      if (xhr.status >= 200 && xhr.status < 300 && response.success) {
        closeModal('createBackupModal');
        form.reset();
        loadBackupData();
        window.NP && window.NP.UI && window.NP.UI.showToast && window.NP.UI.showToast('Backup erfolgreich erstellt', 'success');
      } else {
        var errMsg = response.error ? response.error.message : 'Backup fehlgeschlagen';
        alert('Fehler: ' + errMsg);
      }
    }
  };

  xhr.send(JSON.stringify(data));
}

function submitRestoreBackup(event) {
  event.preventDefault();

  var form = document.getElementById('restoreBackupForm');
  var formData = new FormData(form);

  var data = {
    volid: formData.get('volid'),
    target_vmid: parseInt(formData.get('target_vmid'), 10),
    target_storage: formData.get('target_storage') || undefined,
    start: document.getElementById('restoreStart').checked
  };

  var btn = form.querySelector('button[type="submit"]');
  if (btn) {
    btn.classList.add('loading');
    btn.disabled = true;
  }

  var xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/nodes/' + nodeId + '/backup/restore', true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.timeout = 1800000; // 30 min for restore

  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      if (btn) {
        btn.classList.remove('loading');
        btn.disabled = false;
      }

      var response;
      try {
        response = JSON.parse(xhr.responseText);
      } catch (e) {
        response = { success: false, error: { message: 'Ungültige Antwort' } };
      }

      if (xhr.status >= 200 && xhr.status < 300 && response.success) {
        closeModal('restoreBackupModal');
        form.reset();
        window.NP && window.NP.UI && window.NP.UI.showToast && window.NP.UI.showToast('Restore erfolgreich', 'success');
      } else {
        var errMsg = response.error ? response.error.message : 'Restore fehlgeschlagen';
        alert('Fehler: ' + errMsg);
      }
    }
  };

  xhr.send(JSON.stringify(data));
}

function submitDeleteBackup(event) {
  event.preventDefault();

  var form = document.getElementById('deleteBackupForm');
  var volid = document.getElementById('deleteVolid').value;
  var confirmVolid = document.getElementById('confirmVolid').value;

  if (confirmVolid !== volid) {
    alert('Die Volume-ID stimmt nicht ueberein.');
    return;
  }

  var btn = form.querySelector('button[type="submit"]');
  if (btn) {
    btn.classList.add('loading');
    btn.disabled = true;
  }

  var xhr = new XMLHttpRequest();
  xhr.open('DELETE', '/api/nodes/' + nodeId + '/backup/' + encodeURIComponent(volid), true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.timeout = 60000;

  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      if (btn) {
        btn.classList.remove('loading');
        btn.disabled = false;
      }

      var response;
      try {
        response = JSON.parse(xhr.responseText);
      } catch (e) {
        response = { success: false, error: { message: 'Ungültige Antwort' } };
      }

      if (xhr.status >= 200 && xhr.status < 300 && response.success) {
        closeModal('deleteBackupModal');
        loadBackupData();
        window.NP && window.NP.UI && window.NP.UI.showToast && window.NP.UI.showToast('Backup gelöscht', 'success');
      } else {
        var errMsg = response.error ? response.error.message : 'Löschen fehlgeschlagen';
        alert('Fehler: ' + errMsg);
      }
    }
  };

  xhr.send(JSON.stringify({ confirm_volid: volid }));
}

// =====================================================
// Initialize on tab click
// =====================================================

var backupTabBtn = document.querySelector('[data-tab="backup"]');
if (backupTabBtn && !backupTabBtn.hasAttribute('data-backup-listener')) {
  backupTabBtn.addEventListener('click', function() {
    // Load data if not already loaded
    if (!backupData.backups || backupData.backups.length === 0) {
      loadBackupData();
    }
  });
  backupTabBtn.setAttribute('data-backup-listener', 'true');
}


// ============================================================
// FROM: tasks.js (523 lines)
// ============================================================

// =====================================================
// Tasks Tab Functions (ES5 compatible)
// =====================================================

var taskData = {
  tasks: [],
  counts: { total: 0, running: 0, ok: 0, error: 0 },
  types: []
};

var activeTaskXHR = null;
var currentTaskUpid = null;
var taskLogAutoRefreshInterval = null;

// Pagination
var taskPageSize = 10;
var taskCurrentPage = 1;
var taskTotalPages = 1;

// Load task data from API (with pagination)
function loadTaskData(page) {
  if (typeof nodeId === 'undefined') return;

  page = page || taskCurrentPage;
  taskCurrentPage = page;

  // Cancel any pending request
  if (activeTaskXHR) {
    activeTaskXHR.abort();
    activeTaskXHR = null;
  }

  // Build URL with pagination
  var offset = (page - 1) * taskPageSize;
  var url = '/api/nodes/' + nodeId + '/tasks?limit=' + taskPageSize + '&offset=' + offset;

  // Add filters if set
  var typeFilter = document.getElementById('task-type-filter');
  var statusFilter = document.getElementById('task-status-filter');
  if (typeFilter && typeFilter.value) {
    url += '&type=' + encodeURIComponent(typeFilter.value);
  }
  if (statusFilter && statusFilter.value) {
    url += '&status=' + encodeURIComponent(statusFilter.value);
  }

  var xhr = new XMLHttpRequest();
  activeTaskXHR = xhr;
  xhr.open('GET', url, true);
  xhr.timeout = 60000;

  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      activeTaskXHR = null;

      var response;
      try {
        response = JSON.parse(xhr.responseText);
      } catch (e) {
        response = { success: false, error: { message: 'Ungültige Antwort' } };
      }

      if (xhr.status >= 200 && xhr.status < 300 && response.success) {
        taskData = response.data;
        // Calculate total pages
        taskTotalPages = Math.ceil((taskData.counts.total || 0) / taskPageSize);
        if (taskTotalPages < 1) taskTotalPages = 1;
        renderTaskData();
      } else {
        var errMsg = response.error ? response.error.message : 'Fehler beim Laden';
        console.error('[Tasks] Load error:', errMsg);
      }
    }
  };

  xhr.onerror = function() {
    activeTaskXHR = null;
    console.error('[Tasks] Network error');
  };

  xhr.send();
}

// Refresh tasks (via POST to refresh endpoint)
function refreshTasks() {
  var btn = document.querySelector('#tab-tasks .task-actions .btn');
  if (btn) {
    btn.classList.add('loading');
    btn.disabled = true;
  }

  var xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/nodes/' + nodeId + '/tasks/refresh', true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.timeout = 120000;

  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      if (btn) {
        btn.classList.remove('loading');
        btn.disabled = false;
      }

      var response;
      try {
        response = JSON.parse(xhr.responseText);
      } catch (e) {
        response = { success: false, error: { message: 'Ungültige Antwort' } };
      }

      if (xhr.status >= 200 && xhr.status < 300 && response.success) {
        // Reload data after refresh
        loadTaskData();
        window.NP && window.NP.UI && window.NP.UI.showToast && window.NP.UI.showToast('Tasks aktualisiert', 'success');
      } else {
        var errMsg = response.error ? response.error.message : 'Aktualisierung fehlgeschlagen';
        alert('Fehler: ' + errMsg);
      }
    }
  };

  xhr.send();
}

// Render task data
function renderTaskData() {
  // Update summary cards
  var summaryCards = document.querySelectorAll('#tab-tasks .task-summary .summary-card');
  if (summaryCards.length >= 4 && taskData.counts) {
    summaryCards[0].querySelector('.summary-value').textContent = taskData.counts.total || 0;
    summaryCards[1].querySelector('.summary-value').textContent = taskData.counts.running || 0;
    summaryCards[2].querySelector('.summary-value').textContent = taskData.counts.ok || 0;
    summaryCards[3].querySelector('.summary-value').textContent = taskData.counts.error || 0;
  }

  // Update type filter options (only if types changed)
  var typeFilter = document.getElementById('task-type-filter');
  if (typeFilter && taskData.types && taskData.types.length > 0) {
    var currentValue = typeFilter.value;
    // Only rebuild if empty or types changed
    if (typeFilter.options.length <= 1) {
      typeFilter.innerHTML = '<option value="">Alle Typen</option>';
      for (var i = 0; i < taskData.types.length; i++) {
        var opt = document.createElement('option');
        opt.value = taskData.types[i];
        opt.textContent = getTaskTypeLabel(taskData.types[i]);
        typeFilter.appendChild(opt);
      }
      typeFilter.value = currentValue;
    }
  }

  // Render the tasks list
  renderTasksList();
}

// Get task type label
function getTaskTypeLabel(type) {
  var labels = {
    'vzdump': 'Backup',
    'vzrestore': 'Restore',
    'vzcreate': 'CT Create',
    'vzstart': 'CT Start',
    'vzstop': 'CT Stop',
    'qmcreate': 'VM Create',
    'qmstart': 'VM Start',
    'qmstop': 'VM Stop',
    'qmreboot': 'VM Reboot',
    'qmshutdown': 'VM Shutdown',
    'qmreset': 'VM Reset',
    'qmsuspend': 'VM Suspend',
    'qmresume': 'VM Resume',
    'qmclone': 'VM Clone',
    'qmmigrate': 'VM Migrate',
    'qmrestore': 'VM Restore',
    'qmconfig': 'VM Config',
    'qmtemplate': 'VM Template',
    'imgcopy': 'Disk Copy',
    'download': 'Download',
    'aptupdate': 'APT Update',
    'startall': 'Start All',
    'stopall': 'Stop All'
  };
  return labels[type] || type;
}

// Get task status class
function getTaskStatusClass(task) {
  if (task.status === 'running') return 'running';
  if (task.status === 'OK' || task.exitstatus === 'OK') return 'ok';
  if (task.exitstatus && task.exitstatus !== '' && task.exitstatus !== 'OK') return 'error';
  if (task.status && task.status !== 'running' && task.status !== 'OK' && task.status !== '') return 'error';
  return 'unknown';
}

// Format time ago
function formatTaskTimeAgo(timestamp) {
  if (!timestamp) return '-';
  var now = Math.floor(Date.now() / 1000);
  var diff = now - timestamp;
  if (diff < 60) return 'gerade eben';
  if (diff < 3600) return Math.floor(diff / 60) + ' Min.';
  if (diff < 86400) return Math.floor(diff / 3600) + ' Std.';
  if (diff < 604800) return Math.floor(diff / 86400) + ' Tage';
  return new Date(timestamp * 1000).toLocaleDateString('de-DE');
}

// Format duration
function formatTaskDuration(starttime, endtime) {
  if (!starttime) return '-';
  var end = endtime || Math.floor(Date.now() / 1000);
  var duration = end - starttime;
  if (duration < 60) return duration + 's';
  if (duration < 3600) return Math.floor(duration / 60) + 'm ' + (duration % 60) + 's';
  return Math.floor(duration / 3600) + 'h ' + Math.floor((duration % 3600) / 60) + 'm';
}

// Filter tasks (resets to page 1 and reloads from server)
function filterTasks() {
  taskCurrentPage = 1;
  loadTaskData(1);
}

// Render tasks list (called after data is loaded)
function renderTasksList() {
  var listEl = document.getElementById('tasks-list');
  if (!listEl) return;

  var tasks = taskData.tasks || [];

  if (tasks.length === 0) {
    listEl.innerHTML = '<div class="empty-state compact"><p>Keine Tasks gefunden.</p><p class="text-muted">Starten Sie eine Aktion in Proxmox oder aktualisieren Sie die Liste.</p></div>';
    return;
  }

  var html = '<div class="task-table-wrapper"><table class="task-table">';
  html += '<thead><tr><th>Typ</th><th>VMID</th><th>User</th><th>Status</th><th>Gestartet</th><th>Dauer</th><th>Aktionen</th></tr></thead>';
  html += '<tbody>';

  for (var i = 0; i < tasks.length; i++) {
    var task = tasks[i];
    var statusClass = getTaskStatusClass(task);
    var timeStr = formatTaskTimeAgo(task.starttime);
    var fullDate = task.starttime ? new Date(task.starttime * 1000).toLocaleString('de-DE') : '-';
    var durationStr = formatTaskDuration(task.starttime, task.endtime);

    html += '<tr data-upid="' + escapeTaskAttr(task.upid) + '" data-type="' + task.task_type + '" data-vmid="' + (task.vmid || '') + '" data-status="' + statusClass + '">';
    html += '<td><span class="task-type-badge">' + getTaskTypeLabel(task.task_type) + '</span></td>';
    html += '<td>' + (task.vmid || '-') + '</td>';
    html += '<td class="task-user">' + escapeTaskHtml(task.user || '-') + '</td>';
    html += '<td><span class="task-status ' + statusClass + '">';
    if (task.status === 'running') {
      html += '<span class="spinner-mini"></span> Laufend';
    } else if (task.status === 'OK' || task.exitstatus === 'OK') {
      html += 'OK';
    } else if ((task.exitstatus && task.exitstatus !== 'OK') || (task.status && task.status !== 'running' && task.status !== 'OK' && task.status !== '')) {
      html += 'Fehler';
    } else {
      html += escapeTaskHtml(task.status || '-');
    }
    html += '</span></td>';
    html += '<td title="' + fullDate + '">' + timeStr + '</td>';
    html += '<td>' + durationStr + '</td>';
    html += '<td class="actions-cell">';
    html += '<button type="button" class="btn btn-sm" onclick="showTaskLog(\'' + escapeTaskAttr(task.upid) + '\')" title="Log anzeigen">';
    html += '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>';
    html += '</button>';
    if (task.status === 'running') {
      html += '<button type="button" class="btn btn-sm btn-danger" onclick="stopTask(\'' + escapeTaskAttr(task.upid) + '\')" title="Task stoppen">';
      html += '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="6" width="12" height="12"/></svg>';
      html += '</button>';
    }
    html += '</td></tr>';
  }

  html += '</tbody></table></div>';

  // Add pagination controls
  html += renderTaskPagination();

  listEl.innerHTML = html;
}

// Render pagination controls
function renderTaskPagination() {
  if (taskTotalPages <= 1) return '';

  var html = '<div class="task-pagination">';
  html += '<button type="button" class="btn btn-sm" onclick="goToTaskPage(1)" ' + (taskCurrentPage <= 1 ? 'disabled' : '') + '>&laquo;</button>';
  html += '<button type="button" class="btn btn-sm" onclick="goToTaskPage(' + (taskCurrentPage - 1) + ')" ' + (taskCurrentPage <= 1 ? 'disabled' : '') + '>&lsaquo;</button>';
  html += '<span class="pagination-info">Seite ' + taskCurrentPage + ' von ' + taskTotalPages + '</span>';
  html += '<button type="button" class="btn btn-sm" onclick="goToTaskPage(' + (taskCurrentPage + 1) + ')" ' + (taskCurrentPage >= taskTotalPages ? 'disabled' : '') + '>&rsaquo;</button>';
  html += '<button type="button" class="btn btn-sm" onclick="goToTaskPage(' + taskTotalPages + ')" ' + (taskCurrentPage >= taskTotalPages ? 'disabled' : '') + '>&raquo;</button>';
  html += '</div>';
  return html;
}

// Navigate to specific page
function goToTaskPage(page) {
  if (page < 1) page = 1;
  if (page > taskTotalPages) page = taskTotalPages;
  if (page === taskCurrentPage) return;
  loadTaskData(page);
}

// Escape HTML for tasks
function escapeTaskHtml(str) {
  if (!str) return '';
  var div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Escape for attribute (tasks)
function escapeTaskAttr(str) {
  if (!str) return '';
  return String(str).replace(/'/g, "\\'").replace(/"/g, '\\"');
}

// =====================================================
// Task Log Modal
// =====================================================

function showTaskLog(upid) {
  currentTaskUpid = upid;

  // Update modal info
  var upidEl = document.getElementById('taskLogUpid');
  if (upidEl) upidEl.textContent = upid;

  var logContent = document.getElementById('taskLogContent');
  if (logContent) logContent.textContent = 'Lade Log...';

  var statusEl = document.getElementById('taskLogStatus');
  if (statusEl) statusEl.className = 'task-status';

  // Show modal
  var modal = document.getElementById('taskLogModal');
  if (modal) {
    modal.style.display = 'flex';
  }

  // Load log
  loadTaskLog(upid);
}

function loadTaskLog(upid) {
  var xhr = new XMLHttpRequest();
  xhr.open('GET', '/api/nodes/' + nodeId + '/tasks/' + encodeURIComponent(upid) + '/log', true);
  xhr.timeout = 30000;

  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      var response;
      try {
        response = JSON.parse(xhr.responseText);
      } catch (e) {
        response = { success: false, error: { message: 'Ungültige Antwort' } };
      }

      var logContent = document.getElementById('taskLogContent');
      if (xhr.status >= 200 && xhr.status < 300 && response.success) {
        var lines = response.data.lines || [];
        var logText = '';
        for (var i = 0; i < lines.length; i++) {
          logText += lines[i].text + '\n';
        }
        if (logContent) logContent.textContent = logText || 'Kein Log verfügbar.';
      } else {
        var errMsg = response.error ? response.error.message : 'Fehler beim Laden des Logs';
        if (logContent) logContent.textContent = 'Fehler: ' + errMsg;
      }
    }
  };

  xhr.send();

  // Also update status
  loadTaskStatus(upid);
}

function loadTaskStatus(upid) {
  var xhr = new XMLHttpRequest();
  xhr.open('GET', '/api/nodes/' + nodeId + '/tasks/' + encodeURIComponent(upid) + '/status', true);
  xhr.timeout = 30000;

  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      var response;
      try {
        response = JSON.parse(xhr.responseText);
      } catch (e) {
        response = { success: false, error: { message: 'Ungültige Antwort' } };
      }

      var statusEl = document.getElementById('taskLogStatus');
      if (xhr.status >= 200 && xhr.status < 300 && response.success) {
        var status = response.data;
        var statusClass = 'unknown';
        var statusText = status.status || '-';

        if (status.status === 'running') {
          statusClass = 'running';
          statusText = 'Laufend';
        } else if (status.exitstatus === 'OK') {
          statusClass = 'ok';
          statusText = 'OK';
        } else if (status.exitstatus) {
          statusClass = 'error';
          statusText = 'Fehler: ' + status.exitstatus;
        }

        if (statusEl) {
          statusEl.className = 'task-status ' + statusClass;
          statusEl.textContent = statusText;
        }
      }
    }
  };

  xhr.send();
}

function refreshTaskLog() {
  if (currentTaskUpid) {
    loadTaskLog(currentTaskUpid);
  }
}

function toggleTaskLogAutoRefresh() {
  var checkbox = document.getElementById('taskLogAutoRefresh');
  if (checkbox && checkbox.checked) {
    // Start auto-refresh
    taskLogAutoRefreshInterval = setInterval(function() {
      if (currentTaskUpid) {
        loadTaskLog(currentTaskUpid);
      }
    }, 2000);
  } else {
    // Stop auto-refresh
    if (taskLogAutoRefreshInterval) {
      clearInterval(taskLogAutoRefreshInterval);
      taskLogAutoRefreshInterval = null;
    }
  }
}

// =====================================================
// Stop Task
// =====================================================

function stopTask(upid) {
  if (!confirm('Moechten Sie diesen Task wirklich stoppen?')) {
    return;
  }

  var xhr = new XMLHttpRequest();
  xhr.open('DELETE', '/api/nodes/' + nodeId + '/tasks/' + encodeURIComponent(upid), true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.timeout = 30000;

  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      var response;
      try {
        response = JSON.parse(xhr.responseText);
      } catch (e) {
        response = { success: false, error: { message: 'Ungültige Antwort' } };
      }

      if (xhr.status >= 200 && xhr.status < 300 && response.success) {
        loadTaskData();
        window.NP && window.NP.UI && window.NP.UI.showToast && window.NP.UI.showToast('Task gestoppt', 'success');
      } else {
        var errMsg = response.error ? response.error.message : 'Stoppen fehlgeschlagen';
        alert('Fehler: ' + errMsg);
      }
    }
  };

  xhr.send();
}

// =====================================================
// Close Modal
// =====================================================

function closeTaskModal(modalId) {
  // Stop auto-refresh when closing modal
  if (taskLogAutoRefreshInterval) {
    clearInterval(taskLogAutoRefreshInterval);
    taskLogAutoRefreshInterval = null;
  }

  var checkbox = document.getElementById('taskLogAutoRefresh');
  if (checkbox) checkbox.checked = false;

  currentTaskUpid = null;

  var modal = document.getElementById(modalId);
  if (modal) {
    modal.style.display = 'none';
  }
}

// =====================================================
// Initialize on tab click
// =====================================================

var taskTabInitialized = false;
var taskTabBtn = document.querySelector('[data-tab="tasks"]');
if (taskTabBtn && !taskTabBtn.hasAttribute('data-task-listener')) {
  taskTabBtn.addEventListener('click', function() {
    // Load first page on first tab click
    if (!taskTabInitialized) {
      taskTabInitialized = true;
      taskCurrentPage = 1;
      loadTaskData(1);
    }
  });
  taskTabBtn.setAttribute('data-task-listener', 'true');
}


// ============================================================
// FROM: network.js (654 lines)
// ============================================================

// =====================================================

// Network Diagnostics Functions
// =====================================================
var networkData = null;
var activeNetworkXHR = null;

function loadNetworkDiagnostics(nodeId) {
  var contentEl = document.getElementById('network-content');
  var btn = document.getElementById('btn-refresh-network');

  if (!contentEl) return;

  if (activeNetworkXHR) {
    activeNetworkXHR.abort();
    activeNetworkXHR = null;
  }

  contentEl.innerHTML = '<div class="loading-placeholder"><span class="spinner"></span><span>Netzwerk-Informationen werden geladen...</span></div>';

  if (btn) {
    btn.classList.add('loading');
    btn.disabled = true;
  }

  var xhr = new XMLHttpRequest();
  activeNetworkXHR = xhr;
  xhr.open('GET', '/api/nodes/' + nodeId + '/network', true);
  xhr.timeout = 120000;

  function resetState() {
    activeNetworkXHR = null;
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
        response = { success: false, error: { message: 'Ungültige Antwort' } };
      }

      if (xhr.status >= 200 && xhr.status < 300 && response.success) {
        networkData = response.data;
        renderNetworkDiagnostics();
      } else {
        var errMsg = response.error ? response.error.message : 'Fehler beim Laden';
        contentEl.innerHTML = '<div class="empty-state"><p>' + escapeHtml(errMsg) + '</p><button class="btn btn-secondary" onclick="loadNetworkDiagnostics(' + nodeId + ')">Erneut versuchen</button></div>';
      }
    }
  };

  xhr.onerror = function() {
    resetState();
    contentEl.innerHTML = '<div class="empty-state"><p>Netzwerkfehler</p></div>';
  };

  xhr.ontimeout = function() {
    resetState();
    contentEl.innerHTML = '<div class="empty-state"><p>Timeout</p></div>';
  };

  xhr.send();
}

function renderNetworkDiagnostics() {
  var contentEl = document.getElementById('network-content');
  if (!contentEl || !networkData) return;

  var d = networkData;

  // Update Summary Cards
  var interfacesEl = document.getElementById('network-interfaces');
  var portsEl = document.getElementById('network-ports');
  var connectionsEl = document.getElementById('network-connections');
  var dnsEl = document.getElementById('network-dns');

  var interfaceCount = d.interfaces ? d.interfaces.length : 0;
  var portCount = d.listening_ports ? d.listening_ports.length : 0;
  var connectionCount = d.connections ? (d.connections.established || 0) : 0;
  var dnsCount = d.dns && d.dns.nameservers ? d.dns.nameservers.length : 0;

  if (interfacesEl) interfacesEl.textContent = interfaceCount;
  if (portsEl) portsEl.textContent = portCount;
  if (connectionsEl) connectionsEl.textContent = connectionCount;
  if (dnsEl) dnsEl.textContent = dnsCount;

  var html = '<div class="network-grid">';

  // Connectivity Status
  html += '<div class="network-card network-card-status">';
  html += '<div class="network-card-header"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg><span>Konnektivitaet</span></div>';
  html += '<div class="network-card-body">';
  if (d.gateway) {
    html += '<div class="status-row"><span>Gateway:</span><span class="badge ' + (d.gateway.reachable ? 'badge-success' : 'badge-error') + '">' + (d.gateway.ip || '-') + '</span></div>';
    if (d.gateway.latency_ms) {
      html += '<div class="status-row"><span>Gateway Latenz:</span><span>' + d.gateway.latency_ms + ' ms</span></div>';
    }
  }
  if (d.internet) {
    html += '<div class="status-row"><span>DNS:</span><span class="badge ' + (d.internet.dns_working ? 'badge-success' : 'badge-error') + '">' + (d.internet.dns_working ? 'OK' : 'Fehler') + '</span></div>';
    html += '<div class="status-row"><span>Internet:</span><span class="badge ' + (d.internet.connectivity ? 'badge-success' : 'badge-error') + '">' + (d.internet.connectivity ? 'Verbunden' : 'Offline') + '</span></div>';
  }
  html += '</div></div>';

  // Interfaces
  if (d.interfaces && d.interfaces.length > 0) {
    html += '<div class="network-card network-card-wide">';
    html += '<div class="network-card-header"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg><span>Interfaces (' + d.interfaces.length + ')</span></div>';
    html += '<div class="network-card-body"><table class="network-table"><thead><tr><th>Name</th><th>Status</th><th>IP</th><th>MAC</th><th>Speed</th><th>RX/TX</th></tr></thead><tbody>';
    for (var i = 0; i < d.interfaces.length; i++) {
      var iface = d.interfaces[i];
      var stateClass = iface.state === 'UP' ? 'badge-success' : 'badge-muted';
      var rxMB = iface.rx_bytes ? (iface.rx_bytes / 1048576).toFixed(1) : '0';
      var txMB = iface.tx_bytes ? (iface.tx_bytes / 1048576).toFixed(1) : '0';
      html += '<tr>';
      html += '<td><strong>' + escapeHtml(iface.name) + '</strong></td>';
      html += '<td><span class="badge ' + stateClass + '">' + escapeHtml(iface.state || '-') + '</span></td>';
      html += '<td>' + escapeHtml(iface.ipv4 || '-') + '</td>';
      html += '<td class="mono">' + escapeHtml(iface.mac || '-') + '</td>';
      html += '<td>' + (iface.speed ? iface.speed + ' Mbps' : '-') + '</td>';
      html += '<td>' + rxMB + ' / ' + txMB + ' MB</td>';
      html += '</tr>';
    }
    html += '</tbody></table></div></div>';
  }

  // DNS Configuration
  if (d.dns) {
    html += '<div class="network-card">';
    html += '<div class="network-card-header"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg><span>DNS</span></div>';
    html += '<div class="network-card-body">';
    html += '<div class="status-row"><span>Nameserver:</span><span>' + (d.dns.nameservers ? d.dns.nameservers.join(', ') : '-') + '</span></div>';
    if (d.dns.search_domains && d.dns.search_domains.length > 0) {
      html += '<div class="status-row"><span>Search:</span><span>' + d.dns.search_domains.join(', ') + '</span></div>';
    }
    html += '</div></div>';
  }

  // Firewall
  if (d.firewall) {
    html += '<div class="network-card">';
    html += '<div class="network-card-header"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg><span>Firewall</span></div>';
    html += '<div class="network-card-body">';
    html += '<div class="status-row"><span>Typ:</span><span>' + escapeHtml(d.firewall.type || 'none') + '</span></div>';
    html += '<div class="status-row"><span>Status:</span><span class="badge ' + (d.firewall.status === 'active' ? 'badge-success' : 'badge-muted') + '">' + escapeHtml(d.firewall.status || '-') + '</span></div>';
    html += '<div class="status-row"><span>Regeln:</span><span>' + (d.firewall.rules_count || 0) + '</span></div>';
    html += '</div></div>';
  }

  // Connections Summary
  if (d.connections) {
    html += '<div class="network-card">';
    html += '<div class="network-card-header"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg><span>Verbindungen</span></div>';
    html += '<div class="network-card-body">';
    html += '<div class="status-row"><span>Established:</span><span class="badge badge-success">' + (d.connections.established || 0) + '</span></div>';
    html += '<div class="status-row"><span>Time Wait:</span><span>' + (d.connections.time_wait || 0) + '</span></div>';
    html += '<div class="status-row"><span>Close Wait:</span><span>' + (d.connections.close_wait || 0) + '</span></div>';
    html += '</div></div>';
  }

  // Listening Ports
  if (d.listening_ports && d.listening_ports.length > 0) {
    html += '<div class="network-card network-card-wide">';
    html += '<div class="network-card-header"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg><span>Listening Ports (' + d.listening_ports.length + ')</span></div>';
    html += '<div class="network-card-body"><div class="ports-grid">';
    for (var j = 0; j < Math.min(d.listening_ports.length, 20); j++) {
      var port = d.listening_ports[j];
      html += '<div class="port-item"><span class="port-num">' + escapeHtml(port.port) + '</span><span class="port-proto">' + escapeHtml(port.proto || '') + '</span><span class="port-process">' + escapeHtml(port.process || '') + '</span></div>';
    }
    if (d.listening_ports.length > 20) {
      html += '<div class="port-item">+' + (d.listening_ports.length - 20) + ' weitere...</div>';
    }
    html += '</div></div></div>';
  }

  // Routes
  if (d.routes && d.routes.length > 0) {
    html += '<div class="network-card network-card-wide">';
    html += '<div class="network-card-header" onclick="toggleNetworkSection(this)" style="cursor:pointer;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg><span>Routing Table (' + d.routes.length + ')</span><span class="network-toggle">+</span></div>';
    html += '<div class="network-card-body" style="display:none;"><table class="network-table"><thead><tr><th>Destination</th><th>Gateway</th><th>Device</th><th>Metric</th></tr></thead><tbody>';
    for (var k = 0; k < d.routes.length; k++) {
      var route = d.routes[k];
      html += '<tr>';
      html += '<td>' + escapeHtml(route.destination || '-') + '</td>';
      html += '<td>' + escapeHtml(route.gateway || 'direct') + '</td>';
      html += '<td>' + escapeHtml(route.device || '-') + '</td>';
      html += '<td>' + (route.metric || '-') + '</td>';
      html += '</tr>';
    }
    html += '</tbody></table></div></div>';
  }

  // ARP Table
  if (d.arp && d.arp.length > 0) {
    html += '<div class="network-card network-card-wide">';
    html += '<div class="network-card-header" onclick="toggleNetworkSection(this)" style="cursor:pointer;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg><span>ARP Cache (' + d.arp.length + ')</span><span class="network-toggle">+</span></div>';
    html += '<div class="network-card-body" style="display:none;"><table class="network-table"><thead><tr><th>IP</th><th>MAC</th><th>Device</th><th>State</th></tr></thead><tbody>';
    for (var m = 0; m < Math.min(d.arp.length, 30); m++) {
      var arp = d.arp[m];
      html += '<tr>';
      html += '<td>' + escapeHtml(arp.ip || '-') + '</td>';
      html += '<td class="mono">' + escapeHtml(arp.mac || '-') + '</td>';
      html += '<td>' + escapeHtml(arp.device || '-') + '</td>';
      html += '<td>' + escapeHtml(arp.state || '-') + '</td>';
      html += '</tr>';
    }
    html += '</tbody></table></div></div>';
  }

  // Statistics
  if (d.statistics) {
    html += '<div class="network-card">';
    html += '<div class="network-card-header"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></svg><span>Statistiken</span></div>';
    html += '<div class="network-card-body">';
    html += '<div class="status-row"><span>TCP Active Opens:</span><span>' + (d.statistics.tcp_active_opens || 0) + '</span></div>';
    html += '<div class="status-row"><span>TCP Passive Opens:</span><span>' + (d.statistics.tcp_passive_opens || 0) + '</span></div>';
    html += '<div class="status-row"><span>TCP Failed:</span><span class="' + (d.statistics.tcp_failed_attempts > 100 ? 'text-warning' : '') + '">' + (d.statistics.tcp_failed_attempts || 0) + '</span></div>';
    html += '<div class="status-row"><span>UDP In:</span><span>' + (d.statistics.udp_in_datagrams || 0) + '</span></div>';
    html += '<div class="status-row"><span>UDP Out:</span><span>' + (d.statistics.udp_out_datagrams || 0) + '</span></div>';
    html += '</div></div>';
  }

  html += '</div>';
  contentEl.innerHTML = html;
}

function toggleNetworkSection(headerEl) {
  var body = headerEl.nextElementSibling;
  var toggle = headerEl.querySelector('.network-toggle');
  if (body.style.display === 'none') {
    body.style.display = 'block';
    if (toggle) toggle.textContent = '-';
  } else {
    body.style.display = 'none';
    if (toggle) toggle.textContent = '+';
  }
}

function runPingTest(nodeId) {
  var targetEl = document.getElementById('ping-target');
  var resultEl = document.getElementById('ping-result');
  var btn = document.getElementById('btn-ping');

  if (!targetEl || !resultEl || !btn) return;

  var target = targetEl.value.trim();
  if (!target) {
    resultEl.innerHTML = '<div class="tool-error">Bitte Ziel eingeben</div>';
    resultEl.style.display = 'block';
    return;
  }

  btn.classList.add('loading');
  btn.disabled = true;
  resultEl.innerHTML = '<div class="tool-loading"><span class="spinner"></span> Ping läuft...</div>';
  resultEl.style.display = 'block';

  var xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/nodes/' + nodeId + '/network/ping', true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.timeout = 60000;

  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      btn.classList.remove('loading');
      btn.disabled = false;

      var response;
      try {
        response = JSON.parse(xhr.responseText);
      } catch (e) {
        response = { success: false, error: { message: 'Ungültige Antwort' } };
      }

      if (xhr.status >= 200 && xhr.status < 300 && response.success) {
        var r = response.data;
        var html = '<div class="tool-success">';
        html += '<div class="ping-stats">';
        html += '<span class="ping-stat"><strong>' + r.transmitted + '</strong> gesendet</span>';
        html += '<span class="ping-stat"><strong>' + r.received + '</strong> empfangen</span>';
        html += '<span class="ping-stat ' + (r.loss_percent > 0 ? 'text-error' : '') + '"><strong>' + r.loss_percent + '%</strong> Verlust</span>';
        if (r.avg_ms !== null) {
          html += '<span class="ping-stat"><strong>' + r.avg_ms.toFixed(2) + ' ms</strong> avg</span>';
        }
        html += '</div>';
        if (r.min_ms !== null && r.max_ms !== null) {
          html += '<div class="ping-detail">min/avg/max: ' + r.min_ms.toFixed(2) + ' / ' + r.avg_ms.toFixed(2) + ' / ' + r.max_ms.toFixed(2) + ' ms</div>';
        }
        html += '</div>';
        resultEl.innerHTML = html;
      } else {
        var errMsg = response.error ? response.error.message : 'Fehler';
        resultEl.innerHTML = '<div class="tool-error">' + escapeHtml(errMsg) + '</div>';
      }
    }
  };

  xhr.onerror = function() {
    btn.classList.remove('loading');
    btn.disabled = false;
    resultEl.innerHTML = '<div class="tool-error">Netzwerkfehler</div>';
  };

  xhr.ontimeout = function() {
    btn.classList.remove('loading');
    btn.disabled = false;
    resultEl.innerHTML = '<div class="tool-error">Timeout</div>';
  };

  xhr.send(JSON.stringify({ target: target, count: 4 }));
}

function runDnsLookup(nodeId) {
  var hostnameEl = document.getElementById('dns-hostname');
  var resultEl = document.getElementById('dns-result');
  var btn = document.getElementById('btn-dns');

  if (!hostnameEl || !resultEl || !btn) return;

  var hostname = hostnameEl.value.trim();
  if (!hostname) {
    resultEl.innerHTML = '<div class="tool-error">Bitte Hostname eingeben</div>';
    resultEl.style.display = 'block';
    return;
  }

  btn.classList.add('loading');
  btn.disabled = true;
  resultEl.innerHTML = '<div class="tool-loading"><span class="spinner"></span> DNS Lookup...</div>';
  resultEl.style.display = 'block';

  var xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/nodes/' + nodeId + '/network/dns', true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.timeout = 30000;

  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      btn.classList.remove('loading');
      btn.disabled = false;

      var response;
      try {
        response = JSON.parse(xhr.responseText);
      } catch (e) {
        response = { success: false, error: { message: 'Ungültige Antwort' } };
      }

      if (xhr.status >= 200 && xhr.status < 300 && response.success) {
        var r = response.data;
        var html = '<div class="' + (r.success ? 'tool-success' : 'tool-error') + '">';
        html += '<div><strong>' + escapeHtml(r.hostname) + '</strong></div>';
        if (r.addresses && r.addresses.length > 0) {
          html += '<div class="dns-addresses">';
          for (var i = 0; i < r.addresses.length; i++) {
            html += '<span class="dns-ip">' + escapeHtml(r.addresses[i]) + '</span>';
          }
          html += '</div>';
        } else {
          html += '<div>Keine Adressen gefunden</div>';
        }
        html += '</div>';
        resultEl.innerHTML = html;
      } else {
        var errMsg = response.error ? response.error.message : 'Fehler';
        resultEl.innerHTML = '<div class="tool-error">' + escapeHtml(errMsg) + '</div>';
      }
    }
  };

  xhr.onerror = function() {
    btn.classList.remove('loading');
    btn.disabled = false;
    resultEl.innerHTML = '<div class="tool-error">Netzwerkfehler</div>';
  };

  xhr.send(JSON.stringify({ hostname: hostname }));
}

function runTraceroute(nodeId) {
  var targetEl = document.getElementById('trace-target');
  var resultEl = document.getElementById('trace-result');
  var btn = document.getElementById('btn-trace');

  if (!targetEl || !resultEl || !btn) return;

  var target = targetEl.value.trim();
  if (!target) {
    resultEl.innerHTML = '<div class="tool-error">Bitte Ziel eingeben</div>';
    resultEl.style.display = 'block';
    return;
  }

  btn.classList.add('loading');
  btn.disabled = true;
  resultEl.innerHTML = '<div class="tool-loading"><span class="spinner"></span> Traceroute läuft (kann 30-60 Sek dauern)...</div>';
  resultEl.style.display = 'block';

  var xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/nodes/' + nodeId + '/network/traceroute', true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.timeout = 90000;

  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      btn.classList.remove('loading');
      btn.disabled = false;

      var response;
      try {
        response = JSON.parse(xhr.responseText);
      } catch (e) {
        response = { success: false, error: { message: 'Ungültige Antwort' } };
      }

      if (xhr.status >= 200 && xhr.status < 300 && response.success) {
        var r = response.data;
        var html = '<div class="tool-success">';
        html += '<div class="trace-header">Traceroute zu <strong>' + escapeHtml(r.target) + '</strong></div>';
        if (r.hops && r.hops.length > 0) {
          html += '<div class="trace-hops">';
          for (var i = 0; i < r.hops.length; i++) {
            var hop = r.hops[i];
            html += '<div class="trace-hop"><span class="hop-num">' + hop.hop + '</span><span class="hop-host">' + escapeHtml(hop.host || '*') + '</span><span class="hop-time">' + (hop.time_ms ? hop.time_ms.toFixed(2) + ' ms' : '*') + '</span></div>';
          }
          html += '</div>';
        } else {
          html += '<pre class="trace-raw">' + escapeHtml(r.raw || 'Keine Daten') + '</pre>';
        }
        html += '</div>';
        resultEl.innerHTML = html;
      } else {
        var errMsg = response.error ? response.error.message : 'Fehler';
        resultEl.innerHTML = '<div class="tool-error">' + escapeHtml(errMsg) + '</div>';
      }
    }
  };

  xhr.onerror = function() {
    btn.classList.remove('loading');
    btn.disabled = false;
    resultEl.innerHTML = '<div class="tool-error">Netzwerkfehler</div>';
  };

  xhr.ontimeout = function() {
    btn.classList.remove('loading');
    btn.disabled = false;
    resultEl.innerHTML = '<div class="tool-error">Timeout - Traceroute hat zu lange gedauert</div>';
  };

  xhr.send(JSON.stringify({ target: target, maxHops: 20 }));
}

// Load network info when network tab is opened
var networkTabBtn = document.querySelector('[data-tab="network"]');
if (networkTabBtn && !networkTabBtn.hasAttribute('data-network-listener')) {
  networkTabBtn.addEventListener('click', function() {
    if (!networkData) {
      loadNetworkDiagnostics(nodeId);
    }
  });
  networkTabBtn.setAttribute('data-network-listener', 'true');
}

// =====================================================
// Terminal Bottom Panel
// =====================================================

var terminalPanel = document.getElementById('terminalPanel');
var terminalToggleBtn = document.getElementById('terminalToggleBtn');
var terminalResizeHandle = document.getElementById('terminalResizeHandle');
var terminalMinimizeBtn = document.getElementById('terminalMinimizeBtn');

// Terminal state management
var terminalState = {
  visible: false,
  minimized: false,
  height: 400 // Default height
};

// Load state from localStorage
(function loadTerminalState() {
  try {
    var savedState = localStorage.getItem('terminalPanelState');
    if (savedState) {
      var parsed = JSON.parse(savedState);
      terminalState.visible = parsed.visible || false;
      terminalState.minimized = parsed.minimized || false;
      terminalState.height = parsed.height || 400;
    }
  } catch (e) {
    // Fallback to defaults
  }

  // Apply saved state
  if (terminalPanel) {
    terminalPanel.style.height = terminalState.height + 'px';

    if (terminalState.visible) {
      terminalPanel.classList.remove('hidden');
      if (terminalState.minimized) {
        terminalPanel.classList.add('minimized');
      }
      if (terminalToggleBtn) {
        terminalToggleBtn.style.display = 'none';
      }
    } else {
      terminalPanel.classList.add('hidden');
      if (terminalToggleBtn) {
        terminalToggleBtn.style.display = 'flex';
      }
    }
  }
})();

// Save state to localStorage
function saveTerminalState() {
  try {
    localStorage.setItem('terminalPanelState', JSON.stringify(terminalState));
  } catch (e) {
    // Ignore localStorage errors
  }
}

// Toggle terminal panel visibility/minimized state
function toggleTerminalPanel() {
  if (!terminalPanel) return;

  if (terminalPanel.classList.contains('hidden')) {
    // Show panel
    terminalPanel.classList.remove('hidden');
    terminalState.visible = true;
    terminalState.minimized = false;
    if (terminalToggleBtn) {
      terminalToggleBtn.style.display = 'none';
    }
  } else if (terminalPanel.classList.contains('minimized')) {
    // Restore from minimized
    terminalPanel.classList.remove('minimized');
    terminalState.minimized = false;
  } else {
    // Minimize panel
    terminalPanel.classList.add('minimized');
    terminalState.minimized = true;
  }

  saveTerminalState();
}

// Close terminal panel completely
function closeTerminalPanel() {
  if (!terminalPanel) return;

  terminalPanel.classList.add('hidden');
  terminalPanel.classList.remove('minimized');
  terminalState.visible = false;
  terminalState.minimized = false;

  if (terminalToggleBtn) {
    terminalToggleBtn.style.display = 'flex';
  }

  saveTerminalState();
}

// Terminal resize functionality
(function initTerminalResize() {
  if (!terminalResizeHandle || !terminalPanel) return;

  var isResizing = false;
  var startY = 0;
  var startHeight = 0;

  terminalResizeHandle.addEventListener('mousedown', function(e) {
    isResizing = true;
    startY = e.clientY;
    startHeight = terminalPanel.offsetHeight;

    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';

    e.preventDefault();
  });

  document.addEventListener('mousemove', function(e) {
    if (!isResizing) return;

    var deltaY = startY - e.clientY;
    var newHeight = startHeight + deltaY;

    // Constrain height between 200px and 80% of viewport
    var minHeight = 200;
    var maxHeight = window.innerHeight * 0.8;
    newHeight = Math.max(minHeight, Math.min(newHeight, maxHeight));

    terminalPanel.style.height = newHeight + 'px';
    terminalState.height = newHeight;
  });

  document.addEventListener('mouseup', function() {
    if (isResizing) {
      isResizing = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      saveTerminalState();
    }
  });
})();

// Focus terminal input on panel open
if (terminalPanel) {
  var observer = new MutationObserver(function(mutations) {
    for (var i = 0; i < mutations.length; i++) {
      var mutation = mutations[i];
      if (mutation.attributeName === 'class') {
        var wasHidden = mutation.oldValue && mutation.oldValue.indexOf('hidden') > -1;
        var isVisible = !terminalPanel.classList.contains('hidden');

        if (wasHidden && isVisible) {
          var input = document.getElementById('command-input');
          if (input) {
            setTimeout(function() {
              input.focus();
            }, 100);
          }
        }
      }
    }
  });

  observer.observe(terminalPanel, {
    attributes: true,
    attributeOldValue: true,
    attributeFilter: ['class']
  });
}

// Keyboard shortcut: Ctrl+` to toggle terminal (like VS Code)
document.addEventListener('keydown', function(e) {
  // Ctrl+` or Cmd+` (keyCode 192 is backtick)
  if ((e.ctrlKey || e.metaKey) && e.keyCode === 192) {
    e.preventDefault();
    toggleTerminalPanel();
  }
});


// ============================================================
// FROM: health.js (255 lines)
// ============================================================

// =============================================================================
// HEALTH CHECK FUNCTIONS (ES5 Compatible - Fire HD 10 Support)
// =============================================================================

/**
 * Run a health check on the node
 * @param {number} nodeId - The node ID
 */
function runHealthCheck(nodeId) {
  var btns = document.querySelectorAll('.btn-health-check');
  var i;

  // Set loading state
  for (i = 0; i < btns.length; i++) {
    btns[i].classList.add('loading');
    btns[i].disabled = true;
  }

  // Helper to reset buttons
  function resetButtons() {
    for (var j = 0; j < btns.length; j++) {
      btns[j].classList.remove('loading');
      btns[j].disabled = false;
    }
  }

  // Use XMLHttpRequest instead of fetch for ES5 compatibility
  var xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/nodes/' + nodeId + '/health/check', true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.timeout = 120000; // 2 minutes

  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      resetButtons();

      if (xhr.status === 200) {
        try {
          var data = JSON.parse(xhr.responseText);
          if (data.success) {
            if (window.NP && window.NP.Toast) {
              window.NP.Toast.show('Health-Check abgeschlossen', 'success');
            }
            window.location.reload();
          } else {
            if (window.NP && window.NP.Toast) {
              var errMsg = (data.error && data.error.message) || 'Unbekannter Fehler';
              window.NP.Toast.show('Health-Check fehlgeschlagen: ' + errMsg, 'error');
            }
          }
        } catch (e) {
          if (window.NP && window.NP.Toast) {
            window.NP.Toast.show('Health-Check: Ungültige Server-Antwort', 'error');
          }
        }
      } else {
        if (window.NP && window.NP.Toast) {
          window.NP.Toast.show('Health-Check fehlgeschlagen: HTTP ' + xhr.status, 'error');
        }
      }
    }
  };

  xhr.onerror = function() {
    resetButtons();
    if (window.NP && window.NP.Toast) {
      window.NP.Toast.show('Health-Check: Netzwerkfehler', 'error');
    }
  };

  xhr.ontimeout = function() {
    resetButtons();
    if (window.NP && window.NP.Toast) {
      window.NP.Toast.show('Health-Check: Timeout (> 2 Min)', 'error');
    }
  };

  xhr.send(null);
}

/**
 * Run apt upgrade on the node
 * @param {number} nodeId - The node ID
 * @param {Event} evt - The click event (optional)
 */
function runUpgrade(nodeId, evt) {
  if (!confirm('System-Upgrade durchfuehren? Dies kann einige Minuten dauern.')) {
    return;
  }

  // Get button from event or find it in DOM
  var btn = null;
  if (evt && evt.target) {
    btn = evt.target.closest ? evt.target.closest('button') : evt.target;
  }

  if (btn) {
    btn.classList.add('loading');
    btn.disabled = true;
  }

  function resetButton() {
    if (btn) {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  }

  if (window.NP && window.NP.Toast) {
    window.NP.Toast.show('Upgrade gestartet... Dies kann einige Minuten dauern.', 'info');
  }

  var xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/nodes/' + nodeId + '/health/upgrade', true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.timeout = 600000; // 10 minutes for upgrades

  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      resetButton();

      if (xhr.status === 200) {
        try {
          var data = JSON.parse(xhr.responseText);
          if (data.success && data.data) {
            var msg = 'Upgrade abgeschlossen';
            if (data.data.packages_upgraded) {
              msg += ' (' + data.data.packages_upgraded + ' Pakete)';
            }
            if (data.data.reboot_required) {
              msg += ' - Reboot erforderlich!';
            }
            if (window.NP && window.NP.Toast) {
              window.NP.Toast.show(msg, 'success');
            }
            setTimeout(function() { window.location.reload(); }, 2000);
          } else {
            if (window.NP && window.NP.Toast) {
              var errMsg = (data.error && data.error.message) || 'Unbekannter Fehler';
              window.NP.Toast.show('Upgrade fehlgeschlagen: ' + errMsg, 'error');
            }
          }
        } catch (e) {
          if (window.NP && window.NP.Toast) {
            window.NP.Toast.show('Upgrade: Ungültige Server-Antwort', 'error');
          }
        }
      } else {
        if (window.NP && window.NP.Toast) {
          window.NP.Toast.show('Upgrade fehlgeschlagen: HTTP ' + xhr.status, 'error');
        }
      }
    }
  };

  xhr.onerror = function() {
    resetButton();
    if (window.NP && window.NP.Toast) {
      window.NP.Toast.show('Upgrade: Netzwerkfehler', 'error');
    }
  };

  xhr.ontimeout = function() {
    resetButton();
    if (window.NP && window.NP.Toast) {
      window.NP.Toast.show('Upgrade: Timeout (> 10 Min)', 'error');
    }
  };

  xhr.send(null);
}

/**
 * Switch Proxmox repository
 * @param {number} nodeId - The node ID
 * @param {string} mode - "enterprise" or "no-subscription"
 * @param {Event} evt - The click event (optional)
 */
function switchProxmoxRepo(nodeId, mode, evt) {
  var modeName = mode === 'enterprise' ? 'Enterprise' : 'No-Subscription';
  if (!confirm('Wirklich zu ' + modeName + ' Repository wechseln?')) {
    return;
  }

  // Get button from event or find it in DOM
  var btn = null;
  if (evt && evt.target) {
    btn = evt.target.closest ? evt.target.closest('button') : evt.target;
  }

  if (btn) {
    btn.classList.add('loading');
    btn.disabled = true;
  }

  function resetButton() {
    if (btn) {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  }

  var xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/nodes/' + nodeId + '/health/repo', true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.timeout = 60000; // 1 minute

  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      resetButton();

      if (xhr.status === 200) {
        try {
          var data = JSON.parse(xhr.responseText);
          if (data.success) {
            if (window.NP && window.NP.Toast) {
              window.NP.Toast.show('Repository gewechselt zu ' + modeName, 'success');
            }
            setTimeout(function() { window.location.reload(); }, 1500);
          } else {
            if (window.NP && window.NP.Toast) {
              var errMsg = (data.error && data.error.message) || 'Unbekannter Fehler';
              window.NP.Toast.show('Repository-Wechsel fehlgeschlagen: ' + errMsg, 'error');
            }
          }
        } catch (e) {
          if (window.NP && window.NP.Toast) {
            window.NP.Toast.show('Repository-Wechsel: Ungültige Server-Antwort', 'error');
          }
        }
      } else {
        if (window.NP && window.NP.Toast) {
          window.NP.Toast.show('Repository-Wechsel fehlgeschlagen: HTTP ' + xhr.status, 'error');
        }
      }
    }
  };

  xhr.onerror = function() {
    resetButton();
    if (window.NP && window.NP.Toast) {
      window.NP.Toast.show('Repository-Wechsel: Netzwerkfehler', 'error');
    }
  };

  xhr.ontimeout = function() {
    resetButton();
    if (window.NP && window.NP.Toast) {
      window.NP.Toast.show('Repository-Wechsel: Timeout', 'error');
    }
  };

  xhr.send(JSON.stringify({ mode: mode }));
}


// ============================================================
// FROM: live-metrics.js (436 lines)
// ============================================================

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
 * Format bytes to human-readable string (ES5)
 */
function formatBytesLive(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  var sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  var i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + sizes[i];
}

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

// =============================================================================
// EDIT PANEL
// =============================================================================

/**
 * Open edit panel
 */
function openEditPanel() {
  var overlay = document.getElementById('editPanelOverlay');
  var panel = document.getElementById('editPanel');
  if (overlay && panel) {
    overlay.classList.add('open');
    panel.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
}

/**
 * Close edit panel
 */
function closeEditPanel() {
  var overlay = document.getElementById('editPanelOverlay');
  var panel = document.getElementById('editPanel');
  if (overlay && panel) {
    overlay.classList.remove('open');
    panel.classList.remove('open');
    document.body.style.overflow = '';
  }
}

/**
 * Toggle monitoring on/off button
 */
function toggleMonitoring() {
  var btn = document.getElementById('monitoring-toggle');
  var input = document.getElementById('edit-monitoring_enabled');
  var textEl = btn ? btn.querySelector('.toggle-text') : null;

  if (!btn || !input) return;

  var isActive = btn.classList.contains('active');

  if (isActive) {
    // Turn off
    btn.classList.remove('active');
    input.value = '0';
    if (textEl) textEl.textContent = 'AUS';
  } else {
    // Turn on
    btn.classList.add('active');
    input.value = '1';
    if (textEl) textEl.textContent = 'AN';
  }
}

/**
 * Save node via AJAX
 */
function saveNode(e) {
  e.preventDefault();

  var form = document.getElementById('editNodeForm');
  var btn = document.getElementById('editSaveBtn');

  if (!form || !btn) return;

  // Set loading state
  btn.classList.add('loading');
  btn.disabled = true;

  // Collect form data
  var formData = {
    name: document.getElementById('edit-name').value,
    host: document.getElementById('edit-host').value,
    ssh_user: document.getElementById('edit-ssh_user').value,
    ssh_port: parseInt(document.getElementById('edit-ssh_port').value, 10) || 22,
    ssh_password: document.getElementById('edit-ssh_password').value,
    ssh_key_path: document.getElementById('edit-ssh_key_path').value,
    monitoring_enabled: document.getElementById('edit-monitoring_enabled').value === '1',
    monitoring_interval: parseInt(document.getElementById('edit-monitoring_interval').value, 10) || 30,
    notes: document.getElementById('edit-notes').value
  };

  // AJAX request
  var xhr = new XMLHttpRequest();
  xhr.open('PUT', '/api/nodes/' + nodeId, true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.timeout = 10000;

  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      btn.classList.remove('loading');
      btn.disabled = false;

      if (xhr.status === 200) {
        try {
          var data = JSON.parse(xhr.responseText);
          if (data.success) {
            if (window.NP && window.NP.Toast) {
              window.NP.Toast.show('Node gespeichert', 'success');
            }
            closeEditPanel();
            // Reload to show updated data
            setTimeout(function() {
              window.location.reload();
            }, 500);
          } else {
            var errMsg = (data.error && data.error.message) || 'Fehler beim Speichern';
            if (window.NP && window.NP.Toast) {
              window.NP.Toast.show(errMsg, 'error');
            }
          }
        } catch (e) {
          if (window.NP && window.NP.Toast) {
            window.NP.Toast.show('Ungueltige Server-Antwort', 'error');
          }
        }
      } else {
        if (window.NP && window.NP.Toast) {
          window.NP.Toast.show('Fehler: HTTP ' + xhr.status, 'error');
        }
      }
    }
  };

  xhr.onerror = function() {
    btn.classList.remove('loading');
    btn.disabled = false;
    if (window.NP && window.NP.Toast) {
      window.NP.Toast.show('Netzwerkfehler', 'error');
    }
  };

  xhr.ontimeout = function() {
    btn.classList.remove('loading');
    btn.disabled = false;
    if (window.NP && window.NP.Toast) {
      window.NP.Toast.show('Timeout', 'error');
    }
  };

  xhr.send(JSON.stringify(formData));
}

/**
 * Delete node
 */
function deleteNode(id, name) {
  if (!confirm('Bist du sicher, dass du den Node "' + name + '" loeschen moechtest?\n\nAlle zugehoerigen Daten werden ebenfalls geloescht.')) {
    return;
  }

  var xhr = new XMLHttpRequest();
  xhr.open('DELETE', '/api/nodes/' + id, true);
  xhr.timeout = 10000;

  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      if (xhr.status === 200) {
        if (window.NP && window.NP.Toast) {
          window.NP.Toast.show('Node geloescht', 'success');
        }
        // Redirect to nodes list
        setTimeout(function() {
          window.location.href = '/nodes';
        }, 500);
      } else {
        if (window.NP && window.NP.Toast) {
          window.NP.Toast.show('Fehler beim Loeschen: HTTP ' + xhr.status, 'error');
        }
      }
    }
  };

  xhr.onerror = function() {
    if (window.NP && window.NP.Toast) {
      window.NP.Toast.show('Netzwerkfehler', 'error');
    }
  };

  xhr.send();
}

// Close edit panel with Escape key
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape' || e.keyCode === 27) {
    var panel = document.getElementById('editPanel');
    if (panel && panel.classList.contains('open')) {
      closeEditPanel();
    }
  }
});

