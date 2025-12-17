// ==================================================
// PHASE 3-9: Multi-Tab Terminal Implementation
// PowerShell 7-Style Terminal with Bash Prompt
// ==================================================

// ==================================================
// Phase 3: Tab Rendering & Switching
// ==================================================

/**
 * Render all tabs in the tab bar
 */
function renderTabs() {
  var tabManager = window.NP && window.NP.TerminalTabs;
  if (!tabManager) {
    console.error('TerminalTabManager not available');
    return;
  }

  var tabBar = document.getElementById('terminalTabBar');
  if (!tabBar) return;

  var html = '';

  // Render each tab
  for (var i = 0; i < tabManager.tabs.length; i++) {
    var tab = tabManager.tabs[i];
    var isActive = tab.id === tabManager.activeTabId;

    html += '<div class="terminal-tab' + (isActive ? ' active' : '') + '" ';
    html += 'data-tab-id="' + tab.id + '" ';
    html += 'onclick="switchToTab(\'' + tab.id + '\')">';
    html += '<span class="tab-icon">›_</span>';
    html += '<span class="tab-title" ondblclick="startTabRename(event, \'' + tab.id + '\')">';
    html += escapeHtml(tab.title);
    html += '</span>';

    // Close button (only show if more than 1 tab)
    if (tabManager.tabs.length > 1) {
      html += '<button class="tab-close-btn" onclick="closeTab(\'' + tab.id + '\', event)" title="Tab schliessen">&times;</button>';
    }

    html += '</div>';
  }

  // New tab button
  html += '<button class="terminal-tab-new" onclick="createNewTab()" title="Neuer Tab (Ctrl+T)">';
  html += '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">';
  html += '<line x1="12" y1="5" x2="12" y2="19"/>';
  html += '<line x1="5" y1="12" x2="19" y2="12"/>';
  html += '</svg>';
  html += '</button>';

  tabBar.innerHTML = html;
}

/**
 * Switch to a specific tab
 * @param {string} tabId - ID of the tab to switch to
 */
function switchToTab(tabId) {
  var tabManager = window.NP && window.NP.TerminalTabs;
  if (!tabManager) return;

  var previousTab = tabManager.getActiveTab();

  // Save current tab output before switching
  if (previousTab) {
    var currentOutput = document.getElementById('terminal-output');
    if (currentOutput) {
      previousTab.output = currentOutput.textContent;
    }
    tabManager.updateTab(previousTab.id, previousTab);
  }

  // Switch to new tab
  var success = tabManager.switchTab(tabId);
  if (!success) return;

  var newTab = tabManager.getActiveTab();
  if (!newTab) return;

  // Update UI
  renderTabs();

  // Restore output
  var outputEl = document.getElementById('terminal-output');
  if (outputEl) {
    outputEl.textContent = newTab.output || 'Bereit. Befehl eingeben und Enter druecken.';
    outputEl.className = 'terminal-output';
  }

  // Update prompt display
  updatePromptDisplay(newTab.prompt);

  // Clear and focus input
  var input = document.getElementById('command-input');
  if (input) {
    input.value = '';
    input.focus();
  }
}

/**
 * Update the bash-style prompt display
 * @param {Object} promptData - Object with username, hostname, path
 */
function updatePromptDisplay(promptData) {
  var promptEl = document.getElementById('terminalPromptDisplay');
  if (!promptEl || !promptData) return;

  var html = '';
  html += '<span class="prompt-user">' + escapeHtml(promptData.username || 'root') + '</span>';
  html += '<span class="prompt-separator">@</span>';
  html += '<span class="prompt-host">' + escapeHtml(promptData.hostname || 'server') + '</span>';
  html += '<span class="prompt-separator">:</span>';
  html += '<span class="prompt-path">' + escapeHtml(promptData.path || '~') + '</span>';
  html += '<span class="prompt-symbol">$</span>';

  promptEl.innerHTML = html;
}

/**
 * Escape HTML to prevent XSS
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  var div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ==================================================
// Phase 4: Tab Management (Create, Close, Rename)
// ==================================================

/**
 * Create a new terminal tab
 */
function createNewTab() {
  var tabManager = window.NP && window.NP.TerminalTabs;
  if (!tabManager) return;

  var newTab = tabManager.createTab();

  // Initialize prompt with actual node data
  if (typeof nodeData !== 'undefined') {
    newTab.prompt = {
      username: nodeData.sshUser || 'root',
      hostname: nodeData.name || 'server',
      path: '~'
    };
    newTab.workingDir = '~';
    tabManager.updateTab(newTab.id, newTab);
  }

  // Switch to new tab
  tabManager.switchTab(newTab.id);
  renderTabs();
  switchToTab(newTab.id);

  // Focus input
  var input = document.getElementById('command-input');
  if (input) {
    input.focus();
  }
}

