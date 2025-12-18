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
