// formatBytes and toggleSection are available as window.NP.Helpers from main.js

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

  NP.API.patch(url, { cores: cores, memory: memory }, { timeout: 60000 })
    .then(function(response) {
      closeConfigModal();
      var resultEl = document.getElementById('proxmox-result');
      if (resultEl) {
        resultEl.className = 'alert alert-success';
        resultEl.textContent = 'Konfiguration gespeichert. Seite wird neu geladen...';
        resultEl.style.display = 'block';
      }
      setTimeout(function() { location.reload(); }, 1500);
      if (btnEl) { btnEl.classList.remove('loading'); btnEl.disabled = false; }
    })
    .catch(function(error) {
      errorEl.textContent = error.message || 'Speichern fehlgeschlagen';
      errorEl.style.display = 'block';
      if (btnEl) { btnEl.classList.remove('loading'); btnEl.disabled = false; }
    });
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

  NP.API.post(url, body, { timeout: 600000 })
    .then(function(response) {
      closeCloneModal();
      var resultEl = document.getElementById('proxmox-result');
      if (resultEl) {
        resultEl.className = 'alert alert-success';
        resultEl.textContent = 'Clone erfolgreich erstellt! Seite wird neu geladen...';
        resultEl.style.display = 'block';
      }
      setTimeout(function() { location.reload(); }, 2000);
      if (btnEl) { btnEl.classList.remove('loading'); btnEl.disabled = false; }
    })
    .catch(function(error) {
      errorEl.textContent = error.message || 'Clone fehlgeschlagen';
      errorEl.style.display = 'block';
      if (btnEl) { btnEl.classList.remove('loading'); btnEl.disabled = false; }
    });
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

  NP.API.post(url, {}, { timeout: 120000 })
    .then(function(response) {
      closeTemplateModal();
      var resultEl = document.getElementById('proxmox-result');
      if (resultEl) {
        resultEl.className = 'alert alert-success';
        resultEl.textContent = 'Template erstellt! Seite wird neu geladen...';
        resultEl.style.display = 'block';
      }
      setTimeout(function() { location.reload(); }, 1500);
      if (btnEl) { btnEl.classList.remove('loading'); btnEl.disabled = false; }
    })
    .catch(function(error) {
      errorEl.textContent = error.message || 'Konvertierung fehlgeschlagen';
      errorEl.style.display = 'block';
      if (btnEl) { btnEl.classList.remove('loading'); btnEl.disabled = false; }
    });
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