/**
 * Close a terminal tab
 * @param {string} tabId - ID of tab to close
 * @param {Event} event - Click event
 */
function closeTab(tabId, event) {
  if (event) {
    event.stopPropagation();
  }

  var tabManager = window.NP && window.NP.TerminalTabs;
  if (!tabManager) return;

  // Prevent closing last tab
  if (tabManager.tabs.length === 1) {
    if (window.NP && window.NP.Toast) {
      window.NP.Toast.show('Letztes Terminal-Tab kann nicht geschlossen werden.', 'warning');
    } else {
      alert('Letztes Terminal-Tab kann nicht geschlossen werden.');
    }
    return;
  }

  var tab = tabManager.getTabById(tabId);
  if (!tab) return;

  // If closing active tab, switch to another tab first
  if (tabId === tabManager.activeTabId) {
    var currentIndex = -1;
    for (var i = 0; i < tabManager.tabs.length; i++) {
      if (tabManager.tabs[i].id === tabId) {
        currentIndex = i;
        break;
      }
    }

    // Switch to next tab, or previous if this is the last tab
    var nextTab = tabManager.tabs[currentIndex + 1] || tabManager.tabs[currentIndex - 1];
    if (nextTab) {
      tabManager.switchTab(nextTab.id);
    }
  }

  // Remove tab
  tabManager.removeTab(tabId);
  renderTabs();

  // Update display
  if (tabManager.activeTabId) {
    switchToTab(tabManager.activeTabId);
  }
}

/**
 * Start tab rename (double-click on tab title)
 * @param {Event} event - Click event
 * @param {string} tabId - ID of tab to rename
 */
function startTabRename(event, tabId) {
  if (event) {
    event.stopPropagation();
  }

  var tabManager = window.NP && window.NP.TerminalTabs;
  if (!tabManager) return;

  var tab = tabManager.getTabById(tabId);
  if (!tab) return;

  var newTitle = prompt('Tab umbenennen:', tab.title);
  if (newTitle && newTitle.trim()) {
    tab.title = newTitle.trim();
    tabManager.updateTab(tabId, tab);
    renderTabs();
  }
}

// ==================================================
// Phase 5: Keyboard Shortcuts
// ==================================================

/**
 * Global keyboard shortcut handler for terminal tabs
 */
document.addEventListener('keydown', function(e) {
  // Only handle shortcuts when terminal panel exists
  var terminalPanel = document.getElementById('terminalPanel');
  if (!terminalPanel) return;

  var tabManager = window.NP && window.NP.TerminalTabs;
  if (!tabManager) return;

  // Ctrl+T: New Tab
  if (e.ctrlKey && e.key === 't') {
    e.preventDefault();
    createNewTab();
    return;
  }

  // Ctrl+W: Close Tab
  if (e.ctrlKey && e.key === 'w') {
    e.preventDefault();
    var activeTab = tabManager.getActiveTab();
    if (activeTab) {
      closeTab(activeTab.id, e);
    }
    return;
  }

  // Ctrl+Tab: Next Tab
  if (e.ctrlKey && e.key === 'Tab' && !e.shiftKey) {
    e.preventDefault();
    var currentIndex = -1;
    for (var i = 0; i < tabManager.tabs.length; i++) {
      if (tabManager.tabs[i].id === tabManager.activeTabId) {
        currentIndex = i;
        break;
      }
    }
    var nextIndex = (currentIndex + 1) % tabManager.tabs.length;
    if (tabManager.tabs[nextIndex]) {
      switchToTab(tabManager.tabs[nextIndex].id);
    }
    return;
  }

  // Ctrl+Shift+Tab: Previous Tab
  if (e.ctrlKey && e.key === 'Tab' && e.shiftKey) {
    e.preventDefault();
    var currentIndex = -1;
    for (var i = 0; i < tabManager.tabs.length; i++) {
      if (tabManager.tabs[i].id === tabManager.activeTabId) {
        currentIndex = i;
        break;
      }
    }
    var prevIndex = (currentIndex - 1 + tabManager.tabs.length) % tabManager.tabs.length;
    if (tabManager.tabs[prevIndex]) {
      switchToTab(tabManager.tabs[prevIndex].id);
    }
    return;
  }

  // Ctrl+1-9: Jump to Tab N
  if (e.ctrlKey && e.key >= '1' && e.key <= '9') {
    e.preventDefault();
    var index = parseInt(e.key, 10) - 1;
    if (tabManager.tabs[index]) {
      switchToTab(tabManager.tabs[index].id);
    }
    return;
  }
});

// ==================================================
// Phase 6: Initialization & Migration
// ==================================================

