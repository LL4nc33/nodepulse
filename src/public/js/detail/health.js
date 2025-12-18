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

  NP.API.post('/api/nodes/' + nodeId + '/health/check', null, { timeout: 120000 })
    .then(function(data) {
      resetButtons();
      if (window.NP && window.NP.Toast) {
        window.NP.Toast.show('Health-Check abgeschlossen', 'success');
      }
      window.location.reload();
    })
    .catch(function(error) {
      resetButtons();
      if (window.NP && window.NP.Toast) {
        window.NP.Toast.show('Health-Check fehlgeschlagen: ' + error.message, 'error');
      }
    });
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

  NP.API.post('/api/nodes/' + nodeId + '/health/upgrade', null, { timeout: 600000 })
    .then(function(data) {
      resetButton();
      var msg = 'Upgrade abgeschlossen';
      if (data.packages_upgraded) {
        msg += ' (' + data.packages_upgraded + ' Pakete)';
      }
      if (data.reboot_required) {
        msg += ' - Reboot erforderlich!';
      }
      if (window.NP && window.NP.Toast) {
        window.NP.Toast.show(msg, 'success');
      }
      setTimeout(function() { window.location.reload(); }, 2000);
    })
    .catch(function(error) {
      resetButton();
      if (window.NP && window.NP.Toast) {
        window.NP.Toast.show('Upgrade fehlgeschlagen: ' + error.message, 'error');
      }
    });
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

  NP.API.post('/api/nodes/' + nodeId + '/health/repo', { mode: mode }, { timeout: 60000 })
    .then(function(data) {
      resetButton();
      if (window.NP && window.NP.Toast) {
        window.NP.Toast.show('Repository gewechselt zu ' + modeName, 'success');
      }
      setTimeout(function() { window.location.reload(); }, 1500);
    })
    .catch(function(error) {
      resetButton();
      if (window.NP && window.NP.Toast) {
        window.NP.Toast.show('Repository-Wechsel fehlgeschlagen: ' + error.message, 'error');
      }
    });
}
