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
      setTimeout(function() {
        window.location.reload();
      }, 1500);
    })
    .catch(function(error) {
      var errMsg = error.message || 'Discovery fehlgeschlagen';
      NP.UI.showAlert(resultEl, 'error', 'Fehler: ' + errMsg);
      NP.UI.toast(errMsg, 'error');
    })
    .finally(function() {
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
      setTimeout(function() {
        window.location.reload();
      }, 1000);
    })
    .catch(function(error) {
      NP.UI.showAlert(resultEl, 'error', 'Fehler: ' + (error.message || 'Unbekannter Fehler'));
      NP.UI.toast(error.message || 'Docker-Fehler', 'error');
    })
    .finally(function() {
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
      setTimeout(function() {
        window.location.reload();
      }, 1000);
    })
    .catch(function(error) {
      NP.UI.showAlert(resultEl, 'error', 'Fehler: ' + (error.message || 'Unbekannter Fehler'));
      NP.UI.toast(error.message || 'Proxmox-Fehler', 'error');
    })
    .finally(function() {
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
// Terminal Functions
// =====================================================

var activeCommandXHR = null;

function setCommand(cmd) {
  var input = document.getElementById('command-input');
  if (input) {
    input.value = cmd;
    input.focus();
  }
}

function clearOutput() {
  var output = document.getElementById('terminal-output');
  if (output) {
    output.textContent = 'Noch kein Befehl ausgefuehrt.';
    output.className = 'terminal-output';
  }
}

function executeCommand(event, nodeId) {
  event.preventDefault();

  var input = document.getElementById('command-input');
  var output = document.getElementById('terminal-output');
  var btnEl = document.getElementById('btn-execute');
  var command = input ? input.value.trim() : '';

  if (!command) {
    if (output) {
      output.textContent = 'Bitte einen Befehl eingeben.';
      output.className = 'terminal-output error';
    }
    return;
  }

  // Abort previous request if still running
  if (activeCommandXHR) {
    activeCommandXHR.abort();
  }

  if (output) {
    output.textContent = 'Fuehre aus: ' + command + '\n\nBitte warten...';
    output.className = 'terminal-output loading';
  }

  if (btnEl) {
    btnEl.classList.add('loading');
    btnEl.disabled = true;
  }

  var xhr = new XMLHttpRequest();
  activeCommandXHR = xhr;
  xhr.open('POST', '/api/nodes/' + nodeId + '/commands', true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.timeout = 125000; // 125s (backend 120s + 5s network buffer)

  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      activeCommandXHR = null;

      if (btnEl) {
        btnEl.classList.remove('loading');
        btnEl.disabled = false;
      }

      var response;
      try {
        response = JSON.parse(xhr.responseText);
      } catch (e) {
        response = { success: false, error: { message: 'Ungueltige Antwort vom Server' } };
      }

      if (output) {
        var outputText = '$ ' + command + '\n\n';

        if (response.data) {
          var data = response.data;

          if (data.output) {
            outputText += data.output;
          }

          if (data.error && data.error.trim()) {
            if (data.output) outputText += '\n';
            outputText += '[STDERR]\n' + data.error;
          }

          if (!data.output && !data.error) {
            outputText += '(Keine Ausgabe)';
          }

          outputText += '\n\n[Exit Code: ' + data.exit_code + '] [Status: ' + data.status + ']';

          output.textContent = outputText;
          output.className = 'terminal-output ' + (data.status === 'success' ? 'success' : 'error');
        } else if (response.error) {
          outputText += 'Fehler: ' + response.error.message;
          output.textContent = outputText;
          output.className = 'terminal-output error';
        }
      }

      // Refresh history
      loadCommandHistory(nodeId);
    }
  };

  xhr.onerror = function() {
    activeCommandXHR = null;
    if (btnEl) {
      btnEl.classList.remove('loading');
      btnEl.disabled = false;
    }
    if (output) {
      output.textContent = '$ ' + command + '\n\nNetzwerkfehler - Verbindung fehlgeschlagen.';
      output.className = 'terminal-output error';
    }
  };

  xhr.ontimeout = function() {
    activeCommandXHR = null;
    if (btnEl) {
      btnEl.classList.remove('loading');
      btnEl.disabled = false;
    }
    if (output) {
      output.textContent = '$ ' + command + '\n\nTimeout - Der Befehl hat zu lange gedauert (> 2 Minuten).';
      output.className = 'terminal-output error';
    }
  };

  xhr.send(JSON.stringify({ command: command }));
}

function loadCommandHistory(nodeId) {
  var historyEl = document.getElementById('command-history');
  if (!historyEl) return;

  var xhr = new XMLHttpRequest();
  xhr.open('GET', '/api/nodes/' + nodeId + '/commands/history?limit=10', true);
  xhr.timeout = 10000;

  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      var response;
      try {
        response = JSON.parse(xhr.responseText);
      } catch (e) {
        response = { success: false };
      }

      if (response.success && response.data && response.data.length > 0) {
        var html = '';
        for (var i = 0; i < response.data.length; i++) {
          var item = response.data[i];
          var date = new Date(item.executed_at);
          var dateStr = date.toLocaleString('de-DE', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
          });

          html += '<div class="history-item" tabindex="0" onclick="setCommand(\'' + escapeForJsString(item.full_command) + '\')" onkeypress="if(event.key===\'Enter\')setCommand(\'' + escapeForJsString(item.full_command) + '\')">';
          html += '<code class="history-command">' + escapeHtml(item.full_command) + '</code>';
          html += '<span class="history-time">' + dateStr + '</span>';
          html += '</div>';
        }
        historyEl.innerHTML = html;
      } else {
        historyEl.innerHTML = '<p class="empty">Keine Befehle in der Historie.</p>';
      }
    }
  };

  xhr.onerror = function() {
    historyEl.innerHTML = '<p class="empty">Fehler beim Laden der Historie.</p>';
  };

  xhr.send();
}