/**
 * Initialize terminal tab system
 */
function initializeTerminalTabs() {
  // Check if we're on a node detail page
  if (typeof nodeId === 'undefined') {
    return;
  }

  // Ensure TerminalTabManager is loaded
  if (!window.NP || !window.NP.TerminalTabs) {
    console.error('TerminalTabManager not loaded! Ensure terminal-tabs.js is included.');
    return;
  }

  // Initialize tab manager with node ID
  window.NP.TerminalTabs.init(nodeId);

  // Migrate old single-terminal state if exists
  migrateOldTerminalState(nodeId);

  // Ensure active tab has correct prompt with actual node data
  var activeTab = window.NP.TerminalTabs.getActiveTab();
  if (activeTab && typeof nodeData !== 'undefined') {
    if (!activeTab.prompt || !activeTab.prompt.hostname) {
      activeTab.prompt = activeTab.prompt || {};
      activeTab.prompt.username = nodeData.sshUser || 'root';
      activeTab.prompt.hostname = nodeData.name || 'server';
      activeTab.prompt.path = activeTab.prompt.path || activeTab.workingDir || '~';
      window.NP.TerminalTabs.updateTab(activeTab.id, activeTab);
    }
  }

  // Render tabs
  renderTabs();

  // Switch to active tab (restores state)
  if (activeTab) {
    switchToTab(activeTab.id);
  }

  // Restore terminal theme
  restoreTerminalTheme();
}

/**
 * Migrate old single-terminal state to multi-tab format
 * @param {number} nodeId - Node ID
 */
function migrateOldTerminalState(nodeId) {
  var oldKey = 'nodepulse-terminal-state-' + nodeId;
  var oldState = null;

  try {
    var stored = localStorage.getItem(oldKey);
    if (stored) {
      oldState = JSON.parse(stored);
    }
  } catch(e) {
    // Ignore parse errors
  }

  var tabManager = window.NP.TerminalTabs;

  // Only migrate if old state exists and no tabs exist yet
  if (oldState && tabManager.tabs.length === 0) {
    var firstTab = tabManager.createTab('Terminal 1');

    // Restore old output
    if (oldState.lastOutput) {
      firstTab.output = oldState.lastOutput;
    }

    // Set prompt
    firstTab.prompt = {
      username: 'root',
      hostname: (typeof nodeData !== 'undefined' && nodeData.name) || 'server',
      path: '~'
    };

    firstTab.workingDir = '~';

    tabManager.updateTab(firstTab.id, firstTab);
    tabManager.activeTabId = firstTab.id;
    tabManager.save();

    // Remove old key
    try {
      localStorage.removeItem(oldKey);
    } catch(e) {
      // Ignore
    }
  }
}

// ==================================================
// Phase 7: Working Directory Tracking
// ==================================================

/**
 * Update working directory locally after cd command
 * @param {Object} tab - Tab object
 * @param {string} newPath - New path from cd command
 */
function updateWorkingDirLocally(tab, newPath) {
  if (!window.NP || !window.NP.TerminalHelpers) {
    console.error('TerminalHelpers not available');
    return;
  }

  var helpers = window.NP.TerminalHelpers;
  var resolvedPath = helpers.resolveCdPath(tab.workingDir, newPath);

  tab.workingDir = resolvedPath;
  tab.prompt.path = resolvedPath;

  window.NP.TerminalTabs.updateTab(tab.id, tab);
}

// ==================================================
// Phase 8: Enhanced executeCommand with Tab-Awareness
// ==================================================

/**
 * Enhanced executeCommand with multi-tab and working directory tracking
 * @param {Event} event - Form submit event
 * @param {number} nodeId - Node ID
 */
