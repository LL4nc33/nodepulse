// ==================================================
// MULTI-TAB TERMINAL - Real Terminal Style
// PowerShell 7-Style with Bash Prompt
// ==================================================

// ==================================================
// Phase 3: Tab Rendering & Switching
// ==================================================

/**
 * Render all tabs in the tab bar
 * @returns {boolean} True if rendered successfully
 */
function renderTabs() {
  var tabManager = window.NP && window.NP.TerminalTabs;
  if (!tabManager) {
    return false;
  }

  var tabBar = document.getElementById('terminalTabBar');
  if (!tabBar) {
    return false;
  }

  if (!tabManager.tabs || !Array.isArray(tabManager.tabs)) {
    tabManager.tabs = [];
  }

  var html = '';

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

    if (tabManager.tabs.length > 1) {
      html += '<button class="tab-close-btn" onclick="closeTab(\'' + tab.id + '\', event)" title="Tab schliessen">&times;</button>';
    }

    html += '</div>';
  }

  html += '<button class="terminal-tab-new" onclick="createNewTab()" title="Neuer Tab (Ctrl+T)">';
  html += '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">';
  html += '<line x1="12" y1="5" x2="12" y2="19"/>';
  html += '<line x1="5" y1="12" x2="19" y2="12"/>';
  html += '</svg>';
  html += '</button>';

  tabBar.innerHTML = html;
  return true;
}

/**
 * Switch to a specific tab
 * @param {string} tabId - ID of the tab to switch to
 */
function switchToTab(tabId) {
  var tabManager = window.NP && window.NP.TerminalTabs;
  if (!tabManager) return;

  var previousTab = tabManager.getActiveTab();

  // Save current tab history before switching
  if (previousTab) {
    var historyEl = document.getElementById('terminalHistory');
    if (historyEl) {
      previousTab.historyHtml = historyEl.innerHTML;
    }
    tabManager.updateTab(previousTab.id, previousTab);
  }

  var success = tabManager.switchTab(tabId);
  if (!success) return;

  var newTab = tabManager.getActiveTab();
  if (!newTab) return;

  renderTabs();

  // Restore history
  var historyEl = document.getElementById('terminalHistory');
  if (historyEl) {
    historyEl.innerHTML = newTab.historyHtml || '';
    scrollToBottom();
  }

  // Update prompt display
  updatePromptDisplay(newTab.prompt);

  // Clear and focus input
  var input = document.getElementById('terminalInput');
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
  var promptEl = document.getElementById('terminalPrompt');
  if (!promptEl) return;

  // Use nodeData if promptData not available
  var data = promptData || {};
  var username = data.username || (typeof nodeData !== 'undefined' ? nodeData.sshUser : 'root') || 'root';
  var hostname = data.hostname || (typeof nodeData !== 'undefined' ? nodeData.name : 'server') || 'server';
  var path = data.path || '~';

  var html = '';
  html += '<span class="prompt-user">' + escapeHtml(username) + '</span>';
  html += '<span class="prompt-at">@</span>';
  html += '<span class="prompt-host">' + escapeHtml(hostname) + '</span>';
  html += '<span class="prompt-colon">:</span>';
  html += '<span class="prompt-path">' + escapeHtml(path) + '</span>';
  html += '<span class="prompt-dollar">$</span>';

  promptEl.innerHTML = html;
}

/**
 * Build prompt HTML string for history entry
 * @param {Object} promptData - Prompt data
 * @returns {string} HTML string
 */
