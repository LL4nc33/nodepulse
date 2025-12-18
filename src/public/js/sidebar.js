/**
 * Sidebar Search & Navigation
 * Handles keyboard shortcuts and node filtering
 */
(function() {
  'use strict';

  var searchInput = document.getElementById('sidebarSearch');
  if (!searchInput) return;

  // "/" Shortcut
  document.addEventListener('keydown', function(e) {
    if (e.key === '/' && document.activeElement.tagName !== 'INPUT') {
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

  function filterSidebarNodes(query) {
    var items = document.querySelectorAll('.node-tree-item');
    var lowerQuery = query.toLowerCase();

    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var name = item.querySelector('.node-tree-name');
      if (name) {
        var text = name.textContent.toLowerCase();
        item.style.display = text.indexOf(lowerQuery) !== -1 ? '' : 'none';
      }
    }
  }
})();
