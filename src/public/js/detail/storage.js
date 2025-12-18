/* =====================================================
   Storage Tab JavaScript (LVM Management)
   ES5 Compatible (Chrome 50+, Fire HD 10 2017)
   ===================================================== */

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