function buildPromptHtml(promptData) {
  var data = promptData || {};
  var username = data.username || (typeof nodeData !== 'undefined' ? nodeData.sshUser : 'root') || 'root';
  var hostname = data.hostname || (typeof nodeData !== 'undefined' ? nodeData.name : 'server') || 'server';
  var path = data.path || '~';

  var html = '';
  html += '<span class="prompt-user">' + escapeHtml(username) + '</span>';
  html += '<span class="prompt-at">@</span>';
  html += '<span class="prompt-host">' + escapeHtml(hostname) + '</span>';
  html += '<span class="prompt-colon">:</span>';
  html += '<span class="prompt-path">' + escapeHtml(path) + '</span>';
  html += '<span class="prompt-dollar">$</span>';

  return html;
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

/**
 * Scroll terminal history to bottom
 */
function scrollToBottom() {
  var historyEl = document.getElementById('terminalHistory');
  var bodyEl = document.getElementById('terminalBody');
  if (bodyEl) {
    bodyEl.scrollTop = bodyEl.scrollHeight;
  }
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

  if (typeof nodeData !== 'undefined') {
    newTab.prompt = {
      username: nodeData.sshUser || 'root',
      hostname: nodeData.name || 'server',
      path: '~'
    };
    newTab.workingDir = '~';
    newTab.historyHtml = '';
    tabManager.updateTab(newTab.id, newTab);
  }

  tabManager.switchTab(newTab.id);
  renderTabs();
  switchToTab(newTab.id);

  var input = document.getElementById('terminalInput');
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

  if (tabManager.tabs.length === 1) {
    if (window.NP && window.NP.Toast) {
      window.NP.Toast.show('Letztes Terminal-Tab kann nicht geschlossen werden.', 'warning');
    }
    return;
  }

  var tab = tabManager.getTabById(tabId);
  if (!tab) return;

  if (tabId === tabManager.activeTabId) {
    var currentIndex = -1;
    for (var i = 0; i < tabManager.tabs.length; i++) {
      if (tabManager.tabs[i].id === tabId) {
        currentIndex = i;
        break;
      }
    }

    var nextTab = tabManager.tabs[currentIndex + 1] || tabManager.tabs[currentIndex - 1];
    if (nextTab) {
      tabManager.switchTab(nextTab.id);
    }
  }

  tabManager.removeTab(tabId);
  renderTabs();

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

document.addEventListener('keydown', function(e) {
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

  // Ctrl+L: Clear Terminal
  if (e.ctrlKey && e.key === 'l') {
    e.preventDefault();
    clearTerminal();
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

var terminalTabsInitialized = false;
var initRetryCount = 0;
var MAX_INIT_RETRIES = 10;

/**
 * Initialize terminal tab system with retry mechanism
 */
function initializeTerminalTabs() {
  if (terminalTabsInitialized) {
    return;
  }

  if (typeof nodeId === 'undefined') {
    return;
  }

  if (!window.NP || !window.NP.TerminalTabs) {
    if (initRetryCount < MAX_INIT_RETRIES) {
      initRetryCount++;
      setTimeout(initializeTerminalTabs, 100);
    }
    return;
  }

  var tabBar = document.getElementById('terminalTabBar');
  var terminalPanel = document.getElementById('terminalPanel');
  if (!tabBar || !terminalPanel) {
    if (initRetryCount < MAX_INIT_RETRIES) {
      initRetryCount++;
      setTimeout(initializeTerminalTabs, 100);
    }
    return;
  }

  terminalTabsInitialized = true;

  window.NP.TerminalTabs.init(nodeId);

  migrateOldTerminalState(nodeId);

  var activeTab = window.NP.TerminalTabs.getActiveTab();
  if (activeTab && typeof nodeData !== 'undefined') {
    activeTab.prompt = activeTab.prompt || {};
    activeTab.prompt.username = nodeData.sshUser || activeTab.prompt.username || 'root';
    activeTab.prompt.hostname = nodeData.name || activeTab.prompt.hostname || 'server';
    activeTab.prompt.path = activeTab.prompt.path || activeTab.workingDir || '~';
    window.NP.TerminalTabs.updateTab(activeTab.id, activeTab);
  }

  renderTabs();

  if (activeTab) {
    switchToTab(activeTab.id);
  }

  restoreTerminalTheme();
  setupTerminalInput();
  setupQuickCmdDropdown();
}

/**
 * Setup Enter key handler for terminal input
 */
function setupTerminalInput() {
  var input = document.getElementById('terminalInput');
  if (!input) return;

  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      executeTerminalCommand();
    }
  });
}

/**
 * Setup quick command dropdown toggle
 */
function setupQuickCmdDropdown() {
  var toggle = document.getElementById('quickCmdToggle');
  var menu = document.getElementById('quickCmdMenu');
  if (!toggle || !menu) return;

  toggle.addEventListener('click', function(e) {
    e.stopPropagation();
    menu.classList.toggle('open');
  });

  // Close on outside click
  document.addEventListener('click', function() {
    menu.classList.remove('open');
  });

  // Prevent menu clicks from closing
  menu.addEventListener('click', function(e) {
    e.stopPropagation();
  });
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
  } catch(e) {}

  var tabManager = window.NP.TerminalTabs;

  if (oldState && tabManager.tabs.length === 0) {
    var firstTab = tabManager.createTab('Terminal 1');

    firstTab.prompt = {
      username: (typeof nodeData !== 'undefined' && nodeData.sshUser) || 'root',
      hostname: (typeof nodeData !== 'undefined' && nodeData.name) || 'server',
      path: '~'
    };

    firstTab.workingDir = '~';
    firstTab.historyHtml = '';

    tabManager.updateTab(firstTab.id, firstTab);
    tabManager.activeTabId = firstTab.id;
    tabManager.save();

    try {
      localStorage.removeItem(oldKey);
    } catch(e) {}
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
  if (!tab || !newPath) {
    return;
  }

  var currentDir = tab.workingDir || '~';
  var resolvedPath;

  if (newPath === '~' || newPath === '') {
    resolvedPath = '~';
  } else if (newPath === '-') {
    resolvedPath = tab.previousDir || '~';
    tab.previousDir = currentDir;
  } else if (newPath === '..') {
    if (currentDir === '~' || currentDir === '/') {
      resolvedPath = currentDir;
    } else {
      var parts = currentDir.split('/');
      parts.pop();
      resolvedPath = parts.length === 0 ? '/' : parts.join('/');
      if (resolvedPath === '') resolvedPath = '/';
    }
  } else if (newPath.charAt(0) === '/') {
    resolvedPath = newPath;
  } else if (newPath.substring(0, 2) === '~/') {
    resolvedPath = newPath;
  } else {
    if (currentDir === '~') {
      resolvedPath = '~/' + newPath;
    } else if (currentDir === '/') {
      resolvedPath = '/' + newPath;
    } else {
      resolvedPath = currentDir + '/' + newPath;
    }
  }

  tab.previousDir = currentDir;
  tab.workingDir = resolvedPath;
  if (!tab.prompt) {
    tab.prompt = {};
  }
  tab.prompt.path = resolvedPath;

  var tabManager = window.NP && window.NP.TerminalTabs;
  if (tabManager && typeof tabManager.updateTab === 'function') {
    tabManager.updateTab(tab.id, tab);
  }
}

// ==================================================
// Phase 8: Real Terminal Command Execution
// ==================================================

/**
 * Execute command and append to history (real terminal style)
 */
function executeTerminalCommand() {
  var nodeIdToUse = (typeof nodeId !== 'undefined') ? nodeId : null;
  if (!nodeIdToUse) {
    console.error('executeTerminalCommand: No nodeId available');
    return;
  }

  var tabManager = window.NP && window.NP.TerminalTabs;
  var activeTab = null;

  if (tabManager && typeof tabManager.getActiveTab === 'function') {
    activeTab = tabManager.getActiveTab();
  }

  var input = document.getElementById('terminalInput');
  var historyEl = document.getElementById('terminalHistory');

  var command = input ? input.value.trim() : '';

  if (!command) {
    return;
  }

  // Add to tab's command history
  if (activeTab && tabManager) {
    if (!activeTab.commandHistory) {
      activeTab.commandHistory = [];
    }
    activeTab.commandHistory.push(command);
  }

  // Build prompt HTML for this command
  var promptHtml = buildPromptHtml(activeTab ? activeTab.prompt : null);

  // Create command entry in history
  var entryDiv = document.createElement('div');
  entryDiv.className = 'terminal-entry';

  var cmdLineDiv = document.createElement('div');
  cmdLineDiv.className = 'terminal-cmd-line';
  cmdLineDiv.innerHTML = '<span class="terminal-prompt">' + promptHtml + '</span> <span class="terminal-cmd-text">' + escapeHtml(command) + '</span>';
  entryDiv.appendChild(cmdLineDiv);

  // Create output placeholder
  var outputDiv = document.createElement('div');
  outputDiv.className = 'terminal-cmd-output loading';
  outputDiv.textContent = 'Ausfuehrung...';
  entryDiv.appendChild(outputDiv);

  // Append to history
  if (historyEl) {
    historyEl.appendChild(entryDiv);
    scrollToBottom();
  }

  // Clear input
  if (input) {
    input.value = '';
  }

  // Working Directory Tracking: Parse cd commands BEFORE sending
  var cdMatch = command.match(/^cd\s*(.*)$/);
  if (cdMatch && activeTab) {
    var newPath = cdMatch[1].trim() || '~';
    updateWorkingDirLocally(activeTab, newPath);
    updatePromptDisplay(activeTab.prompt);
  }

  // Execute command via API
  var xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/commands/execute/' + nodeIdToUse, true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.timeout = 125000;

  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      var response;
      try {
        response = JSON.parse(xhr.responseText);
      } catch(e) {
        outputDiv.textContent = 'Fehler beim Parsen der Antwort.';
        outputDiv.className = 'terminal-cmd-output error';
        return;
      }

      outputDiv.classList.remove('loading');

      if (response.success && response.data) {
        var data = response.data;
        var outputText = '';

        if (data.output) {
          outputText += data.output;
        }

        if (data.error && data.error.trim()) {
          if (data.output) outputText += '\n';
          outputText += data.error;
        }

        if (!data.output && !data.error) {
          outputText = '';
        }

        outputDiv.textContent = outputText;
        outputDiv.className = 'terminal-cmd-output ' + (data.status === 'success' ? 'success' : 'error');

        // Hide empty output
        if (!outputText) {
          outputDiv.style.display = 'none';
        }
      } else if (response.error) {
        outputDiv.textContent = 'Fehler: ' + (response.error.message || 'Unbekannter Fehler');
        outputDiv.className = 'terminal-cmd-output error';
      }

      scrollToBottom();

      // Save history to tab
      if (activeTab && tabManager && historyEl) {
        activeTab.historyHtml = historyEl.innerHTML;
        tabManager.updateTab(activeTab.id, activeTab);
      }
    }
  };

  xhr.onerror = function() {
    outputDiv.textContent = 'Netzwerkfehler beim Ausfuehren des Befehls.';
    outputDiv.className = 'terminal-cmd-output error';
    scrollToBottom();
  };

  xhr.ontimeout = function() {
    outputDiv.textContent = 'Timeout: Befehl dauert zu lange (> 2 Minuten).';
    outputDiv.className = 'terminal-cmd-output error';
    scrollToBottom();
  };

  xhr.send(JSON.stringify({ command: command }));
}

