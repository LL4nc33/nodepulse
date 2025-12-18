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
   Generated: 2025-12-18T05:11:17.561Z
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
        response = { success: false, error: { message: 'Ungueltige Antwort' } };
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
    isoSelect.innerHTML = '<option value="">-- ISO waehlen --</option>';
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
    storageSelect.innerHTML = '<option value="">-- Storage waehlen --</option>';
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
        response = { success: false, error: { message: 'Ungueltige Antwort' } };
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
        response = { success: false, error: { message: 'Ungueltige Antwort' } };
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
    templateSelect.innerHTML = '<option value="">-- Template waehlen --</option>';
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
    storageSelect.innerHTML = '<option value="">-- Storage waehlen --</option>';
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
        response = { success: false, error: { message: 'Ungueltige Antwort' } };
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
        response = { success: false, error: { message: 'Ungueltige Antwort' } };
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
        response = { success: false, error: { message: 'Ungueltige Antwort' } };
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
// FROM: services.js (183 lines)
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

// Load services when services tab is opened
var servicesTabBtn = document.querySelector('[data-tab="services"]');
if (servicesTabBtn && !servicesTabBtn.hasAttribute('data-services-listener')) {
  servicesTabBtn.addEventListener('click', function() {
    if (servicesData.length === 0) {
      loadServices(nodeId);
    }
  });
  servicesTabBtn.setAttribute('data-services-listener', 'true');
}

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
    alert('Mindestens ein Device muss ausgewaehlt werden');
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
    alert('VG muss ausgewaehlt werden');
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
    'Die Volume Group <strong>' + vgName + '</strong> und alle enthaltenen LVs werden unwiderruflich geloescht!';
  document.getElementById('confirmHint').innerHTML =
    'Geben Sie <strong>' + vgName + '</strong> ein um zu bestaetigen.';

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
    'Der Thin Pool <strong>' + poolName + '</strong> und alle Thin LVs werden unwiderruflich geloescht!';
  document.getElementById('confirmHint').innerHTML =
    'Geben Sie <strong>' + poolName + '</strong> ein um zu bestaetigen.';

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
      submitBtn.innerHTML = 'Endgueltig loeschen';
    }
  };

  xhr.onerror = function() {
    alert('Netzwerkfehler');
    submitBtn.disabled = false;
    submitBtn.innerHTML = 'Endgueltig loeschen';
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
// FROM: network.js (637 lines)
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
        response = { success: false, error: { message: 'Ungueltige Antwort' } };
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
  resultEl.innerHTML = '<div class="tool-loading"><span class="spinner"></span> Ping laeuft...</div>';
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
        response = { success: false, error: { message: 'Ungueltige Antwort' } };
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
        response = { success: false, error: { message: 'Ungueltige Antwort' } };
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
  resultEl.innerHTML = '<div class="tool-loading"><span class="spinner"></span> Traceroute laeuft (kann 30-60 Sek dauern)...</div>';
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
        response = { success: false, error: { message: 'Ungueltige Antwort' } };
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