window.executeCommand = function(event, nodeId) {
  event.preventDefault();

  var tabManager = window.NP && window.NP.TerminalTabs;
  var activeTab = tabManager ? tabManager.getActiveTab() : null;

  var input = document.getElementById('command-input');
  var output = document.getElementById('terminal-output');
  var btn = document.getElementById('btn-execute');

  var command = input ? input.value.trim() : '';

  if (!command) {
    if (output) {
      output.textContent = 'Bitte einen Befehl eingeben.';
      output.className = 'terminal-output error';
    }
    return;
  }

  // Add to tab's command history
  if (activeTab) {
    if (!activeTab.commandHistory) {
      activeTab.commandHistory = [];
    }
    activeTab.commandHistory.push(command);
    tabManager.updateTab(activeTab.id, activeTab);
  }

  // Working Directory Tracking: Parse cd commands BEFORE sending
  var cdMatch = command.match(/^cd\s+(.*)$/);
  if (cdMatch && activeTab) {
    var newPath = cdMatch[1].trim() || '~';
    updateWorkingDirLocally(activeTab, newPath);
  }

  // Show loading state
  if (btn) {
    btn.classList.add('loading');
    btn.disabled = true;
  }

  if (output) {
    output.textContent = 'Ausfuehrung...';
    output.className = 'terminal-output';
  }

  // Execute command via API
  var xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/nodes/' + nodeId + '/commands', true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.timeout = 125000; // 125s (backend 120s + 5s network buffer)

  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      if (btn) {
        btn.classList.remove('loading');
        btn.disabled = false;
      }

      var response;
      try {
        response = JSON.parse(xhr.responseText);
      } catch(e) {
        if (output) {
          output.textContent = 'Fehler beim Parsen der Antwort.';
          output.className = 'terminal-output error';
        }
        return;
      }

      if (response.success && response.data) {
        var data = response.data;
        var outputText = '';

        if (data.output) {
          outputText += data.output;
        }

        if (data.error && data.error.trim()) {
          if (data.output) outputText += '\n';
          outputText += '[STDERR]\n' + data.error;
        }

        if (!data.output && !data.error) {
          outputText = '(Keine Ausgabe)';
        }

        if (output) {
          output.textContent = outputText;
          output.className = 'terminal-output ' + (data.status === 'success' ? 'success' : 'error');
        }
      } else if (response.error) {
        if (output) {
          output.textContent = 'Fehler: ' + (response.error.message || 'Unbekannter Fehler');
          output.className = 'terminal-output error';
        }
      }

      // Update tab state
      if (activeTab && tabManager) {
        var currentActiveTab = tabManager.getActiveTab();
        if (currentActiveTab && currentActiveTab.id === activeTab.id && output) {
          currentActiveTab.output = output.textContent;
          tabManager.updateTab(currentActiveTab.id, currentActiveTab);

          // Update prompt display if cd command
          if (cdMatch) {
            updatePromptDisplay(currentActiveTab.prompt);
          }
        }
      }

      // Clear input
      if (input) {
        input.value = '';
        input.focus();
      }
    }
  };

  xhr.onerror = function() {
    if (btn) {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
    if (output) {
      output.textContent = 'Netzwerkfehler beim Ausfuehren des Befehls.';
      output.className = 'terminal-output error';
    }
  };

  xhr.ontimeout = function() {
    if (btn) {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
    if (output) {
      output.textContent = 'Timeout: Befehl dauert zu lange (> 2 Minuten).';
      output.className = 'terminal-output error';
    }
  };

  xhr.send(JSON.stringify({ command: command }));
};

// ==================================================
// Phase 9: Theme Toggle (Light/Dark Mode)
// ==================================================

/**
 * Toggle terminal theme between light and dark mode
 */
function toggleTerminalTheme() {
  var panel = document.getElementById('terminalPanel');
  if (!panel) return;

  var isLightMode = panel.classList.contains('light-mode');

  if (isLightMode) {
    // Switch to Dark Mode
    panel.classList.remove('light-mode');
    try {
      localStorage.setItem('nodepulse-terminal-theme', 'dark');
    } catch(e) {
      // Ignore localStorage errors
    }
  } else {
    // Switch to Light Mode
    panel.classList.add('light-mode');
    try {
      localStorage.setItem('nodepulse-terminal-theme', 'light');
    } catch(e) {
      // Ignore localStorage errors
    }
  }
}

/**
 * Restore terminal theme from localStorage on page load
 */
function restoreTerminalTheme() {
  var theme = 'dark';

  try {
    var stored = localStorage.getItem('nodepulse-terminal-theme');
    if (stored) {
      theme = stored;
    }
  } catch(e) {
    // Ignore localStorage errors
  }

  var panel = document.getElementById('terminalPanel');
  if (panel && theme === 'light') {
    panel.classList.add('light-mode');
  }
}

// Helper functions for Quick Commands
function setCommand(cmd) {
  var input = document.getElementById('command-input');
  if (input) {
    input.value = cmd;
    input.focus();
  }
}

function clearOutput() {
  var tabManager = window.NP && window.NP.TerminalTabs;
  var activeTab = tabManager ? tabManager.getActiveTab() : null;

  var output = document.getElementById('terminal-output');
  if (output) {
    output.textContent = 'Bereit. Befehl eingeben und Enter druecken.';
    output.className = 'terminal-output';
  }

  // Update tab state
  if (activeTab && tabManager) {
    activeTab.output = 'Bereit. Befehl eingeben und Enter druecken.';
    tabManager.updateTab(activeTab.id, activeTab);
  }
}

// ==================================================
// Auto-Initialize Terminal Tabs on Page Load
// ==================================================

(function() {
  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeTerminalTabs);
  } else {
    // DOM already loaded
    initializeTerminalTabs();
  }
})();
