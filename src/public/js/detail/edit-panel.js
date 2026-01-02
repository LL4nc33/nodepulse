// =============================================================================
// EDIT PANEL FUNCTIONS (ES5 Compatible - Chrome 50+ Support)
// =============================================================================

/**
 * Open the edit panel
 */
function openEditPanel() {
  var overlay = document.getElementById('editPanelOverlay');
  var panel = document.getElementById('editPanel');
  if (overlay && panel) {
    overlay.classList.add('open');
    panel.classList.add('open');
    document.body.style.overflow = 'hidden';

    // Focus first input
    var firstInput = panel.querySelector('input[type="text"]');
    if (firstInput) {
      setTimeout(function() { firstInput.focus(); }, 100);
    }
  }
}

/**
 * Close the edit panel
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
 * Toggle monitoring status
 */
function toggleMonitoring() {
  var btn = document.getElementById('monitoring-toggle');
  var input = document.getElementById('edit-monitoring_enabled');

  if (!btn || !input) return;

  var isActive = btn.classList.contains('active');

  if (isActive) {
    btn.classList.remove('active');
    input.value = '0';
    btn.querySelector('.toggle-text').textContent = 'AUS';
  } else {
    btn.classList.add('active');
    input.value = '1';
    btn.querySelector('.toggle-text').textContent = 'AN';
  }
}

/**
 * Save node changes
 * @param {Event} event - Form submit event
 */
function saveNode(event) {
  event.preventDefault();

  var form = event.target;
  var submitBtn = form.querySelector('button[type="submit"]');

  // Get node ID from URL
  var pathParts = window.location.pathname.split('/');
  var nodeId = pathParts[pathParts.length - 1];

  if (!nodeId || isNaN(nodeId)) {
    if (window.NP && window.NP.Toast) {
      window.NP.Toast.show('Fehler: Node-ID nicht gefunden', 'error');
    }
    return;
  }

  // Collect form data
  var data = {
    name: form.querySelector('[name="name"]').value,
    host: form.querySelector('[name="host"]').value,
    ssh_user: form.querySelector('[name="ssh_user"]').value,
    ssh_port: parseInt(form.querySelector('[name="ssh_port"]').value, 10) || 22,
    ssh_key_path: form.querySelector('[name="ssh_key_path"]').value || null,
    monitoring_enabled: form.querySelector('[name="monitoring_enabled"]').value === '1',
    monitoring_interval: parseInt(form.querySelector('[name="monitoring_interval"]').value, 10) || 60,
    notes: form.querySelector('[name="notes"]').value || null
  };

  // Only include password if changed
  var passwordInput = form.querySelector('[name="ssh_password"]');
  if (passwordInput && passwordInput.value) {
    data.ssh_password = passwordInput.value;
  }

  // Show loading state
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner"></span> Speichern...';
  }

  // API call
  window.NP.API.put('/api/nodes/' + nodeId, data)
    .then(function(result) {
      if (window.NP && window.NP.Toast) {
        window.NP.Toast.show('Node gespeichert', 'success');
      }
      closeEditPanel();

      // Update page header with new values
      updatePageHeader(data);

      // Reset button
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Speichern';
      }
    })
    .catch(function(error) {
      if (window.NP && window.NP.Toast) {
        window.NP.Toast.show('Fehler: ' + error.message, 'error');
      }

      // Reset button
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Speichern';
      }
    });
}

/**
 * Update page header after save
 * @param {Object} data - Saved node data
 */
function updatePageHeader(data) {
  // Update title
  var titleEl = document.querySelector('.page-header-compact h1');
  if (titleEl) {
    var statusDot = titleEl.querySelector('.status-dot');
    titleEl.innerHTML = '';
    if (statusDot) titleEl.appendChild(statusDot);
    titleEl.appendChild(document.createTextNode(' ' + data.name));
  }

  // Update breadcrumb
  var breadcrumbSpan = document.querySelector('.breadcrumb-inline span');
  if (breadcrumbSpan) {
    breadcrumbSpan.textContent = data.name;
  }

  // Update connection info
  var monoSpan = document.querySelector('.node-info-inline .mono');
  if (monoSpan) {
    monoSpan.textContent = data.ssh_user + '@' + data.host + ':' + data.ssh_port;
  }

  // Update monitoring badge
  var monitoringBadge = document.querySelector('.monitoring-badge');
  if (monitoringBadge) {
    if (data.monitoring_enabled) {
      monitoringBadge.classList.remove('inactive');
      monitoringBadge.classList.add('active');
      monitoringBadge.querySelector('span:last-child') &&
        (monitoringBadge.querySelector('span:last-child').textContent = data.monitoring_interval + 's');
    } else {
      monitoringBadge.classList.remove('active');
      monitoringBadge.classList.add('inactive');
    }
  }
}

/**
 * Delete a node
 * @param {number} nodeId - Node ID
 * @param {string} nodeName - Node name for confirmation
 */
function deleteNode(nodeId, nodeName) {
  var confirmMsg = 'Node "' + nodeName + '" wirklich loeschen?\n\n' +
                   'Alle zugehoerigen Daten (Stats, Hardware, Docker, etc.) werden unwiderruflich geloescht!';

  if (!confirm(confirmMsg)) {
    return;
  }

  // Double confirmation for safety
  var doubleConfirm = prompt('Zur Bestaetigung den Node-Namen eingeben:', '');
  if (doubleConfirm !== nodeName) {
    if (window.NP && window.NP.Toast) {
      window.NP.Toast.show('Loeschen abgebrochen - Name stimmte nicht ueberein', 'warning');
    }
    return;
  }

  window.NP.API.delete('/api/nodes/' + nodeId)
    .then(function() {
      if (window.NP && window.NP.Toast) {
        window.NP.Toast.show('Node geloescht', 'success');
      }
      // Redirect to nodes list
      window.location.href = '/nodes';
    })
    .catch(function(error) {
      if (window.NP && window.NP.Toast) {
        window.NP.Toast.show('Fehler beim Loeschen: ' + error.message, 'error');
      }
    });
}

// Make functions globally available
window.openEditPanel = openEditPanel;
window.closeEditPanel = closeEditPanel;
window.toggleMonitoring = toggleMonitoring;
window.saveNode = saveNode;
window.deleteNode = deleteNode;
