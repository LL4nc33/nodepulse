// formatBytes and toggleSection are available from global helpers (main.js)

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

  NP.API.get('/api/nodes/' + nodeId + '/proxmox/resources', { timeout: 60000 })
    .then(function(response) {
      if (loading) loading.style.display = 'none';
      populateVmForm(response.data);
      if (form) form.style.display = 'block';
      if (btn) btn.disabled = false;
    })
    .catch(function(err) {
      if (loading) loading.style.display = 'none';
      if (error) {
        error.textContent = 'Fehler beim Laden der Ressourcen: ' + (err.message || 'Unbekannter Fehler');
        error.style.display = 'block';
      }
    });
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

  NP.API.post('/api/nodes/' + createVmNodeId + '/proxmox/vms/create', formData, { timeout: 180000 })
    .then(function(response) {
      alert('VM ' + formData.vmid + ' erfolgreich erstellt!');
      closeCreateVmModal();
      window.location.reload();
      if (btn) {
        btn.classList.remove('loading');
        btn.disabled = false;
      }
    })
    .catch(function(err) {
      if (error) {
        error.textContent = 'Fehler: ' + (err.message || 'Unbekannter Fehler');
        error.style.display = 'block';
      }
      if (btn) {
        btn.classList.remove('loading');
        btn.disabled = false;
      }
    });
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

  NP.API.get('/api/nodes/' + nodeId + '/proxmox/resources', { timeout: 60000 })
    .then(function(response) {
      if (loading) loading.style.display = 'none';
      populateCtForm(response.data);
      if (form) form.style.display = 'block';
      if (btn) btn.disabled = false;
    })
    .catch(function(err) {
      if (loading) loading.style.display = 'none';
      if (error) {
        error.textContent = 'Fehler beim Laden der Ressourcen: ' + (err.message || 'Unbekannter Fehler');
        error.style.display = 'block';
      }
    });
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

  NP.API.post('/api/nodes/' + createCtNodeId + '/proxmox/cts/create', formData, { timeout: 180000 })
    .then(function(response) {
      alert('CT ' + formData.ctid + ' erfolgreich erstellt!');
      closeCreateCtModal();
      window.location.reload();
      if (btn) {
        btn.classList.remove('loading');
        btn.disabled = false;
      }
    })
    .catch(function(err) {
      if (error) {
        error.textContent = 'Fehler: ' + (err.message || 'Unbekannter Fehler');
        error.style.display = 'block';
      }
      if (btn) {
        btn.classList.remove('loading');
        btn.disabled = false;
      }
    });
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

  NP.API.post('/api/nodes/' + nodeId + '/proxmox/snapshots', {
    vm_type: vmType,
    vmid: parseInt(vmid, 10),
    snap_name: snapName,
    description: description
  }, { timeout: 300000 })
    .then(function(response) {
      activeSnapshotXHR = null;
      if (resultEl) {
        resultEl.className = 'alert alert-success';
        resultEl.textContent = 'Snapshot erstellt. Seite wird neu geladen...';
      }
      setTimeout(function() {
        window.location.reload();
      }, 1500);
      if (btnEl) {
        btnEl.classList.remove('loading');
        btnEl.disabled = false;
      }
    })
    .catch(function(error) {
      activeSnapshotXHR = null;
      if (resultEl) {
        resultEl.className = 'alert alert-error';
        resultEl.textContent = 'Fehler: ' + (error.message || 'Unbekannter Fehler');
      }
      if (btnEl) {
        btnEl.classList.remove('loading');
        btnEl.disabled = false;
      }
    });
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

  NP.API.delete('/api/nodes/' + nodeId + '/proxmox/snapshots/' + encodeURIComponent(vmType) + '/' + encodeURIComponent(vmid) + '/' + encodeURIComponent(snapName), { timeout: 300000 })
    .then(function(response) {
      if (resultEl) {
        resultEl.className = 'alert alert-success';
        resultEl.textContent = 'Snapshot gelöscht. Aktualisiere...';
      }
      setTimeout(function() {
        refreshProxmox(nodeId);
      }, 1000);
    })
    .catch(function(error) {
      if (resultEl) {
        resultEl.className = 'alert alert-error';
        resultEl.textContent = 'Fehler: ' + (error.message || 'Unbekannter Fehler');
      }
    });
}

// =====================================================