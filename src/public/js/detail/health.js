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
