/**
 * Settings Page JavaScript
 * Handles tab switching, range sliders, TOON cache management
 */
(function() {
  'use strict';

  // Tab Switching (ES5)
  function switchSettingsTab(tabId, btnEl) {
    // Update tab buttons
    var tabs = document.querySelectorAll('.settings-tab');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].classList.remove('active');
      tabs[i].setAttribute('aria-selected', 'false');
    }
    if (btnEl) {
      btnEl.classList.add('active');
      btnEl.setAttribute('aria-selected', 'true');
    }

    // Update tab panes
    var panes = document.querySelectorAll('.settings-tab-pane');
    for (var j = 0; j < panes.length; j++) {
      panes[j].classList.remove('active');
    }
    var activePane = document.getElementById('tab-' + tabId);
    if (activePane) {
      activePane.classList.add('active');
    }

    // Save to localStorage
    try {
      localStorage.setItem('settings-active-tab', tabId);
    } catch (e) {}

    // Update cache stats if performance tab
    if (tabId === 'performance') {
      setTimeout(updateTOONCacheStats, 100);
    }
  }

  // Range Slider Sync (ES5)
  function syncRangeValue(inputId, value) {
    var numberInput = document.getElementById(inputId);
    if (numberInput) {
      numberInput.value = value;
    }
  }

  function syncRangeSlider(inputId, value) {
    var rangeInput = document.getElementById(inputId + '_range');
    if (rangeInput) {
      rangeInput.value = value;
    }
  }

  // TOON Cache Management (ES5)
  function clearTOONCache() {
    if (window.NP && window.NP.TOON) {
      window.NP.TOON.clearCache();
      updateTOONCacheStats();
      if (window.NP.UI && NP.UI.toast) {
        NP.UI.toast('TOON-Cache geleert', 'success');
      } else {
        alert('TOON-Cache geleert');
      }
    } else {
      alert('TOON-Parser nicht verfuegbar');
    }
  }

  function updateTOONCacheStats() {
    if (window.NP && window.NP.TOON) {
      var stats = window.NP.TOON.getStats();
      var statsEl = document.getElementById('toon-cache-stats');
      if (statsEl) {
        if (stats.metadataHash) {
          var date = new Date(stats.metadataTimestamp);
          statsEl.innerHTML =
            '<strong>Cache:</strong> ' + stats.metadataCount + ' Nodes | ' +
            '<strong>Hash:</strong> ' + stats.metadataHash + ' | ' +
            '<strong>Letzte Aktualisierung:</strong> ' + date.toLocaleString('de-DE');
        } else {
          statsEl.innerHTML = '<em>Kein Cache vorhanden</em>';
        }
      }
    }
  }

  // Restore active tab on page load
  function restoreActiveTab() {
    try {
      var savedTab = localStorage.getItem('settings-active-tab');
      if (savedTab) {
        var tabBtn = document.querySelector('.settings-tab[data-tab="' + savedTab + '"]');
        if (tabBtn) {
          switchSettingsTab(savedTab, tabBtn);
        }
      }
    } catch (e) {}
  }

  // Initialize on DOM ready
  function init() {
    restoreActiveTab();

    // Handle success/error toast from pageData (set by template)
    if (window.settingsPageData) {
      var data = window.settingsPageData;

      if (data.success && window.NP && NP.UI && NP.UI.toast) {
        NP.UI.toast('Einstellungen gespeichert!', 'success');
      }

      if (data.error && window.NP && NP.UI && NP.UI.toast) {
        NP.UI.toast(data.error, 'error');
      }

      // Sync TOON setting to localStorage if settings were saved
      if (data.success && data.useTOON !== undefined) {
        try {
          localStorage.setItem('nodepulse-use-toon', data.useTOON ? 'true' : 'false');
        } catch (e) {
          console.warn('[Settings] Failed to sync TOON setting to localStorage:', e.message);
        }
      }
    }
  }

  // Expose to global scope (needed for onclick handlers)
  window.switchSettingsTab = switchSettingsTab;
  window.syncRangeValue = syncRangeValue;
  window.syncRangeSlider = syncRangeSlider;
  window.clearTOONCache = clearTOONCache;

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