function escapeHtml(text) {
  var div = document.createElement('div');
  div.appendChild(document.createTextNode(text));
  return div.innerHTML;
}

// Escape text for use inside JavaScript single-quoted string
function escapeForJsString(text) {
  if (!text) return '';
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/</g, '\\x3c')
    .replace(/>/g, '\\x3e');
}

// Load command history when terminal tab is opened
var terminalTabBtn = document.querySelector('[data-tab="terminal"]');
if (terminalTabBtn && !terminalTabBtn.hasAttribute('data-history-listener')) {
  terminalTabBtn.addEventListener('click', function() {
    loadCommandHistory(<%= node.id %>);
  });
  terminalTabBtn.setAttribute('data-history-listener', 'true');
}

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
      html += '<button class="btn btn-sm btn-warning" onclick="controlService(<%= node.id %>, \'' + escapeForJsString(svc.name) + '\', \'restart\')">Restart</button>';
      html += '<button class="btn btn-sm btn-danger" onclick="controlService(<%= node.id %>, \'' + escapeForJsString(svc.name) + '\', \'stop\')">Stop</button>';
    } else if (svc.sub === 'exited' || svc.sub === 'dead' || svc.sub === 'failed') {
      html += '<button class="btn btn-sm btn-success" onclick="controlService(<%= node.id %>, \'' + escapeForJsString(svc.name) + '\', \'start\')">Start</button>';
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
      loadServices(<%= node.id %>);
    }
  });
  servicesTabBtn.setAttribute('data-services-listener', 'true');
}

// =====================================================
// System Info Tab - Comprehensive System Information
// =====================================================

var systemInfoData = null;
var activeSystemInfoXHR = null;

