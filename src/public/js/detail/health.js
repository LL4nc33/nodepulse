// =============================================================================
// HEALTH CHECK FUNCTIONS
// =============================================================================

/**
 * Run a health check on the node
 * @param {number} nodeId - The node ID
 */
function runHealthCheck(nodeId) {
  var btns = document.querySelectorAll('.btn-health-check');
  btns.forEach(function(btn) {
    btn.classList.add('loading');
    btn.disabled = true;
  });

  fetch('/api/nodes/' + nodeId + '/health/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  })
  .then(function(response) { return response.json(); })
  .then(function(data) {
    if (data.success) {
      // Show success toast
      if (window.NP && window.NP.Toast) {
        window.NP.Toast.show('Health-Check abgeschlossen', 'success');
      }
      // Reload page to show new data
      window.location.reload();
    } else {
      if (window.NP && window.NP.Toast) {
        window.NP.Toast.show('Health-Check fehlgeschlagen: ' + (data.error && data.error.message || 'Unbekannter Fehler'), 'error');
      }
    }
  })
  .catch(function(err) {
    if (window.NP && window.NP.Toast) {
      window.NP.Toast.show('Health-Check fehlgeschlagen: ' + err.message, 'error');
    }
  })
  .finally(function() {
    btns.forEach(function(btn) {
      btn.classList.remove('loading');
      btn.disabled = false;
    });
  });
}

/**
 * Run apt upgrade on the node
 * @param {number} nodeId - The node ID
 */
function runUpgrade(nodeId) {
  if (!confirm('System-Upgrade durchfuehren? Dies kann einige Minuten dauern.')) {
    return;
  }

  var btn = event.target.closest('button');
  if (btn) {
    btn.classList.add('loading');
    btn.disabled = true;
  }

  if (window.NP && window.NP.Toast) {
    window.NP.Toast.show('Upgrade gestartet... Dies kann einige Minuten dauern.', 'info');
  }

  fetch('/api/nodes/' + nodeId + '/health/upgrade', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  })
  .then(function(response) { return response.json(); })
  .then(function(data) {
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
      // Reload page to refresh health data
      setTimeout(function() { window.location.reload(); }, 2000);
    } else {
      if (window.NP && window.NP.Toast) {
        window.NP.Toast.show('Upgrade fehlgeschlagen: ' + (data.error && data.error.message || 'Unbekannter Fehler'), 'error');
      }
    }
  })
  .catch(function(err) {
    if (window.NP && window.NP.Toast) {
      window.NP.Toast.show('Upgrade fehlgeschlagen: ' + err.message, 'error');
    }
  })
  .finally(function() {
    if (btn) {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  });
}

/**
 * Switch Proxmox repository
 * @param {number} nodeId - The node ID
 * @param {string} mode - "enterprise" or "no-subscription"
 */
function switchProxmoxRepo(nodeId, mode) {
  var modeName = mode === 'enterprise' ? 'Enterprise' : 'No-Subscription';
  if (!confirm('Wirklich zu ' + modeName + ' Repository wechseln?')) {
    return;
  }

  var btn = event.target.closest('button');
  if (btn) {
    btn.classList.add('loading');
    btn.disabled = true;
  }

  fetch('/api/nodes/' + nodeId + '/health/repo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: mode })
  })
  .then(function(response) { return response.json(); })
  .then(function(data) {
    if (data.success) {
      if (window.NP && window.NP.Toast) {
        window.NP.Toast.show('Repository gewechselt zu ' + modeName, 'success');
      }
      // Reload page to refresh data
      setTimeout(function() { window.location.reload(); }, 1500);
    } else {
      if (window.NP && window.NP.Toast) {
        window.NP.Toast.show('Repository-Wechsel fehlgeschlagen: ' + (data.error && data.error.message || 'Unbekannter Fehler'), 'error');
      }
    }
  })
  .catch(function(err) {
    if (window.NP && window.NP.Toast) {
      window.NP.Toast.show('Repository-Wechsel fehlgeschlagen: ' + err.message, 'error');
    }
  })
  .finally(function() {
    if (btn) {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  });
}
