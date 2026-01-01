// =============================================================================
// AGENT MANAGEMENT FUNCTIONS (ES5 Compatible - Fire HD 10 Support)
// =============================================================================

/**
 * Load agent status for a node
 * @param {number} nodeId - The node ID
 */
function loadAgentStatus(nodeId) {
  var btn = document.getElementById('btn-refresh-agent');
  if (btn) {
    btn.classList.add('loading');
  }

  NP.API.get('/api/nodes/' + nodeId + '/agent')
    .then(function(status) {
      if (btn) btn.classList.remove('loading');
      updateAgentUI(status);
    })
    .catch(function(error) {
      if (btn) btn.classList.remove('loading');
      updateAgentUI({ enabled: false, connected: false });
      console.error('[Agent] Failed to load status:', error.message);
    });
}

/**
 * Update the agent UI based on status
 * @param {Object} status - Agent status object
 */
function updateAgentUI(status) {
  var statusBadge = document.getElementById('agent-status-badge');
  var versionEl = document.getElementById('agent-version');
  var archEl = document.getElementById('agent-arch');
  var heartbeatEl = document.getElementById('agent-heartbeat');
  var fallbackEl = document.getElementById('agent-fallback');
  var installedEl = document.getElementById('agent-installed');

  var installBtn = document.getElementById('btn-agent-install');
  var updateBtn = document.getElementById('btn-agent-update');
  var uninstallBtn = document.getElementById('btn-agent-uninstall');
  var fallbackToggle = document.getElementById('agent-fallback-toggle');
  var fallbackCheckbox = document.getElementById('agent-fallback-checkbox');

  // Status Badge
  if (statusBadge) {
    if (!status.enabled) {
      statusBadge.innerHTML = '<span class="agent-badge">Nicht installiert</span>';
    } else if (status.connected) {
      statusBadge.innerHTML = '<span class="agent-badge connected">Verbunden</span>';
    } else {
      statusBadge.innerHTML = '<span class="agent-badge disconnected">Getrennt</span>';
    }
  }

  // Version
  if (versionEl) {
    versionEl.textContent = status.version || '-';
  }

  // Architecture
  if (archEl) {
    archEl.textContent = status.arch || '-';
  }

  // Last Heartbeat
  if (heartbeatEl) {
    if (status.last_heartbeat) {
      var date = new Date(status.last_heartbeat * 1000);
      heartbeatEl.textContent = date.toLocaleString('de-DE');
    } else {
      heartbeatEl.textContent = '-';
    }
  }

  // SSH Fallback
  if (fallbackEl) {
    fallbackEl.textContent = status.ssh_fallback ? 'Aktiv' : 'Deaktiviert';
  }

  // Installed At
  if (installedEl) {
    if (status.installed_at) {
      var installDate = new Date(status.installed_at * 1000);
      installedEl.textContent = installDate.toLocaleString('de-DE');
    } else {
      installedEl.textContent = '-';
    }
  }

  // Buttons visibility
  if (installBtn) {
    installBtn.style.display = !status.enabled ? '' : 'none';
  }
  if (updateBtn) {
    updateBtn.style.display = status.enabled ? '' : 'none';
  }
  if (uninstallBtn) {
    uninstallBtn.style.display = status.enabled ? '' : 'none';
  }
  if (fallbackToggle) {
    fallbackToggle.style.display = status.enabled ? '' : 'none';
  }
  if (fallbackCheckbox) {
    fallbackCheckbox.checked = status.ssh_fallback;
  }
}

/**
 * Install agent on a node
 * @param {number} nodeId - The node ID
 */
function installAgent(nodeId) {
  if (!confirm('Agent auf diesem Node installieren?')) {
    return;
  }

  var btn = document.getElementById('btn-agent-install');
  if (btn) {
    btn.classList.add('loading');
    btn.disabled = true;
  }

  NP.API.post('/api/nodes/' + nodeId + '/agent/install', {}, { timeout: 180000 })
    .then(function(result) {
      if (btn) {
        btn.classList.remove('loading');
        btn.disabled = false;
      }
      if (window.NP && window.NP.Toast) {
        window.NP.Toast.show('Agent installiert (Version: ' + (result.version || 'unknown') + ')', 'success');
      }
      loadAgentStatus(nodeId);
    })
    .catch(function(error) {
      if (btn) {
        btn.classList.remove('loading');
        btn.disabled = false;
      }
      if (window.NP && window.NP.Toast) {
        window.NP.Toast.show('Installation fehlgeschlagen: ' + error.message, 'error');
      }
    });
}