/**
 * Run a quick command directly
 * @param {string} cmd - Command to run
 */
function runQuickCommand(cmd) {
  var input = document.getElementById('terminalInput');
  if (input) {
    input.value = cmd;
  }

  // Close dropdown
  var menu = document.getElementById('quickCmdMenu');
  if (menu) {
    menu.classList.remove('open');
  }

  executeTerminalCommand();
}

/**
 * Clear terminal history
 */
function clearTerminal() {
  var historyEl = document.getElementById('terminalHistory');
  if (historyEl) {
    historyEl.innerHTML = '';
  }

  var tabManager = window.NP && window.NP.TerminalTabs;
  var activeTab = tabManager ? tabManager.getActiveTab() : null;

  if (activeTab && tabManager) {
    activeTab.historyHtml = '';
    tabManager.updateTab(activeTab.id, activeTab);
  }
}

// ==================================================
// Phase 9: Theme Toggle (Light/Dark Mode)
// ==================================================

function toggleTerminalTheme() {
  var panel = document.getElementById('terminalPanel');
  if (!panel) return;

  var isLightMode = panel.classList.contains('light-mode');

  if (isLightMode) {
    panel.classList.remove('light-mode');
    try {
      localStorage.setItem('nodepulse-terminal-theme', 'dark');
    } catch(e) {}
  } else {
    panel.classList.add('light-mode');
    try {
      localStorage.setItem('nodepulse-terminal-theme', 'light');
    } catch(e) {}
  }
}

