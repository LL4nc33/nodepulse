// Toggle collapsible section (ES5)
function toggleSection(headerEl) {
  var section = headerEl.parentElement;
  var content = section.querySelector('.section-content');

  if (section.classList.contains('collapsed')) {
    section.classList.remove('collapsed');
    content.style.display = 'block';
  } else {
    section.classList.add('collapsed');
    content.style.display = 'none';
  }
}

// formatBytes is available as window.NP.UI.formatBytes from main.js

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

// Terminal Functions
// =====================================================

var activeCommandXHR = null;

function setCommand(cmd) {
  var input = document.getElementById('command-input');
  if (input) {
    input.value = cmd;
    input.focus();
  }
}

function clearOutput() {
  var output = document.getElementById('terminal-output');
  if (output) {
    output.textContent = 'Noch kein Befehl ausgefuehrt.';
    output.className = 'terminal-output';
  }
}

function executeCommand(event, nodeId) {
  event.preventDefault();

  var input = document.getElementById('command-input');
  var output = document.getElementById('terminal-output');
  var btnEl = document.getElementById('btn-execute');
  var command = input ? input.value.trim() : '';

  if (!command) {
    if (output) {
      output.textContent = 'Bitte einen Befehl eingeben.';
      output.className = 'terminal-output error';
    }
    return;
  }

  // Abort previous request if still running
  if (activeCommandXHR) {
    activeCommandXHR.abort();
  }

  if (output) {
    output.textContent = 'Fuehre aus: ' + command + '\n\nBitte warten...';
    output.className = 'terminal-output loading';
  }

  if (btnEl) {
    btnEl.classList.add('loading');
    btnEl.disabled = true;
  }

  var xhr = new XMLHttpRequest();
  activeCommandXHR = xhr;
  xhr.open('POST', '/api/nodes/' + nodeId + '/commands', true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.timeout = 125000; // 125s (backend 120s + 5s network buffer)

  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      activeCommandXHR = null;

      if (btnEl) {
        btnEl.classList.remove('loading');
        btnEl.disabled = false;
      }

      var response;
      try {
        response = JSON.parse(xhr.responseText);
      } catch (e) {
        response = { success: false, error: { message: 'Ungueltige Antwort vom Server' } };
      }

      if (output) {
        var outputText = '$ ' + command + '\n\n';

        if (response.data) {
          var data = response.data;

          if (data.output) {
            outputText += data.output;
          }

          if (data.error && data.error.trim()) {
            if (data.output) outputText += '\n';
            outputText += '[STDERR]\n' + data.error;
          }

          if (!data.output && !data.error) {
            outputText += '(Keine Ausgabe)';
          }

          outputText += '\n\n[Exit Code: ' + data.exit_code + '] [Status: ' + data.status + ']';

          output.textContent = outputText;
          output.className = 'terminal-output ' + (data.status === 'success' ? 'success' : 'error');
        } else if (response.error) {
          outputText += 'Fehler: ' + response.error.message;
          output.textContent = outputText;
          output.className = 'terminal-output error';
        }
      }

      // Refresh history
      loadCommandHistory(nodeId);
    }
  };

  xhr.onerror = function() {
    activeCommandXHR = null;
    if (btnEl) {
      btnEl.classList.remove('loading');
      btnEl.disabled = false;
    }
    if (output) {
      output.textContent = '$ ' + command + '\n\nNetzwerkfehler - Verbindung fehlgeschlagen.';
      output.className = 'terminal-output error';
    }
  };

  xhr.ontimeout = function() {
    activeCommandXHR = null;
    if (btnEl) {
      btnEl.classList.remove('loading');
      btnEl.disabled = false;
    }
    if (output) {
      output.textContent = '$ ' + command + '\n\nTimeout - Der Befehl hat zu lange gedauert (> 2 Minuten).';
      output.className = 'terminal-output error';
    }
  };

  xhr.send(JSON.stringify({ command: command }));
}

function loadCommandHistory(nodeId) {
  var historyEl = document.getElementById('command-history');
  if (!historyEl) return;

  var xhr = new XMLHttpRequest();
  xhr.open('GET', '/api/nodes/' + nodeId + '/commands/history?limit=10', true);
  xhr.timeout = 10000;

  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      var response;
      try {
        response = JSON.parse(xhr.responseText);
      } catch (e) {
        response = { success: false };
      }

      if (response.success && response.data && response.data.length > 0) {
        var html = '';
        for (var i = 0; i < response.data.length; i++) {
          var item = response.data[i];
          var date = new Date(item.executed_at);
          var dateStr = date.toLocaleString('de-DE', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
          });

          html += '<div class="history-item" tabindex="0" onclick="setCommand(\'' + escapeForJsString(item.full_command) + '\')" onkeypress="if(event.key===\'Enter\')setCommand(\'' + escapeForJsString(item.full_command) + '\')">';
          html += '<code class="history-command">' + escapeHtml(item.full_command) + '</code>';
          html += '<span class="history-time">' + dateStr + '</span>';
          html += '</div>';
        }
        historyEl.innerHTML = html;
      } else {
        historyEl.innerHTML = '<p class="empty">Keine Befehle in der Historie.</p>';
      }
    }
  };

  xhr.onerror = function() {
    historyEl.innerHTML = '<p class="empty">Fehler beim Laden der Historie.</p>';
  };

  xhr.send();
}

function escapeHtml(text) {
  var div = document.createElement('div');
  div.appendChild(document.createTextNode(text));
  return div.innerHTML;
}

// Escape text for use inside JavaScript single-quoted string
function escapeForJsString(text) {
  if (!text) return '';
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/</g, '\\x3c')
    .replace(/>/g, '\\x3e');
}

// Load command history when terminal tab is opened
var terminalTabBtn = document.querySelector('[data-tab="terminal"]');
if (terminalTabBtn && !terminalTabBtn.hasAttribute('data-history-listener')) {
  terminalTabBtn.addEventListener('click', function() {
    loadCommandHistory(nodeId);
  });
  terminalTabBtn.setAttribute('data-history-listener', 'true');
}

// =====================================================