/**
 * Update agent on a node
 * @param {number} nodeId - The node ID
 */
function updateAgent(nodeId) {
  if (!confirm('Agent aktualisieren?')) {
    return;
  }

  var btn = document.getElementById('btn-agent-update');
  if (btn) {
    btn.classList.add('loading');
    btn.disabled = true;
  }

  NP.API.post('/api/nodes/' + nodeId + '/agent/update', {}, { timeout: 180000 })
    .then(function(result) {
      if (btn) {
        btn.classList.remove('loading');
        btn.disabled = false;
      }
      if (window.NP && window.NP.Toast) {
        window.NP.Toast.show('Agent aktualisiert (Version: ' + (result.version || 'unknown') + ')', 'success');
      }
      loadAgentStatus(nodeId);
    })
    .catch(function(error) {
      if (btn) {
        btn.classList.remove('loading');
        btn.disabled = false;
      }
      if (window.NP && window.NP.Toast) {
        window.NP.Toast.show('Update fehlgeschlagen: ' + error.message, 'error');
      }
    });
}

/**
 * Uninstall agent from a node
 * @param {number} nodeId - The node ID
 */
function uninstallAgent(nodeId) {
  if (!confirm('Agent wirklich deinstallieren? Die Verbindung wird getrennt.')) {
    return;
  }

  var btn = document.getElementById('btn-agent-uninstall');
  if (btn) {
    btn.classList.add('loading');
    btn.disabled = true;
  }

  NP.API.delete('/api/nodes/' + nodeId + '/agent', { timeout: 120000 })
    .then(function() {
      if (btn) {
        btn.classList.remove('loading');
        btn.disabled = false;
      }
      if (window.NP && window.NP.Toast) {
        window.NP.Toast.show('Agent deinstalliert', 'success');
      }
      loadAgentStatus(nodeId);
    })
    .catch(function(error) {
      if (btn) {
        btn.classList.remove('loading');
        btn.disabled = false;
      }
      if (window.NP && window.NP.Toast) {
        window.NP.Toast.show('Deinstallation fehlgeschlagen: ' + error.message, 'error');
      }
    });
}

/**
 * Toggle SSH fallback for agent
 * @param {number} nodeId - The node ID
 * @param {boolean} enabled - New fallback state
 */
function toggleAgentFallback(nodeId, enabled) {
  NP.API.patch('/api/nodes/' + nodeId + '/agent/fallback', { enabled: enabled })
    .then(function(status) {
      if (window.NP && window.NP.Toast) {
        window.NP.Toast.show('SSH-Fallback ' + (enabled ? 'aktiviert' : 'deaktiviert'), 'success');
      }
      updateAgentUI(status);
    })
    .catch(function(error) {
      if (window.NP && window.NP.Toast) {
        window.NP.Toast.show('Fehler: ' + error.message, 'error');
      }
      // Revert checkbox
      var checkbox = document.getElementById('agent-fallback-checkbox');
      if (checkbox) {
        checkbox.checked = !enabled;
      }
    });
}

// Auto-load agent status when system tab becomes visible
(function() {
  // Wait for DOM and check if we're on detail page
  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', function() {
      var systemTab = document.getElementById('tab-system');
      if (systemTab) {
        // Load on tab switch
        var tabBtns = document.querySelectorAll('.detail-tab[data-tab="system"]');
        for (var i = 0; i < tabBtns.length; i++) {
          var originalClick = tabBtns[i].onclick;
          tabBtns[i].onclick = function(e) {
            if (originalClick) originalClick.call(this, e);
            // Get nodeId from URL or page data
            var nodeId = window.NP && window.NP.nodeId;
            if (nodeId) {
              loadAgentStatus(nodeId);
            }
          };
        }
      }
    });
  }
})();