function loadSystemInfo(nodeId) {
  var contentEl = document.getElementById('system-info-content');
  var btn = document.getElementById('btn-refresh-sysinfo');

  if (!contentEl) return;

  // Cancel any pending request
  if (activeSystemInfoXHR) {
    activeSystemInfoXHR.abort();
    activeSystemInfoXHR = null;
  }

  // Show loading
  contentEl.innerHTML = '<div class="loading-placeholder"><span class="spinner"></span><span>System-Informationen werden geladen... (kann bis zu 2 Min dauern)</span></div>';

  if (btn) {
    btn.classList.add('loading');
    btn.disabled = true;
  }

  var xhr = new XMLHttpRequest();
  activeSystemInfoXHR = xhr;
  xhr.open('GET', '/api/nodes/' + nodeId + '/system-info', true);
  xhr.timeout = 180000; // 3 minutes timeout

  function resetState() {
    activeSystemInfoXHR = null;
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
        systemInfoData = response.data;
        renderSystemInfo();
      } else {
        var errMsg = response.error ? response.error.message : 'Fehler beim Laden';
        contentEl.innerHTML = '<div class="empty-state"><div class="empty-state-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg></div><p>' + escapeHtml(errMsg) + '</p><button class="btn btn-secondary" onclick="loadSystemInfo(' + nodeId + ')">Erneut versuchen</button></div>';
      }
    }
  };

  xhr.onerror = function() {
    resetState();
    contentEl.innerHTML = '<div class="empty-state"><p>Netzwerkfehler</p></div>';
  };

  xhr.ontimeout = function() {
    resetState();
    contentEl.innerHTML = '<div class="empty-state"><p>Timeout - Server antwortet nicht</p></div>';
  };

  xhr.send();
}

