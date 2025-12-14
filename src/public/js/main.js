/* nodepulse - Main JavaScript v0.1.1
   ES5 compatible for Fire HD 10 2017
*/

(function() {
  'use strict';

  // =====================================================
  // Helper Functions
  // =====================================================

  function ajax(method, url, data, callback, timeout) {
    var xhr = new XMLHttpRequest();
    var timeoutId = null;

    xhr.open(method, url, true);
    xhr.setRequestHeader('Content-Type', 'application/json');

    // Set timeout (default 30s)
    timeout = timeout || 30000;
    timeoutId = setTimeout(function() {
      xhr.abort();
      callback({ code: 'TIMEOUT', message: 'Anfrage Timeout' }, null);
    }, timeout);

    xhr.onreadystatechange = function() {
      if (xhr.readyState === 4) {
        clearTimeout(timeoutId);

        var response;
        try {
          response = JSON.parse(xhr.responseText);
        } catch (e) {
          response = { success: false, error: { code: 'PARSE_ERROR', message: 'Ungueltige Antwort' } };
        }

        if (xhr.status >= 200 && xhr.status < 300) {
          callback(null, response);
        } else {
          var error = response.error || { code: 'ERROR', message: 'Anfrage fehlgeschlagen' };
          callback(error, response);
        }
      }
    };

    xhr.onerror = function() {
      clearTimeout(timeoutId);
      callback({ code: 'NETWORK_ERROR', message: 'Netzwerkfehler' }, null);
    };

    if (data) {
      xhr.send(JSON.stringify(data));
    } else {
      xhr.send();
    }
  }

  function showAlert(element, type, message) {
    element.className = 'alert alert-' + type;
    element.textContent = message;
    element.style.display = 'block';
    element.setAttribute('role', 'alert');

    // Scroll into view
    element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function hideAlert(element) {
    element.style.display = 'none';
  }

  function setButtonLoading(btn, loading) {
    if (loading) {
      btn.classList.add('loading');
      btn.disabled = true;
    } else {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  }

  // =====================================================
  // SSH Connection Test
  // =====================================================

  window.testConnection = function(nodeId) {
    var resultEl = document.getElementById('test-result');
    var btnEl = document.getElementById('btn-test');

    if (!resultEl) return;

    // Show loading state
    showAlert(resultEl, 'info', 'Teste SSH Verbindung...');
    if (btnEl) setButtonLoading(btnEl, true);

    ajax('POST', '/api/nodes/' + nodeId + '/test', null, function(err, response) {
      if (btnEl) setButtonLoading(btnEl, false);

      if (err) {
        showAlert(resultEl, 'error', 'Verbindung fehlgeschlagen: ' + err.message);
        return;
      }

      if (response.success && response.data) {
        showAlert(resultEl, 'success', 'Verbindung erfolgreich! Hostname: ' + response.data.hostname);

        // Update status dots on page
        var statusDots = document.querySelectorAll('.status-dot');
        for (var i = 0; i < statusDots.length; i++) {
          statusDots[i].classList.remove('offline');
          statusDots[i].classList.add('online');
        }
      } else {
        showAlert(resultEl, 'error', 'Verbindung fehlgeschlagen');
      }
    }, 15000); // 15s timeout for SSH test
  };

  // =====================================================
  // Delete Confirmation
  // =====================================================

  function setupDeleteConfirmation() {
    var deleteForm = document.getElementById('delete-form');

    if (deleteForm) {
      deleteForm.addEventListener('submit', function(e) {
        var confirmed = confirm('Node wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.');
        if (!confirmed) {
          e.preventDefault();
        }
      });
    }
  }

  // =====================================================
  // Auto-refresh for monitoring pages (future)
  // =====================================================

  function setupAutoRefresh() {
    var refreshEl = document.querySelector('[data-auto-refresh]');

    if (refreshEl) {
      var interval = parseInt(refreshEl.getAttribute('data-auto-refresh'), 10) || 30;
      var refreshTimer = null;

      // Only refresh when page is visible
      function startRefresh() {
        if (refreshTimer) return;
        refreshTimer = setInterval(function() {
          if (!document.hidden) {
            window.location.reload();
          }
        }, interval * 1000);
      }

      function stopRefresh() {
        if (refreshTimer) {
          clearInterval(refreshTimer);
          refreshTimer = null;
        }
      }

      document.addEventListener('visibilitychange', function() {
        if (document.hidden) {
          stopRefresh();
        } else {
          startRefresh();
        }
      });

      startRefresh();
    }
  }

  // =====================================================
  // Form validation enhancement
  // =====================================================

  function setupFormValidation() {
    var forms = document.querySelectorAll('.form');

    for (var i = 0; i < forms.length; i++) {
      forms[i].addEventListener('submit', function(e) {
        var form = e.target;
        var required = form.querySelectorAll('[required]');
        var valid = true;

        for (var j = 0; j < required.length; j++) {
          var input = required[j];
          if (!input.value || !input.value.trim()) {
            input.focus();
            valid = false;
            break;
          }
        }

        if (!valid) {
          e.preventDefault();
        }
      });
    }
  }

  // =====================================================
  // Initialize
  // =====================================================

  function init() {
    setupDeleteConfirmation();
    setupAutoRefresh();
    setupFormValidation();
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
