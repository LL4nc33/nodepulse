/**
 * Sidebar Search & Navigation
 * Handles keyboard shortcuts, node filtering, and tree toggle
 *
 * ES5-kompatibel für RPi 2B (Chrome 50+)
 */
(function() {
  'use strict';

  var searchInput = document.getElementById('sidebarSearch');
  var STORAGE_KEY = 'nodepulse_sidebar_expanded';

  // =========================================================================
  // Tree Toggle Functionality
  // =========================================================================

  /**
   * Get expanded node IDs from localStorage
   * @returns {Object} Map of node IDs that are expanded
   */
  function getExpandedNodes() {
    try {
      var stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      // Ignore parse errors
    }
    return {};
  }

  /**
   * Save expanded node IDs to localStorage
   * @param {Object} expanded - Map of expanded node IDs
   */
  function saveExpandedNodes(expanded) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(expanded));
    } catch (e) {
      // Ignore storage errors
    }
  }

  /**
   * Toggle children visibility for a node
   * @param {string} nodeId - Node ID
   * @param {boolean} forceState - Optional: force expand (true) or collapse (false)
   */
  function toggleChildren(nodeId, forceState) {
    var childrenEl = document.getElementById('children-' + nodeId);
    var toggleBtn = document.querySelector('[data-target="children-' + nodeId + '"]');

    if (!childrenEl) return;

    var expanded = getExpandedNodes();
    var isExpanded = forceState !== undefined ? forceState : !expanded[nodeId];

    if (isExpanded) {
      childrenEl.style.display = '';
      expanded[nodeId] = true;
      if (toggleBtn) {
        toggleBtn.setAttribute('aria-expanded', 'true');
        toggleBtn.classList.add('expanded');
      }
    } else {
      childrenEl.style.display = 'none';
      delete expanded[nodeId];
      if (toggleBtn) {
        toggleBtn.setAttribute('aria-expanded', 'false');
        toggleBtn.classList.remove('expanded');
      }
    }

    saveExpandedNodes(expanded);
  }

  /**
   * Restore expanded state from localStorage
   */
  function restoreExpandedState() {
    var expanded = getExpandedNodes();

    for (var nodeId in expanded) {
      if (expanded.hasOwnProperty(nodeId)) {
        toggleChildren(nodeId, true);
      }
    }
  }

  /**
   * Initialize toggle buttons
   */
  function initToggleButtons() {
    var toggleButtons = document.querySelectorAll('.node-tree-toggle');

    for (var i = 0; i < toggleButtons.length; i++) {
      (function(btn) {
        btn.addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();

          var targetId = btn.getAttribute('data-target');
          if (targetId) {
            var nodeId = targetId.replace('children-', '');
            toggleChildren(nodeId);
          }
        });
      })(toggleButtons[i]);
    }

    // Restore expanded state after a short delay (ensures DOM is ready)
    setTimeout(restoreExpandedState, 50);
  }

  // =========================================================================
  // Search Functionality
  // =========================================================================

  /**
   * Filter sidebar nodes by search query
   * @param {string} query - Search query
   */
  function filterSidebarNodes(query) {
    var items = document.querySelectorAll('.node-tree-item');
    var lowerQuery = query.toLowerCase();

    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var name = item.querySelector('.node-tree-name');
      if (name) {
        var text = name.textContent.toLowerCase();
        var matches = text.indexOf(lowerQuery) !== -1;

        // Show item if it matches or if searching for children
        if (matches) {
          item.style.display = '';
          // Also show parent items
          showParents(item);
        } else {
          item.style.display = 'none';
        }
      }
    }

    // If query is empty, restore original state
    if (!query) {
      for (var j = 0; j < items.length; j++) {
        items[j].style.display = '';
      }
      restoreExpandedState();
    }
  }

  /**
   * Show parent items of a matching item
   * @param {Element} item - The matching item
   */
  function showParents(item) {
    var parent = item.parentElement;
    while (parent) {
      if (parent.classList && parent.classList.contains('node-tree-item')) {
        parent.style.display = '';
      }
      if (parent.classList && parent.classList.contains('node-tree-children')) {
        parent.style.display = '';
      }
      parent = parent.parentElement;
    }
  }

  // =========================================================================
  // Keyboard Shortcuts
  // =========================================================================

  if (searchInput) {
    // "/" Shortcut to focus search
    document.addEventListener('keydown', function(e) {
      if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
        e.preventDefault();
        searchInput.focus();
      }
      if (e.key === 'Escape' && document.activeElement === searchInput) {
        searchInput.blur();
        searchInput.value = '';
        filterSidebarNodes('');
      }
    });

    // Filter on input
    searchInput.addEventListener('input', function(e) {
      filterSidebarNodes(e.target.value);
    });
  }

  // =========================================================================
  // Initialize
  // =========================================================================

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initToggleButtons);
  } else {
    initToggleButtons();
  }

  // Expose for external use
  window.sidebarToggleChildren = toggleChildren;
})();