function renderSystemInfo() {
  var contentEl = document.getElementById('system-info-content');
  if (!contentEl || !systemInfoData) return;

  var d = systemInfoData;
  var html = '';

  // Basic Info Card
  html += '<div class="sysinfo-grid">';

  // === BASIC INFO ===
  if (d.basic) {
    html += '<div class="sysinfo-card">';
    html += '<div class="sysinfo-card-header"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg><span>System</span></div>';
    html += '<div class="sysinfo-card-body">';
    html += '<div class="sysinfo-row"><span class="sysinfo-label">Hostname</span><span class="sysinfo-value">' + escapeHtml(d.basic.hostname || '-') + '</span></div>';
    html += '<div class="sysinfo-row"><span class="sysinfo-label">Kernel</span><span class="sysinfo-value sysinfo-mono">' + escapeHtml(d.basic.kernel || '-') + '</span></div>';
    html += '<div class="sysinfo-row"><span class="sysinfo-label">Uptime</span><span class="sysinfo-value">' + formatUptime(d.basic.uptime_seconds) + '</span></div>';
    html += '<div class="sysinfo-row"><span class="sysinfo-label">Timezone</span><span class="sysinfo-value">' + escapeHtml(d.basic.timezone || '-') + '</span></div>';
    html += '</div></div>';
  }

  // === USERS ===
  if (d.users) {
    html += '<div class="sysinfo-card">';
    html += '<div class="sysinfo-card-header"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg><span>Users</span></div>';
    html += '<div class="sysinfo-card-body">';
    html += '<div class="sysinfo-row"><span class="sysinfo-label">Eingeloggt</span><span class="sysinfo-value sysinfo-badge">' + (d.users.logged_in ? d.users.logged_in.length : 0) + '</span></div>';
    html += '<div class="sysinfo-row"><span class="sysinfo-label">User Accounts</span><span class="sysinfo-value">' + (d.users.accounts ? d.users.accounts.length : 0) + '</span></div>';
    html += '<div class="sysinfo-row"><span class="sysinfo-label">Failed Logins (24h)</span><span class="sysinfo-value ' + (d.users.failed_logins_24h > 10 ? 'sysinfo-warn' : '') + '">' + (d.users.failed_logins_24h || 0) + '</span></div>';
    html += '</div></div>';
  }

  // === PROCESSES ===
  if (d.processes) {
    html += '<div class="sysinfo-card">';
    html += '<div class="sysinfo-card-header"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/></svg><span>Prozesse</span></div>';
    html += '<div class="sysinfo-card-body">';
    html += '<div class="sysinfo-row"><span class="sysinfo-label">Total</span><span class="sysinfo-value">' + (d.processes.total || 0) + '</span></div>';
    html += '<div class="sysinfo-row"><span class="sysinfo-label">Running</span><span class="sysinfo-value sysinfo-badge sysinfo-badge-success">' + (d.processes.running || 0) + '</span></div>';
    html += '<div class="sysinfo-row"><span class="sysinfo-label">Load (1/5/15m)</span><span class="sysinfo-value sysinfo-mono">' + (d.processes.load_1m || 0) + ' / ' + (d.processes.load_5m || 0) + ' / ' + (d.processes.load_15m || 0) + '</span></div>';
    html += '</div></div>';
  }

  // === NETWORK ===
  if (d.network) {
    html += '<div class="sysinfo-card">';
    html += '<div class="sysinfo-card-header"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg><span>Netzwerk</span></div>';
    html += '<div class="sysinfo-card-body">';
    html += '<div class="sysinfo-row"><span class="sysinfo-label">Offene Ports</span><span class="sysinfo-value sysinfo-badge">' + (d.network.listening_ports ? d.network.listening_ports.length : 0) + '</span></div>';
    html += '<div class="sysinfo-row"><span class="sysinfo-label">Verbindungen</span><span class="sysinfo-value">' + (d.network.connections ? d.network.connections.established : 0) + ' established</span></div>';
    html += '<div class="sysinfo-row"><span class="sysinfo-label">Gateway</span><span class="sysinfo-value sysinfo-mono">' + escapeHtml(d.network.default_gateway || '-') + '</span></div>';
    html += '</div></div>';
  }

  // === STORAGE ===
  if (d.storage) {
    html += '<div class="sysinfo-card">';
    html += '<div class="sysinfo-card-header"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg><span>Storage</span></div>';
    html += '<div class="sysinfo-card-body">';
    html += '<div class="sysinfo-row"><span class="sysinfo-label">Filesystems</span><span class="sysinfo-value">' + (d.storage.filesystems ? d.storage.filesystems.length : 0) + '</span></div>';
    html += '<div class="sysinfo-row"><span class="sysinfo-label">Block Devices</span><span class="sysinfo-value">' + (d.storage.block_devices ? d.storage.block_devices.length : 0) + '</span></div>';
    if (d.storage.raid_status) {
      html += '<div class="sysinfo-row"><span class="sysinfo-label">RAID</span><span class="sysinfo-value sysinfo-badge sysinfo-badge-info">Aktiv</span></div>';
    }
    if (d.storage.zfs_status) {
      html += '<div class="sysinfo-row"><span class="sysinfo-label">ZFS</span><span class="sysinfo-value sysinfo-badge sysinfo-badge-info">Aktiv</span></div>';
    }
    html += '</div></div>';
  }

  // === PACKAGES ===
  if (d.packages) {
    html += '<div class="sysinfo-card">';
    html += '<div class="sysinfo-card-header"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16.5 9.4l-9-5.19M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27,6.96 12,12.01 20.73,6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg><span>Packages</span></div>';
    html += '<div class="sysinfo-card-body">';
    html += '<div class="sysinfo-row"><span class="sysinfo-label">Manager</span><span class="sysinfo-value sysinfo-badge">' + escapeHtml(d.packages.manager || 'unknown') + '</span></div>';
    html += '<div class="sysinfo-row"><span class="sysinfo-label">Installiert</span><span class="sysinfo-value">' + (d.packages.installed_count || 0) + '</span></div>';
    html += '<div class="sysinfo-row"><span class="sysinfo-label">Updates verfuegbar</span><span class="sysinfo-value ' + (d.packages.updates_available > 0 ? 'sysinfo-warn' : '') + '">' + (d.packages.updates_available || 0) + '</span></div>';
    html += '</div></div>';
  }

  // === SECURITY ===
  if (d.security) {
    html += '<div class="sysinfo-card">';
    html += '<div class="sysinfo-card-header"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg><span>Security</span></div>';
    html += '<div class="sysinfo-card-body">';
    html += '<div class="sysinfo-row"><span class="sysinfo-label">Firewall</span><span class="sysinfo-value">' + escapeHtml((d.security.firewall_status || 'unknown').substring(0, 30)) + '</span></div>';
    html += '<div class="sysinfo-row"><span class="sysinfo-label">SSH Port</span><span class="sysinfo-value sysinfo-mono">' + escapeHtml(d.security.ssh_port || '22') + '</span></div>';
    html += '<div class="sysinfo-row"><span class="sysinfo-label">Root Login</span><span class="sysinfo-value ' + (d.security.ssh_root_login === 'yes' ? 'sysinfo-warn' : '') + '">' + escapeHtml(d.security.ssh_root_login || 'unknown') + '</span></div>';
    html += '<div class="sysinfo-row"><span class="sysinfo-label">Password Auth</span><span class="sysinfo-value">' + escapeHtml(d.security.ssh_password_auth || 'unknown') + '</span></div>';
    html += '</div></div>';
  }

  // === SERVICES ===
  if (d.services) {
    html += '<div class="sysinfo-card">';
    html += '<div class="sysinfo-card-header"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg><span>Services</span></div>';
    html += '<div class="sysinfo-card-body">';
    html += '<div class="sysinfo-row"><span class="sysinfo-label">Running</span><span class="sysinfo-value sysinfo-badge sysinfo-badge-success">' + (d.services.running || 0) + '</span></div>';
    html += '<div class="sysinfo-row"><span class="sysinfo-label">Failed</span><span class="sysinfo-value ' + (d.services.failed > 0 ? 'sysinfo-badge sysinfo-badge-error' : '') + '">' + (d.services.failed || 0) + '</span></div>';
    if (d.services.failed_list && d.services.failed_list.length > 0) {
      html += '<div class="sysinfo-row sysinfo-row-full"><span class="sysinfo-label">Failed Services</span><span class="sysinfo-value sysinfo-mono sysinfo-small">' + d.services.failed_list.slice(0, 5).map(escapeHtml).join(', ') + '</span></div>';
    }
    html += '</div></div>';
  }

  html += '</div>'; // close sysinfo-grid

  // === DETAILED SECTIONS ===

  // Top Processes
  if (d.processes && d.processes.top_cpu && d.processes.top_cpu.length > 0) {
    html += '<div class="sysinfo-section">';
    html += '<div class="sysinfo-section-header" onclick="toggleSysinfoSection(this)"><span>Top Prozesse (CPU)</span><span class="sysinfo-toggle">+</span></div>';
    html += '<div class="sysinfo-section-body" style="display:none;">';
    html += '<table class="sysinfo-table"><thead><tr><th>User</th><th>PID</th><th>CPU%</th><th>MEM%</th><th>Command</th></tr></thead><tbody>';
    for (var i = 0; i < Math.min(d.processes.top_cpu.length, 10); i++) {
      var p = d.processes.top_cpu[i];
      html += '<tr><td>' + escapeHtml(p.user || '') + '</td><td>' + (p.pid || '') + '</td><td class="' + (p.cpu > 50 ? 'sysinfo-warn' : '') + '">' + (p.cpu || 0) + '%</td><td>' + (p.mem || 0) + '%</td><td class="sysinfo-mono">' + escapeHtml(p.command || '') + '</td></tr>';
    }
    html += '</tbody></table></div></div>';
  }

  // Listening Ports
  if (d.network && d.network.listening_ports && d.network.listening_ports.length > 0) {
    html += '<div class="sysinfo-section">';
    html += '<div class="sysinfo-section-header" onclick="toggleSysinfoSection(this)"><span>Offene Ports</span><span class="sysinfo-toggle">+</span></div>';
    html += '<div class="sysinfo-section-body" style="display:none;">';
    html += '<table class="sysinfo-table"><thead><tr><th>Proto</th><th>Port</th><th>Prozess</th></tr></thead><tbody>';
    for (var i = 0; i < Math.min(d.network.listening_ports.length, 20); i++) {
      var port = d.network.listening_ports[i];
      html += '<tr><td>' + escapeHtml(port.proto || '') + '</td><td class="sysinfo-mono">' + escapeHtml(port.port || '') + '</td><td>' + escapeHtml(port.process || '') + '</td></tr>';
    }
    html += '</tbody></table></div></div>';
  }

  // Filesystems
  if (d.storage && d.storage.filesystems && d.storage.filesystems.length > 0) {
    html += '<div class="sysinfo-section">';
    html += '<div class="sysinfo-section-header" onclick="toggleSysinfoSection(this)"><span>Filesystems</span><span class="sysinfo-toggle">+</span></div>';
    html += '<div class="sysinfo-section-body" style="display:none;">';
    html += '<table class="sysinfo-table"><thead><tr><th>Mount</th><th>Type</th><th>Size</th><th>Used</th><th>Avail</th><th>Use%</th></tr></thead><tbody>';
    for (var i = 0; i < d.storage.filesystems.length; i++) {
      var fs = d.storage.filesystems[i];
      var useClass = '';
      var usePct = parseInt(fs.use_percent, 10);
      if (usePct >= 90) useClass = 'sysinfo-error';
      else if (usePct >= 80) useClass = 'sysinfo-warn';
      html += '<tr><td class="sysinfo-mono">' + escapeHtml(fs.mount || '') + '</td><td>' + escapeHtml(fs.type || '') + '</td><td>' + escapeHtml(fs.size || '') + '</td><td>' + escapeHtml(fs.used || '') + '</td><td>' + escapeHtml(fs.avail || '') + '</td><td class="' + useClass + '">' + escapeHtml(fs.use_percent || '') + '</td></tr>';
    }
    html += '</tbody></table></div></div>';
  }

  // Recent Logs
  if (d.logs && d.logs.syslog && d.logs.syslog.length > 0) {
    html += '<div class="sysinfo-section">';
    html += '<div class="sysinfo-section-header" onclick="toggleSysinfoSection(this)"><span>Letzte Log-Eintraege</span><span class="sysinfo-toggle">+</span></div>';
    html += '<div class="sysinfo-section-body" style="display:none;">';
    html += '<div class="sysinfo-logs">';
    for (var i = 0; i < Math.min(d.logs.syslog.length, 15); i++) {
      html += '<div class="sysinfo-log-line">' + escapeHtml(d.logs.syslog[i] || '') + '</div>';
    }
    html += '</div></div></div>';
  }

  contentEl.innerHTML = html;
}

function toggleSysinfoSection(headerEl) {
  var body = headerEl.nextElementSibling;
  var toggle = headerEl.querySelector('.sysinfo-toggle');
  if (body.style.display === 'none') {
    body.style.display = 'block';
    toggle.textContent = '-';
  } else {
    body.style.display = 'none';
    toggle.textContent = '+';
  }
}

function formatUptime(seconds) {
  if (!seconds) return '-';
  var days = Math.floor(seconds / 86400);
  var hours = Math.floor((seconds % 86400) / 3600);
  var mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return days + 'd ' + hours + 'h ' + mins + 'm';
  if (hours > 0) return hours + 'h ' + mins + 'm';
  return mins + 'm';
}

// Load system info when system tab is opened
var systemTabBtn = document.querySelector('[data-tab="system"]');
if (systemTabBtn && !systemTabBtn.hasAttribute('data-sysinfo-listener')) {
  systemTabBtn.addEventListener('click', function() {
    if (!systemInfoData) {
      loadSystemInfo(<%= node.id %>);
    }
  });
  systemTabBtn.setAttribute('data-sysinfo-listener', 'true');
}

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
      loadNetworkDiagnostics(<%= node.id %>);
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
