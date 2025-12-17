// Terminal Tab Manager - ES5 Compatible
// Manages multi-tab state for PowerShell 7-style terminal

(function() {
  'use strict';

  // Terminal Tab Manager Object
  var TerminalTabManager = {
    storageKey: null,
    tabs: [],
    activeTabId: null,
    nextTabNumber: 1,

    // Initialize tab manager for a specific node
    init: function(nodeId) {
      this.storageKey = 'nodepulse-terminal-tabs-' + nodeId;
      this.load();

      // Create default tab if none exist
      if (this.tabs.length === 0) {
        this.createDefaultTab();
      }

      // Ensure there's an active tab
      if (!this.activeTabId && this.tabs.length > 0) {
        this.activeTabId = this.tabs[0].id;
      }
    },

    // Create a new tab
    createTab: function(title) {
      var id = 'tab-' + Date.now();
      var tabTitle = title || ('Terminal ' + this.getNextTabNumber());

      var tab = {
        id: id,
        title: tabTitle,
        output: 'Bereit. Befehl eingeben und Enter druecken.',
        commandHistory: [],
        workingDir: '~',
        isActive: false,
        createdAt: Date.now(),
        prompt: {
          username: 'root',
          hostname: 'server',
          path: '~'
        }
      };

      this.tabs.push(tab);
      this.save();
      return tab;
    },

    // Create default tab (first tab)
    createDefaultTab: function() {
      var tab = this.createTab('Terminal 1');
      this.activeTabId = tab.id;
      this.save();
      return tab;
    },

    // Remove a tab by ID
    removeTab: function(tabId) {
      var index = this.getTabIndexById(tabId);
      if (index === -1) return false;

      this.tabs.splice(index, 1);
      this.save();
      return true;
    },

    // Switch to a tab by ID
    switchTab: function(tabId) {
      var tab = this.getTabById(tabId);
      if (!tab) return false;

      // Mark all tabs as inactive
      for (var i = 0; i < this.tabs.length; i++) {
        this.tabs[i].isActive = false;
      }

      // Mark target tab as active
      tab.isActive = true;
      this.activeTabId = tabId;
      this.save();
      return true;
    },

    // Get active tab
    getActiveTab: function() {
      if (!this.activeTabId) return null;
      return this.getTabById(this.activeTabId);
    },

    // Get tab by ID
    getTabById: function(tabId) {
      for (var i = 0; i < this.tabs.length; i++) {
        if (this.tabs[i].id === tabId) {
          return this.tabs[i];
        }
      }
      return null;
    },

    // Get tab index by ID
    getTabIndexById: function(tabId) {
      for (var i = 0; i < this.tabs.length; i++) {
        if (this.tabs[i].id === tabId) {
          return i;
        }
      }
      return -1;
    },

    // Update tab data
    updateTab: function(tabId, data) {
      var tab = this.getTabById(tabId);
      if (!tab) return false;

      // Update tab properties
      for (var key in data) {
        if (data.hasOwnProperty(key)) {
          tab[key] = data[key];
        }
      }

      this.save();
      return true;
    },

    // Update working directory for a tab
    updateWorkingDir: function(tabId, newPath) {
      var tab = this.getTabById(tabId);
      if (!tab) return false;

      tab.workingDir = newPath;
      tab.prompt.path = newPath;
      this.save();
      return true;
    },

    // Get next tab number for default naming
    getNextTabNumber: function() {
      var num = this.nextTabNumber;
      this.nextTabNumber++;
      return num;
    },

    // Get next tab (for Ctrl+Tab navigation)
    getNextTab: function(currentTabId) {
      var currentId = currentTabId || this.activeTabId;
      var index = this.getTabIndexById(currentId);
      if (index === -1) return null;

      var nextIndex = (index + 1) % this.tabs.length;
      return this.tabs[nextIndex];
    },

    // Get previous tab (for Ctrl+Shift+Tab navigation)
    getPreviousTab: function(currentTabId) {
      var currentId = currentTabId || this.activeTabId;
      var index = this.getTabIndexById(currentId);
      if (index === -1) return null;

      var prevIndex = (index - 1 + this.tabs.length) % this.tabs.length;
      return this.tabs[prevIndex];
    },

    // Save to localStorage
    save: function() {
      if (!this.storageKey) return;

      try {
        var state = {
          tabs: this.tabs,
          activeTabId: this.activeTabId,
          nextTabNumber: this.nextTabNumber
        };

        localStorage.setItem(this.storageKey, JSON.stringify(state));
      } catch (e) {
        // localStorage quota exceeded or disabled
        console.error('Failed to save terminal tabs state:', e);
        this.handleStorageQuotaExceeded();
      }
    },

    // Load from localStorage
    load: function() {
      if (!this.storageKey) return;

      try {
        var stored = localStorage.getItem(this.storageKey);
        if (!stored) return;

        var state = JSON.parse(stored);
        this.tabs = state.tabs || [];
        this.activeTabId = state.activeTabId || null;
        this.nextTabNumber = state.nextTabNumber || 1;
      } catch (e) {
        console.error('Failed to load terminal tabs state:', e);
        this.tabs = [];
        this.activeTabId = null;
        this.nextTabNumber = 1;
      }
    },

    // Handle localStorage quota exceeded
    handleStorageQuotaExceeded: function() {
      // Truncate output in all tabs to last 5000 characters
      for (var i = 0; i < this.tabs.length; i++) {
        var tab = this.tabs[i];
        if (tab.output && tab.output.length > 5000) {
          tab.output = '... (older output truncated)\n\n' + tab.output.slice(-5000);
        }

        // Limit command history to last 20 commands
        if (tab.commandHistory && tab.commandHistory.length > 20) {
          tab.commandHistory = tab.commandHistory.slice(-20);
        }
      }

      // Try to save again after truncation
      try {
        this.save();
      } catch (e) {
        console.error('Still failed to save after truncation:', e);
      }
    },

    // Clear all tabs (reset)
    clearAll: function() {
      this.tabs = [];
      this.activeTabId = null;
      this.nextTabNumber = 1;
      this.save();
    }
  };

  // ==================================================
  // Working Directory Tracking Helpers (ES5)
  // ==================================================

  // Get parent directory from a path
  function getParentDir(path) {
    if (path === '~' || path === '/') return path;

    var parts = path.split('/').filter(function(p) { return p !== ''; });
    parts.pop();

    if (parts.length === 0) return '/';
    return '/' + parts.join('/');
  }

  // Join base path with relative path
  function joinPath(base, relative) {
    if (base === '~') base = '~';
    if (base.endsWith && base.endsWith('/')) {
      base = base.slice(0, -1);
    }
    return base + '/' + relative;
  }

  // Normalize path (remove .., ., etc.)
  function normalizePath(path) {
    if (path === '~') return '~';
    if (path === '/') return '/';

    var parts = path.split('/').filter(function(p) { return p !== ''; });
    var normalized = [];

    for (var i = 0; i < parts.length; i++) {
      var part = parts[i];
      if (part === '.') {
        // Current directory, skip
        continue;
      } else if (part === '..') {
        // Parent directory, go up
        if (normalized.length > 0) {
          normalized.pop();
        }
      } else {
        normalized.push(part);
      }
    }

    if (normalized.length === 0) return '/';
    return '/' + normalized.join('/');
  }

  // Resolve cd command to new path
  function resolveCdPath(currentPath, newPath) {
    // Handle special cases
    if (newPath === '~' || newPath === '') {
      return '~';
    }

    if (newPath === '/') {
      return '/';
    }

    if (newPath === '.') {
      return currentPath;
    }

    if (newPath === '..') {
      return getParentDir(currentPath);
    }

    // Absolute path
    if (newPath.indexOf('/') === 0) {
      return normalizePath(newPath);
    }

    // Relative path
    var joined = joinPath(currentPath, newPath);
    return normalizePath(joined);
  }

  // Export helpers to global namespace
  window.NP = window.NP || {};
  window.NP.TerminalTabs = TerminalTabManager;
  window.NP.TerminalHelpers = {
    getParentDir: getParentDir,
    joinPath: joinPath,
    normalizePath: normalizePath,
    resolveCdPath: resolveCdPath
  };

})();