function restoreTerminalTheme() {
  var theme = 'dark';

  try {
    var stored = localStorage.getItem('nodepulse-terminal-theme');
    if (stored) {
      theme = stored;
    }
  } catch(e) {}

  var panel = document.getElementById('terminalPanel');
  if (panel && theme === 'light') {
    panel.classList.add('light-mode');
  }
}

// ==================================================
// Terminal Panel Toggle (for minimize button & FAB)
// ==================================================

function toggleTerminalPanel() {
  var panel = document.getElementById('terminalPanel');
  var toggleBtn = document.getElementById('terminalToggleBtn');
  if (!panel) return;

  if (panel.classList.contains('hidden')) {
    panel.classList.remove('hidden');
    panel.classList.remove('minimized');
    if (toggleBtn) toggleBtn.style.display = 'none';

    var input = document.getElementById('terminalInput');
    if (input) {
      setTimeout(function() { input.focus(); }, 100);
    }
  } else if (panel.classList.contains('minimized')) {
    panel.classList.remove('minimized');
    if (toggleBtn) toggleBtn.style.display = 'none';

    var input = document.getElementById('terminalInput');
    if (input) {
      setTimeout(function() { input.focus(); }, 100);
    }
  } else {
    panel.classList.add('minimized');
    if (toggleBtn) toggleBtn.style.display = 'flex';
  }
}

// ==================================================
// Auto-Initialize Terminal Tabs on Page Load
// ==================================================

(function() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeTerminalTabs);
  } else {
    initializeTerminalTabs();
  }
})();
