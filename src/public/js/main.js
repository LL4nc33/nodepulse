/* nodepulse - Main JavaScript v0.3.2
   ES5 compatible for Chrome 50+, Fire HD 10 2017
   Einheitliche API-Integration, Tab-System, Loading States, Toast Notifications
*/

(function() {
  'use strict';

  // =====================================================
  // Globale Namespace
  // =====================================================

  window.NP = window.NP || {};

  // =====================================================
  // API Client - Einheitliche Schnittstelle
  // =====================================================

  var API = {
    /**
     * Fuehrt einen API-Request aus
     * @param {string} method - HTTP Methode (GET, POST, PUT, DELETE)
     * @param {string} url - API Endpoint
     * @param {Object} data - Request Body (optional)
     * @param {Object} options - {timeout, onProgress}
     * @returns {Promise}
     */
    request: function(method, url, data, options) {
      options = options || {};
      var timeout = options.timeout || 30000;

      return new Promise(function(resolve, reject) {
        var xhr = new XMLHttpRequest();
        var timeoutId = null;

        xhr.open(method, url, true);
        xhr.setRequestHeader('Content-Type', 'application/json');

        timeoutId = setTimeout(function() {
          xhr.abort();
          reject({ code: 'TIMEOUT', message: 'Anfrage Timeout (' + Math.round(timeout / 1000) + 's)' });
        }, timeout);

        xhr.onreadystatechange = function() {
          if (xhr.readyState === 4) {
            clearTimeout(timeoutId);

            var response;
            try {
              response = JSON.parse(xhr.responseText);

              // Auto-detect TOON format and parse
              if (response.success && response.data && window.NP && window.NP.TOON) {
                if (response.data.format === 'toon') {
                  // TOON Response with nodes array
                  if (response.data.nodes) {
                    var parsed = window.NP.TOON.parseResponse(response.data);
                    if (parsed) {
                      response.data = parsed; // Replace with standard array
                    } else {
                      console.warn('[TOON] Parse failed, keeping original');
                    }
                  }
                  // TOON History Response
                  else if (response.data.history) {
                    var parsedHistory = window.NP.TOON.parseHistory(response.data);
                    if (parsedHistory) {
                      response.data = parsedHistory; // Replace with standard array
                    } else {
                      console.warn('[TOON] History parse failed, keeping original');
                    }
                  }
                }
              }
            } catch (e) {
              response = { success: false, error: { code: 'PARSE_ERROR', message: 'Ungueltige Server-Antwort' } };
            }

            if (xhr.status >= 200 && xhr.status < 300 && response.success) {
              resolve(response.data);
            } else {
              var error = response.error || { code: 'ERROR', message: 'Anfrage fehlgeschlagen (HTTP ' + xhr.status + ')' };
              reject(error);
            }
          }
        };

        xhr.onerror = function() {
          clearTimeout(timeoutId);
          reject({ code: 'NETWORK_ERROR', message: 'Netzwerkfehler - Server nicht erreichbar' });
        };

        if (data) {
          xhr.send(JSON.stringify(data));
        } else {
          xhr.send();
        }
      });
    },

    get: function(url, options) {
      return this.request('GET', url, null, options);
    },

    post: function(url, data, options) {
      return this.request('POST', url, data, options);
    },

    put: function(url, data, options) {
      return this.request('PUT', url, data, options);
    },

    delete: function(url, options) {
      return this.request('DELETE', url, null, options);
    }
  };

  // Legacy AJAX Function fuer Rueckwaertskompatibilitaet
  function ajax(method, url, data, callback, timeout) {
    API.request(method, url, data, { timeout: timeout })
      .then(function(responseData) {
        callback(null, { success: true, data: responseData });
      })
      .catch(function(error) {
        callback(error, { success: false, error: error });
      });
  }

  // Expose
  window.NP.API = API;
  window.ajax = ajax; // Legacy

  // =====================================================
  // UI Helpers - Einheitliche Komponenten
  // =====================================================

  var UI = {
    /**
     * Alert anzeigen (inline)
     */
    showAlert: function(element, type, message) {
      if (!element) return;
      element.className = 'alert alert-' + type;
      element.textContent = message;
      element.style.display = 'block';
      element.setAttribute('role', 'alert');
      element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    },

    /**
     * Alert verstecken
     */
    hideAlert: function(element) {
      if (!element) return;
      element.style.display = 'none';
    },

    /**
     * Button Loading State setzen
     */
    setButtonLoading: function(btn, loading, loadingText) {
      if (!btn) return;

      if (loading) {
        btn.classList.add('loading');
        btn.disabled = true;
        if (loadingText) {
          btn.setAttribute('data-original-text', btn.textContent);
          btn.innerHTML = '<span class="spinner"></span> ' + loadingText;
        }
      } else {
        btn.classList.remove('loading');
        btn.disabled = false;
        var originalText = btn.getAttribute('data-original-text');
        if (originalText) {
          btn.textContent = originalText;
          btn.removeAttribute('data-original-text');
        }
      }
    },

    /**
     * Mehrere Buttons gleichzeitig
     */
    setButtonsLoading: function(selector, loading) {
      var btns = document.querySelectorAll(selector);
      for (var i = 0; i < btns.length; i++) {
        this.setButtonLoading(btns[i], loading);
      }
    },

    /**
     * Loading Overlay fuer Container
     */
    showLoading: function(container, message) {
      if (!container) return;
      this.hideLoading(container); // Remove existing
      var overlay = document.createElement('div');
      overlay.className = 'loading-overlay';
      overlay.innerHTML = '<div class="spinner"></div>' +
        '<div class="loading-overlay-message">' + (message || 'Laden...') + '</div>';
      container.classList.add('has-loading-overlay');
      container.appendChild(overlay);
    },

    /**
     * Loading Overlay verstecken
     */
    hideLoading: function(container) {
      if (!container) return;
      var overlay = container.querySelector('.loading-overlay');
      if (overlay) {
        overlay.parentNode.removeChild(overlay);
      }
      container.classList.remove('has-loading-overlay');
    },

    /**
     * Toast Notification anzeigen
     */
    toast: function(message, type, duration) {
      type = type || 'info';
      duration = duration || 4000;

      var containerEl = document.querySelector('.np-toast-container');
      if (!containerEl) {
        containerEl = document.createElement('div');
        containerEl.className = 'np-toast-container';
        document.body.appendChild(containerEl);
      }

      var icons = {
        success: '<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>',
        error: '<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/></svg>',
        warning: '<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>',
        info: '<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/></svg>'
      };

      var toastEl = document.createElement('div');
      toastEl.className = 'np-toast np-toast-' + type;
      toastEl.innerHTML = '<span class="np-toast-icon">' + (icons[type] || icons.info) + '</span>' +
        '<div class="np-toast-content"><span class="np-toast-message">' + message + '</span></div>';
      containerEl.appendChild(toastEl);

      var removeToast = function() {
        toastEl.classList.add('np-toast-out');
        setTimeout(function() {
          if (toastEl.parentNode) {
            toastEl.parentNode.removeChild(toastEl);
          }
        }, 200);
      };

      toastEl.addEventListener('click', removeToast);
      setTimeout(removeToast, duration);

      return toastEl;
    },

    /**
     * Empty State anzeigen
     */
    showEmptyState: function(container, icon, title, text, buttonHtml) {
      if (!container) return;
      var html = '<div class="empty-state">' +
        '<div class="empty-state-icon">' + (icon || '') + '</div>' +
        '<div class="empty-state-title">' + (title || 'Keine Daten') + '</div>' +
        '<p class="empty-state-text">' + (text || '') + '</p>' +
        (buttonHtml || '') +
        '</div>';
      container.innerHTML = html;
    },

    /**
     * Bytes formatieren
     */
    formatBytes: function(bytes) {
      if (!bytes || bytes === 0) return '0 B';
      var k = 1024;
      var sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
      var i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },

    /**
     * Timestamp-Alter formatieren
     * @param {number} unixTimestamp - Unix timestamp in Sekunden
     * @returns {string} "(5s)", "(2m ago)", "(3h ago)"
     */
    formatTimestamp: function(unixTimestamp) {
      if (!unixTimestamp || unixTimestamp <= 0) return '';
      var now = Math.floor(Date.now() / 1000);
      var age = now - unixTimestamp;

      if (age < 60) return '(' + age + 's)';
      if (age < 3600) return '(' + Math.floor(age / 60) + 'm ago)';
      return '(' + Math.floor(age / 3600) + 'h ago)';
    },

    /**
     * Uptime formatieren
     * @param {number} seconds - Uptime in Sekunden
     * @returns {string} "19d 0h", "5h 30m", "45m"
     */
    formatUptime: function(seconds) {
      if (!seconds || seconds < 0) return '-';
      var days = Math.floor(seconds / 86400);
      var hours = Math.floor((seconds % 86400) / 3600);
      var mins = Math.floor((seconds % 3600) / 60);

      if (days > 0) return days + 'd ' + hours + 'h';
      if (hours > 0) return hours + 'h ' + mins + 'm';
      return mins + 'm';
    },

    /**
     * Zeitdifferenz formatieren (German)
     */
    formatTimeAgo: function(timestamp) {
      var now = Date.now();
      var diff = now - (timestamp * 1000);
      var mins = Math.floor(diff / 60000);
      var hours = Math.floor(diff / 3600000);
      var days = Math.floor(diff / 86400000);

      if (mins < 1) return 'gerade eben';
      if (mins < 60) return 'vor ' + mins + ' Min';
      if (hours < 24) return 'vor ' + hours + ' Std';
      return 'vor ' + days + ' Tag' + (days > 1 ? 'en' : '');
    }
  };

  window.NP.UI = UI;
  window.formatBytes = UI.formatBytes; // Legacy
  window.formatTimestamp = UI.formatTimestamp; // For client-side updates
  window.formatUptime = UI.formatUptime; // For client-side updates

  // =====================================================
  // Tab System - Einheitlich fuer alle Seiten
  // =====================================================

  var Tabs = {
    /**
     * Tab-System initialisieren
     * @param {Object} options - {container, storageKey, onSwitch}
     */
    init: function(options) {
      options = options || {};
      var container = options.container || document;
      var storageKey = options.storageKey || null;
      var onSwitch = options.onSwitch || null;
      var useHash = options.useHash !== false;

      var tabBtns = container.querySelectorAll('.tab-btn, .tabs-btn, .settings-tab, .alerts-tab');
      var self = this;

      // Attach click handlers
      for (var i = 0; i < tabBtns.length; i++) {
        tabBtns[i].addEventListener('click', function(e) {
          var tabId = this.getAttribute('data-tab') || this.getAttribute('href');
          if (tabId) {
            // Wenn es ein Link ist, preventDefault
            if (this.tagName === 'A' && tabId.charAt(0) !== '/') {
              e.preventDefault();
              tabId = tabId.replace('#', '').replace('?filter=', '');
            }
            self.switchTo(tabId, container, {
              storageKey: storageKey,
              useHash: useHash,
              onSwitch: onSwitch
            });
          }
        });
      }

      // Restore from hash or storage
      var initialTab = null;
      if (useHash && window.location.hash) {
        initialTab = window.location.hash.replace('#', '');
      } else if (storageKey) {
        try {
          initialTab = localStorage.getItem(storageKey);
        } catch (e) {}
      }

      if (initialTab && container.querySelector('[data-tab="' + initialTab + '"], #tab-' + initialTab)) {
        this.switchTo(initialTab, container, { storageKey: storageKey, useHash: useHash });
      }

      // Handle browser back/forward
      if (useHash) {
        window.addEventListener('hashchange', function() {
          var hash = window.location.hash.replace('#', '');
          if (hash) {
            self.switchTo(hash, container, { storageKey: storageKey, useHash: false });
          }
        });
      }
    },

    /**
     * Zu einem Tab wechseln
     */
    switchTo: function(tabId, container, options) {
      container = container || document;
      options = options || {};

      // Update tab buttons
      var tabBtns = container.querySelectorAll('.tab-btn, .tabs-btn, .settings-tab, .alerts-tab');
      for (var i = 0; i < tabBtns.length; i++) {
        var btn = tabBtns[i];
        var btnTabId = btn.getAttribute('data-tab') || (btn.getAttribute('href') || '').replace('#', '').replace('?filter=', '');
        if (btnTabId === tabId) {
          btn.classList.add('active');
          btn.setAttribute('aria-selected', 'true');
        } else {
          btn.classList.remove('active');
          btn.setAttribute('aria-selected', 'false');
        }
      }

      // Update tab panes
      var tabPanes = container.querySelectorAll('.tab-content, .tab-pane, .settings-tab-pane');
      for (var j = 0; j < tabPanes.length; j++) {
        tabPanes[j].classList.remove('active');
      }

      var activePane = container.querySelector('#tab-' + tabId) ||
                       container.querySelector('[data-tab-content="' + tabId + '"]');
      if (activePane) {
        activePane.classList.add('active');
      }

      // Save state
      if (options.useHash !== false && window.history && window.history.replaceState) {
        window.history.replaceState(null, null, '#' + tabId);
      }
      if (options.storageKey) {
        try {
          localStorage.setItem(options.storageKey, tabId);
        } catch (e) {}
      }

      // Callback
      if (options.onSwitch) {
        options.onSwitch(tabId);
      }
    }
  };

  window.NP.Tabs = Tabs;

  // =====================================================
  // Node Actions - Einheitliche API fuer Node-Operationen
  // =====================================================

  var NodeActions = {
    resultEl: null,

    /**
     * Result Element setzen
     */
    setResultElement: function(el) {
      this.resultEl = typeof el === 'string' ? document.getElementById(el) : el;
    },

    /**
     * SSH Verbindung testen
     */
    testConnection: function(nodeId, btnEl) {
      var self = this;
      var resultEl = this.resultEl || document.getElementById('test-result');

      UI.showAlert(resultEl, 'info', 'Teste SSH Verbindung...');
      UI.setButtonLoading(btnEl, true);

      API.post('/api/nodes/' + nodeId + '/test', null, { timeout: 15000 })
        .then(function(data) {
          UI.setButtonLoading(btnEl, false);
          UI.showAlert(resultEl, 'success', 'Verbindung erfolgreich! Hostname: ' + data.hostname);
          if (typeof Toast !== 'undefined') Toast.success('SSH-Verbindung erfolgreich!');

          // Update status dots
          var dots = document.querySelectorAll('.status-dot');
          for (var i = 0; i < dots.length; i++) {
            dots[i].classList.remove('offline');
            dots[i].classList.add('online');
          }
        })
        .catch(function(err) {
          UI.setButtonLoading(btnEl, false);
          UI.showAlert(resultEl, 'error', 'Verbindung fehlgeschlagen: ' + err.message);
          if (typeof Toast !== 'undefined') Toast.error('SSH-Verbindung fehlgeschlagen');
        });
    },

    /**
     * Discovery ausfuehren
     */
    runDiscovery: function(nodeId, btnEl) {
      var resultEl = this.resultEl || document.getElementById('test-result');

      UI.showAlert(resultEl, 'info', 'Discovery laeuft... (kann 1-2 Minuten dauern)');
      UI.setButtonLoading(btnEl, true);
      UI.setButtonsLoading('.btn-discover-secondary', true);

      API.post('/api/nodes/' + nodeId + '/discover', null, { timeout: 180000 })
        .then(function(data) {
          UI.setButtonLoading(btnEl, false);
          UI.setButtonsLoading('.btn-discover-secondary', false);

          var msg = 'Discovery erfolgreich! Node-Typ: ' + (data.nodeType || 'Unbekannt');
          if (data.hardwareError) {
            msg += ' (Hardware-Warnung: ' + data.hardwareError + ')';
          }
          UI.showAlert(resultEl, 'success', msg + ' Seite wird neu geladen...');

          setTimeout(function() { window.location.reload(); }, 1500);
        })
        .catch(function(err) {
          UI.setButtonLoading(btnEl, false);
          UI.setButtonsLoading('.btn-discover-secondary', false);
          UI.showAlert(resultEl, 'error', 'Discovery fehlgeschlagen: ' + err.message);
        });
    },

    /**
     * Stats aktualisieren
     */
    refreshStats: function(nodeId, btnEl, onSuccess) {
      var resultEl = this.resultEl || document.getElementById('action-result');

      UI.setButtonLoading(btnEl, true);

      API.post('/api/nodes/' + nodeId + '/stats', null, { timeout: 60000 })
        .then(function(data) {
          UI.setButtonLoading(btnEl, false);
          if (onSuccess) {
            onSuccess(data);
          } else {
            window.location.reload();
          }
        })
        .catch(function(err) {
          UI.setButtonLoading(btnEl, false);
          UI.showAlert(resultEl, 'error', 'Stats-Aktualisierung fehlgeschlagen: ' + err.message);
        });
    }
  };

  window.NP.NodeActions = NodeActions;

  // Legacy-Funktionen global verfuegbar machen
  window.testConnection = function(nodeId) {
    var btn = document.getElementById('btn-test');
    NodeActions.setResultElement('test-result');
    NodeActions.testConnection(nodeId, btn);
  };

  window.runDiscovery = function(nodeId) {
    var btn = document.getElementById('btn-discover');
    NodeActions.setResultElement('test-result');
    NodeActions.runDiscovery(nodeId, btn);
  };

  // =====================================================
  // Docker Actions
  // =====================================================

  var DockerActions = {
    resultEl: null,

    setResultElement: function(el) {
      this.resultEl = typeof el === 'string' ? document.getElementById(el) : el;
    },

    refresh: function(nodeId, btnEl) {
      var resultEl = this.resultEl || document.getElementById('docker-result');

      UI.showAlert(resultEl, 'info', 'Docker-Daten werden geladen...');
      UI.setButtonLoading(btnEl, true);

      API.post('/api/nodes/' + nodeId + '/docker', null, { timeout: 120000 })
        .then(function(data) {
          UI.setButtonLoading(btnEl, false);
          UI.showAlert(resultEl, 'success', 'Docker-Daten aktualisiert. Seite wird neu geladen...');
          setTimeout(function() { window.location.reload(); }, 1000);
        })
        .catch(function(err) {
          UI.setButtonLoading(btnEl, false);
          UI.showAlert(resultEl, 'error', 'Docker-Fehler: ' + err.message);
        });
    },

    containerAction: function(nodeId, containerId, action, btnEl) {
      var resultEl = this.resultEl || document.getElementById('docker-result');

      UI.showAlert(resultEl, 'info', 'Container ' + action + '...');
      UI.setButtonLoading(btnEl, true);

      API.post('/api/nodes/' + nodeId + '/docker/containers/' + containerId + '/' + action, null, { timeout: 60000 })
        .then(function(data) {
          UI.setButtonLoading(btnEl, false);
          UI.showAlert(resultEl, 'success', 'Container ' + action + ' erfolgreich. Seite wird neu geladen...');
          if (typeof Toast !== 'undefined') Toast.success('Container ' + action + ' erfolgreich');
          setTimeout(function() { window.location.reload(); }, 1000);
        })
        .catch(function(err) {
          UI.setButtonLoading(btnEl, false);
          UI.showAlert(resultEl, 'error', action + ' fehlgeschlagen: ' + err.message);
        });
    },

    deleteContainer: function(nodeId, containerId, containerName) {
      if (!confirm('Container "' + containerName + '" wirklich loeschen?')) return;

      var resultEl = this.resultEl || document.getElementById('docker-result');
      UI.showAlert(resultEl, 'info', 'Container wird geloescht...');

      API.delete('/api/nodes/' + nodeId + '/docker/containers/' + containerId, { timeout: 30000 })
        .then(function() {
          UI.showAlert(resultEl, 'success', 'Container geloescht. Seite wird neu geladen...');
          setTimeout(function() { window.location.reload(); }, 1000);
        })
        .catch(function(err) {
          UI.showAlert(resultEl, 'error', 'Loeschen fehlgeschlagen: ' + err.message);
        });
    }
  };

  window.NP.DockerActions = DockerActions;

  // Legacy
  window.refreshDocker = function(nodeId) {
    DockerActions.setResultElement('docker-result');
    DockerActions.refresh(nodeId, document.getElementById('btn-refresh-docker'));
  };

  window.containerAction = function(nodeId, containerId, action) {
    DockerActions.setResultElement('docker-result');
    DockerActions.containerAction(nodeId, containerId, action, null);
  };

  // =====================================================
  // Proxmox Actions
  // =====================================================

  var ProxmoxActions = {
    resultEl: null,

    setResultElement: function(el) {
      this.resultEl = typeof el === 'string' ? document.getElementById(el) : el;
    },

    refresh: function(nodeId, btnEl) {
      var resultEl = this.resultEl || document.getElementById('proxmox-result');

      UI.showAlert(resultEl, 'info', 'Proxmox-Daten werden geladen...');
      UI.setButtonLoading(btnEl, true);

      API.post('/api/nodes/' + nodeId + '/proxmox', null, { timeout: 120000 })
        .then(function(data) {
          UI.setButtonLoading(btnEl, false);
          UI.showAlert(resultEl, 'success', 'Proxmox-Daten aktualisiert. Seite wird neu geladen...');
          setTimeout(function() { window.location.reload(); }, 1000);
        })
        .catch(function(err) {
          UI.setButtonLoading(btnEl, false);
          UI.showAlert(resultEl, 'error', 'Proxmox-Fehler: ' + err.message);
        });
    },

    vmAction: function(nodeId, vmid, action, btnEl) {
      var resultEl = this.resultEl || document.getElementById('proxmox-result');

      UI.showAlert(resultEl, 'info', 'VM ' + action + '...');
      UI.setButtonLoading(btnEl, true);

      API.post('/api/nodes/' + nodeId + '/proxmox/vms/' + vmid + '/' + action, null, { timeout: 120000 })
        .then(function(data) {
          UI.setButtonLoading(btnEl, false);
          UI.showAlert(resultEl, 'success', 'VM ' + action + ' erfolgreich. Seite wird neu geladen...');
          setTimeout(function() { window.location.reload(); }, 2000);
        })
        .catch(function(err) {
          UI.setButtonLoading(btnEl, false);
          UI.showAlert(resultEl, 'error', action + ' fehlgeschlagen: ' + err.message);
        });
    },

    ctAction: function(nodeId, ctid, action, btnEl) {
      var resultEl = this.resultEl || document.getElementById('proxmox-result');

      UI.showAlert(resultEl, 'info', 'CT ' + action + '...');
      UI.setButtonLoading(btnEl, true);

      API.post('/api/nodes/' + nodeId + '/proxmox/cts/' + ctid + '/' + action, null, { timeout: 120000 })
        .then(function(data) {
          UI.setButtonLoading(btnEl, false);
          UI.showAlert(resultEl, 'success', 'CT ' + action + ' erfolgreich. Seite wird neu geladen...');
          setTimeout(function() { window.location.reload(); }, 2000);
        })
        .catch(function(err) {
          UI.setButtonLoading(btnEl, false);
          UI.showAlert(resultEl, 'error', action + ' fehlgeschlagen: ' + err.message);
        });
    }
  };

  window.NP.ProxmoxActions = ProxmoxActions;

  // Legacy
  window.refreshProxmox = function(nodeId) {
    ProxmoxActions.setResultElement('proxmox-result');
    ProxmoxActions.refresh(nodeId, document.getElementById('btn-refresh-proxmox'));
  };

  window.vmAction = function(nodeId, vmid, action) {
    ProxmoxActions.setResultElement('proxmox-result');
    ProxmoxActions.vmAction(nodeId, vmid, action, null);
  };

  window.ctAction = function(nodeId, ctid, action) {
    ProxmoxActions.setResultElement('proxmox-result');
    ProxmoxActions.ctAction(nodeId, ctid, action, null);
  };

  // =====================================================
  // System/Network Tab Actions
  // =====================================================

  var SystemActions = {
    resultEl: null,

    setResultElement: function(el) {
      this.resultEl = typeof el === 'string' ? document.getElementById(el) : el;
    },

    refreshSystemInfo: function(nodeId, container, btnEl) {
      UI.showLoading(container, 'System-Informationen werden geladen...');
      UI.setButtonLoading(btnEl, true);

      API.get('/api/nodes/' + nodeId + '/system-info', { timeout: 120000 })
        .then(function(data) {
          UI.hideLoading(container);
          UI.setButtonLoading(btnEl, false);
          // Seite neu laden um Daten anzuzeigen
          window.location.reload();
        })
        .catch(function(err) {
          UI.hideLoading(container);
          UI.setButtonLoading(btnEl, false);
          if (typeof Toast !== 'undefined') Toast.error('Fehler: ' + err.message);
        });
    },

    refreshNetwork: function(nodeId, container, btnEl) {
      UI.showLoading(container, 'Netzwerk-Diagnose wird ausgefuehrt...');
      UI.setButtonLoading(btnEl, true);

      API.get('/api/nodes/' + nodeId + '/network', { timeout: 60000 })
        .then(function(data) {
          UI.hideLoading(container);
          UI.setButtonLoading(btnEl, false);
          window.location.reload();
        })
        .catch(function(err) {
          UI.hideLoading(container);
          UI.setButtonLoading(btnEl, false);
          if (typeof Toast !== 'undefined') Toast.error('Fehler: ' + err.message);
        });
    },

    runPing: function(nodeId, target, outputEl, btnEl) {
      UI.setButtonLoading(btnEl, true);
      if (outputEl) outputEl.textContent = 'Ping laeuft...';

      API.post('/api/nodes/' + nodeId + '/network/ping', { target: target }, { timeout: 30000 })
        .then(function(data) {
          UI.setButtonLoading(btnEl, false);
          if (outputEl) {
            outputEl.textContent = data.raw || JSON.stringify(data, null, 2);
          }
        })
        .catch(function(err) {
          UI.setButtonLoading(btnEl, false);
          if (outputEl) outputEl.textContent = 'Fehler: ' + err.message;
        });
    },

    runDnsLookup: function(nodeId, hostname, outputEl, btnEl) {
      UI.setButtonLoading(btnEl, true);
      if (outputEl) outputEl.textContent = 'DNS Lookup laeuft...';

      API.post('/api/nodes/' + nodeId + '/network/dns', { hostname: hostname }, { timeout: 15000 })
        .then(function(data) {
          UI.setButtonLoading(btnEl, false);
          if (outputEl) {
            outputEl.textContent = data.raw || JSON.stringify(data, null, 2);
          }
        })
        .catch(function(err) {
          UI.setButtonLoading(btnEl, false);
          if (outputEl) outputEl.textContent = 'Fehler: ' + err.message;
        });
    },

    runTraceroute: function(nodeId, target, outputEl, btnEl) {
      UI.setButtonLoading(btnEl, true);
      if (outputEl) outputEl.textContent = 'Traceroute laeuft... (kann bis zu 60s dauern)';

      API.post('/api/nodes/' + nodeId + '/network/traceroute', { target: target }, { timeout: 90000 })
        .then(function(data) {
          UI.setButtonLoading(btnEl, false);
          if (outputEl) {
            outputEl.textContent = data.raw || JSON.stringify(data, null, 2);
          }
        })
        .catch(function(err) {
          UI.setButtonLoading(btnEl, false);
          if (outputEl) outputEl.textContent = 'Fehler: ' + err.message;
        });
    }
  };

  window.NP.SystemActions = SystemActions;

  // =====================================================
  // Filter & Search Helpers
  // =====================================================

  var Filters = {
    /**
     * Tabellen-Filter initialisieren
     */
    initTableFilter: function(options) {
      var searchInput = document.getElementById(options.searchId);
      var table = document.getElementById(options.tableId);
      var countEl = options.countId ? document.getElementById(options.countId) : null;
      var filterBtns = options.filterBtnSelector ? document.querySelectorAll(options.filterBtnSelector) : [];

      if (!searchInput || !table) return;

      var currentFilter = 'all';

      function applyFilters() {
        var searchTerm = searchInput.value.toLowerCase();
        var rows = table.querySelectorAll('tbody tr, .list-row');
        var visibleCount = 0;
        var totalCount = rows.length;

        for (var i = 0; i < rows.length; i++) {
          var row = rows[i];
          var textContent = row.textContent.toLowerCase();
          var rowFilter = row.getAttribute('data-filter') || 'all';

          var matchesSearch = textContent.indexOf(searchTerm) > -1;
          var matchesFilter = currentFilter === 'all' || rowFilter === currentFilter;

          if (matchesSearch && matchesFilter) {
            row.style.display = '';
            visibleCount++;
          } else {
            row.style.display = 'none';
          }
        }

        if (countEl) {
          countEl.textContent = visibleCount + '/' + totalCount;
        }
      }

      searchInput.addEventListener('input', applyFilters);
      searchInput.addEventListener('keyup', applyFilters);

      // Filter Buttons
      for (var i = 0; i < filterBtns.length; i++) {
        filterBtns[i].addEventListener('click', function() {
          currentFilter = this.getAttribute('data-filter') || 'all';

          // Update active state
          for (var j = 0; j < filterBtns.length; j++) {
            filterBtns[j].classList.remove('active');
          }
          this.classList.add('active');

          applyFilters();
        });
      }
    }
  };

  window.NP.Filters = Filters;

  // =====================================================
  // Side Panel & Theme (bestehende Funktionen)
  // =====================================================

  function setupPanelToggle() {
    var panelToggle = document.getElementById('panelToggle');
    var sidePanel = document.getElementById('sidePanel');

    if (!panelToggle || !sidePanel) return;

    // Terminal panel positioning helper - uses CSS class for smooth animation
    function updateTerminalPosition() {
      var terminalPanel = document.querySelector('.terminal-panel');
      if (!terminalPanel) return;

      var isCollapsed = sidePanel.classList.contains('collapsed') || window.innerWidth < 768;
      if (isCollapsed) {
        terminalPanel.classList.add('sidepanel-collapsed');
      } else {
        terminalPanel.classList.remove('sidepanel-collapsed');
      }
    }

    var panelState = localStorage.getItem('nodepulse-panel');
    if (panelState === 'collapsed') {
      sidePanel.classList.add('collapsed');
    }

    // Initialize terminal position on page load
    updateTerminalPosition();

    panelToggle.addEventListener('click', function() {
      if (window.innerWidth < 768) {
        sidePanel.classList.remove('collapsed');
        sidePanel.classList.toggle('mobile-open');
      } else {
        sidePanel.classList.remove('mobile-open');
        sidePanel.classList.toggle('collapsed');

        if (sidePanel.classList.contains('collapsed')) {
          localStorage.setItem('nodepulse-panel', 'collapsed');
        } else {
          localStorage.setItem('nodepulse-panel', 'open');
        }

        // Update terminal position after toggle with RAF for smooth animation
        requestAnimationFrame(updateTerminalPosition);
      }
    });

    document.addEventListener('click', function(e) {
      if (window.innerWidth < 768 && sidePanel.classList.contains('mobile-open')) {
        if (!sidePanel.contains(e.target) && !panelToggle.contains(e.target)) {
          sidePanel.classList.remove('mobile-open');
        }
      }
    });

    // Update terminal position on window resize
    window.addEventListener('resize', updateTerminalPosition);
  }

  function setupThemeToggle() {
    var themeToggle = document.getElementById('themeToggle');
    if (!themeToggle) return;

    themeToggle.addEventListener('click', function() {
      document.documentElement.classList.toggle('light-mode');

      if (document.documentElement.classList.contains('light-mode')) {
        localStorage.setItem('nodepulse-theme', 'light');
      } else {
        localStorage.setItem('nodepulse-theme', 'dark');
      }
    });
  }

  function setupCollapsibleSections() {
    var sectionHeaders = document.querySelectorAll('.side-panel-section-header');
    for (var i = 0; i < sectionHeaders.length; i++) {
      sectionHeaders[i].addEventListener('click', function() {
        var section = this.parentElement;
        section.classList.toggle('collapsed');
      });
    }
  }

  function setupDeleteConfirmation() {
    var deleteForm = document.getElementById('delete-form');
    if (deleteForm) {
      deleteForm.addEventListener('submit', function(e) {
        if (!confirm('Wirklich loeschen? Diese Aktion kann nicht rueckgaengig gemacht werden.')) {
          e.preventDefault();
        }
      });
    }
  }

  // =====================================================
  // Alert Badge
  // =====================================================

  function updateAlertBadge() {
    var badge = document.getElementById('headerAlertCount');
    if (!badge) return;

    API.get('/api/alerts/count')
      .then(function(counts) {
        if (counts.total > 0) {
          badge.textContent = counts.total > 99 ? '99+' : counts.total;
          badge.style.display = 'block';
          badge.className = 'alert-badge';
          if (counts.critical > 0) {
            badge.classList.add('has-critical');
          } else if (counts.warning > 0) {
            badge.classList.add('warning-only');
          }
        } else {
          badge.style.display = 'none';
        }
      })
      .catch(function() {
        // Ignore errors
      });
  }

  window.updateAlertBadge = updateAlertBadge;

  // =====================================================
  // Initialize
  // =====================================================

  function init() {
    setupPanelToggle();
    setupThemeToggle();
    setupCollapsibleSections();
    setupDeleteConfirmation();

    // Alert Badge
    updateAlertBadge();
    setInterval(updateAlertBadge, 60000);

    // Auto-init tabs if .tabs container exists
    var tabContainer = document.querySelector('.tabs');
    if (tabContainer) {
      Tabs.init({ useHash: true });
    }

    // Auto-init settings tabs
    var settingsTabContainer = document.querySelector('.settings-tabs');
    if (settingsTabContainer) {
      Tabs.init({ storageKey: 'settings-active-tab', useHash: false });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ==========================================
  // Globale Keyboard-Shortcuts
  // ==========================================

  // Helper: Prüfen ob aktives Element ein Input ist
  function isInputElement(element) {
    var tagName = element.tagName.toLowerCase();
    return tagName === 'input' || tagName === 'textarea' || tagName === 'select' || element.isContentEditable;
  }

  // Such-Input fokussieren mit "/" (wie GitHub)
  document.addEventListener('keydown', function(e) {
    if (e.key === '/' && !isInputElement(e.target)) {
      e.preventDefault();
      var searchInput = document.getElementById('nodeSearchInput');
      if (searchInput) {
        searchInput.focus();
        searchInput.select();
      }
    }
  });

})();
