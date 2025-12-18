// =====================================================
// Tasks Tab Functions (ES5 compatible)
// =====================================================

var taskData = {
  tasks: [],
  counts: { total: 0, running: 0, ok: 0, error: 0 },
  types: []
};

var activeTaskXHR = null;
var currentTaskUpid = null;
var taskLogAutoRefreshInterval = null;

// Pagination
var taskPageSize = 10;
var taskCurrentPage = 1;
var taskTotalPages = 1;

// Load task data from API (with pagination)
function loadTaskData(page) {
  if (typeof nodeId === 'undefined') return;

  page = page || taskCurrentPage;
  taskCurrentPage = page;

  // Cancel any pending request
  if (activeTaskXHR) {
    activeTaskXHR.abort();
    activeTaskXHR = null;
  }

  // Build URL with pagination
  var offset = (page - 1) * taskPageSize;
  var url = '/api/nodes/' + nodeId + '/tasks?limit=' + taskPageSize + '&offset=' + offset;

  // Add filters if set
  var typeFilter = document.getElementById('task-type-filter');
  var statusFilter = document.getElementById('task-status-filter');
  if (typeFilter && typeFilter.value) {
    url += '&type=' + encodeURIComponent(typeFilter.value);
  }
  if (statusFilter && statusFilter.value) {
    url += '&status=' + encodeURIComponent(statusFilter.value);
  }

  var xhr = new XMLHttpRequest();
  activeTaskXHR = xhr;
  xhr.open('GET', url, true);
  xhr.timeout = 60000;

  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      activeTaskXHR = null;

      var response;
      try {
        response = JSON.parse(xhr.responseText);
      } catch (e) {
        response = { success: false, error: { message: 'Ungültige Antwort' } };
      }

      if (xhr.status >= 200 && xhr.status < 300 && response.success) {
        taskData = response.data;
        // Calculate total pages
        taskTotalPages = Math.ceil((taskData.counts.total || 0) / taskPageSize);
        if (taskTotalPages < 1) taskTotalPages = 1;
        renderTaskData();
      } else {
        var errMsg = response.error ? response.error.message : 'Fehler beim Laden';
        console.error('[Tasks] Load error:', errMsg);
      }
    }
  };

  xhr.onerror = function() {
    activeTaskXHR = null;
    console.error('[Tasks] Network error');
  };

  xhr.send();
}

// Refresh tasks (via POST to refresh endpoint)
function refreshTasks() {
  var btn = document.querySelector('#tab-tasks .task-actions .btn');
  if (btn) {
    btn.classList.add('loading');
    btn.disabled = true;
  }

  var xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/nodes/' + nodeId + '/tasks/refresh', true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.timeout = 120000;

  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      if (btn) {
        btn.classList.remove('loading');
        btn.disabled = false;
      }

      var response;
      try {
        response = JSON.parse(xhr.responseText);
      } catch (e) {
        response = { success: false, error: { message: 'Ungültige Antwort' } };
      }

      if (xhr.status >= 200 && xhr.status < 300 && response.success) {
        // Reload data after refresh
        loadTaskData();
        window.NP && window.NP.UI && window.NP.UI.showToast && window.NP.UI.showToast('Tasks aktualisiert', 'success');
      } else {
        var errMsg = response.error ? response.error.message : 'Aktualisierung fehlgeschlagen';
        alert('Fehler: ' + errMsg);
      }
    }
  };

  xhr.send();
}

// Render task data
function renderTaskData() {
  // Update summary cards
  var summaryCards = document.querySelectorAll('#tab-tasks .task-summary .summary-card');
  if (summaryCards.length >= 4 && taskData.counts) {
    summaryCards[0].querySelector('.summary-value').textContent = taskData.counts.total || 0;
    summaryCards[1].querySelector('.summary-value').textContent = taskData.counts.running || 0;
    summaryCards[2].querySelector('.summary-value').textContent = taskData.counts.ok || 0;
    summaryCards[3].querySelector('.summary-value').textContent = taskData.counts.error || 0;
  }

  // Update type filter options (only if types changed)
  var typeFilter = document.getElementById('task-type-filter');
  if (typeFilter && taskData.types && taskData.types.length > 0) {
    var currentValue = typeFilter.value;
    // Only rebuild if empty or types changed
    if (typeFilter.options.length <= 1) {
      typeFilter.innerHTML = '<option value="">Alle Typen</option>';
      for (var i = 0; i < taskData.types.length; i++) {
        var opt = document.createElement('option');
        opt.value = taskData.types[i];
        opt.textContent = getTaskTypeLabel(taskData.types[i]);
        typeFilter.appendChild(opt);
      }
      typeFilter.value = currentValue;
    }
  }

  // Render the tasks list
  renderTasksList();
}

// Get task type label
function getTaskTypeLabel(type) {
  var labels = {
    'vzdump': 'Backup',
    'vzrestore': 'Restore',
    'vzcreate': 'CT Create',
    'vzstart': 'CT Start',
    'vzstop': 'CT Stop',
    'qmcreate': 'VM Create',
    'qmstart': 'VM Start',
    'qmstop': 'VM Stop',
    'qmreboot': 'VM Reboot',
    'qmshutdown': 'VM Shutdown',
    'qmreset': 'VM Reset',
    'qmsuspend': 'VM Suspend',
    'qmresume': 'VM Resume',
    'qmclone': 'VM Clone',
    'qmmigrate': 'VM Migrate',
    'qmrestore': 'VM Restore',
    'qmconfig': 'VM Config',
    'qmtemplate': 'VM Template',
    'imgcopy': 'Disk Copy',
    'download': 'Download',
    'aptupdate': 'APT Update',
    'startall': 'Start All',
    'stopall': 'Stop All'
  };
  return labels[type] || type;
}

// Get task status class
function getTaskStatusClass(task) {
  if (task.status === 'running') return 'running';
  if (task.status === 'OK' || task.exitstatus === 'OK') return 'ok';
  if (task.exitstatus && task.exitstatus !== '' && task.exitstatus !== 'OK') return 'error';
  if (task.status && task.status !== 'running' && task.status !== 'OK' && task.status !== '') return 'error';
  return 'unknown';
}

// Format time ago
function formatTaskTimeAgo(timestamp) {
  if (!timestamp) return '-';
  var now = Math.floor(Date.now() / 1000);
  var diff = now - timestamp;
  if (diff < 60) return 'gerade eben';
  if (diff < 3600) return Math.floor(diff / 60) + ' Min.';
  if (diff < 86400) return Math.floor(diff / 3600) + ' Std.';
  if (diff < 604800) return Math.floor(diff / 86400) + ' Tage';
  return new Date(timestamp * 1000).toLocaleDateString('de-DE');
}

// Format duration
function formatTaskDuration(starttime, endtime) {
  if (!starttime) return '-';
  var end = endtime || Math.floor(Date.now() / 1000);
  var duration = end - starttime;
  if (duration < 60) return duration + 's';
  if (duration < 3600) return Math.floor(duration / 60) + 'm ' + (duration % 60) + 's';
  return Math.floor(duration / 3600) + 'h ' + Math.floor((duration % 3600) / 60) + 'm';
}

// Filter tasks (resets to page 1 and reloads from server)
function filterTasks() {
  taskCurrentPage = 1;
  loadTaskData(1);
}

// Render tasks list (called after data is loaded)
function renderTasksList() {
  var listEl = document.getElementById('tasks-list');
  if (!listEl) return;

  var tasks = taskData.tasks || [];

  if (tasks.length === 0) {
    listEl.innerHTML = '<div class="empty-state compact"><p>Keine Tasks gefunden.</p><p class="text-muted">Starten Sie eine Aktion in Proxmox oder aktualisieren Sie die Liste.</p></div>';
    return;
  }

  var html = '<div class="task-table-wrapper"><table class="task-table">';
  html += '<thead><tr><th>Typ</th><th>VMID</th><th>User</th><th>Status</th><th>Gestartet</th><th>Dauer</th><th>Aktionen</th></tr></thead>';
  html += '<tbody>';

  for (var i = 0; i < tasks.length; i++) {
    var task = tasks[i];
    var statusClass = getTaskStatusClass(task);
    var timeStr = formatTaskTimeAgo(task.starttime);
    var fullDate = task.starttime ? new Date(task.starttime * 1000).toLocaleString('de-DE') : '-';
    var durationStr = formatTaskDuration(task.starttime, task.endtime);

    html += '<tr data-upid="' + escapeTaskAttr(task.upid) + '" data-type="' + task.task_type + '" data-vmid="' + (task.vmid || '') + '" data-status="' + statusClass + '">';
    html += '<td><span class="task-type-badge">' + getTaskTypeLabel(task.task_type) + '</span></td>';
    html += '<td>' + (task.vmid || '-') + '</td>';
    html += '<td class="task-user">' + escapeTaskHtml(task.user || '-') + '</td>';
    html += '<td><span class="task-status ' + statusClass + '">';
    if (task.status === 'running') {
      html += '<span class="spinner-mini"></span> Laufend';
    } else if (task.status === 'OK' || task.exitstatus === 'OK') {
      html += 'OK';
    } else if ((task.exitstatus && task.exitstatus !== 'OK') || (task.status && task.status !== 'running' && task.status !== 'OK' && task.status !== '')) {
      html += 'Fehler';
    } else {
      html += escapeTaskHtml(task.status || '-');
    }
    html += '</span></td>';
    html += '<td title="' + fullDate + '">' + timeStr + '</td>';
    html += '<td>' + durationStr + '</td>';
    html += '<td class="actions-cell">';
    html += '<button type="button" class="btn btn-sm" onclick="showTaskLog(\'' + escapeTaskAttr(task.upid) + '\')" title="Log anzeigen">';
    html += '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>';
    html += '</button>';
    if (task.status === 'running') {
      html += '<button type="button" class="btn btn-sm btn-danger" onclick="stopTask(\'' + escapeTaskAttr(task.upid) + '\')" title="Task stoppen">';
      html += '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="6" width="12" height="12"/></svg>';
      html += '</button>';
    }
    html += '</td></tr>';
  }

  html += '</tbody></table></div>';

  // Add pagination controls
  html += renderTaskPagination();

  listEl.innerHTML = html;
}

// Render pagination controls
function renderTaskPagination() {
  if (taskTotalPages <= 1) return '';

  var html = '<div class="task-pagination">';
  html += '<button type="button" class="btn btn-sm" onclick="goToTaskPage(1)" ' + (taskCurrentPage <= 1 ? 'disabled' : '') + '>&laquo;</button>';
  html += '<button type="button" class="btn btn-sm" onclick="goToTaskPage(' + (taskCurrentPage - 1) + ')" ' + (taskCurrentPage <= 1 ? 'disabled' : '') + '>&lsaquo;</button>';
  html += '<span class="pagination-info">Seite ' + taskCurrentPage + ' von ' + taskTotalPages + '</span>';
  html += '<button type="button" class="btn btn-sm" onclick="goToTaskPage(' + (taskCurrentPage + 1) + ')" ' + (taskCurrentPage >= taskTotalPages ? 'disabled' : '') + '>&rsaquo;</button>';
  html += '<button type="button" class="btn btn-sm" onclick="goToTaskPage(' + taskTotalPages + ')" ' + (taskCurrentPage >= taskTotalPages ? 'disabled' : '') + '>&raquo;</button>';
  html += '</div>';
  return html;
}

// Navigate to specific page
function goToTaskPage(page) {
  if (page < 1) page = 1;
  if (page > taskTotalPages) page = taskTotalPages;
  if (page === taskCurrentPage) return;
  loadTaskData(page);
}

// Escape HTML for tasks
function escapeTaskHtml(str) {
  if (!str) return '';
  var div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Escape for attribute (tasks)
function escapeTaskAttr(str) {
  if (!str) return '';
  return String(str).replace(/'/g, "\\'").replace(/"/g, '\\"');
}

// =====================================================
// Task Log Modal
// =====================================================

function showTaskLog(upid) {
  currentTaskUpid = upid;

  // Update modal info
  var upidEl = document.getElementById('taskLogUpid');
  if (upidEl) upidEl.textContent = upid;

  var logContent = document.getElementById('taskLogContent');
  if (logContent) logContent.textContent = 'Lade Log...';

  var statusEl = document.getElementById('taskLogStatus');
  if (statusEl) statusEl.className = 'task-status';

  // Show modal
  var modal = document.getElementById('taskLogModal');
  if (modal) {
    modal.style.display = 'flex';
  }

  // Load log
  loadTaskLog(upid);
}

function loadTaskLog(upid) {
  var xhr = new XMLHttpRequest();
  xhr.open('GET', '/api/nodes/' + nodeId + '/tasks/' + encodeURIComponent(upid) + '/log', true);
  xhr.timeout = 30000;

  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      var response;
      try {
        response = JSON.parse(xhr.responseText);
      } catch (e) {
        response = { success: false, error: { message: 'Ungültige Antwort' } };
      }

      var logContent = document.getElementById('taskLogContent');
      if (xhr.status >= 200 && xhr.status < 300 && response.success) {
        var lines = response.data.lines || [];
        var logText = '';
        for (var i = 0; i < lines.length; i++) {
          logText += lines[i].text + '\n';
        }
        if (logContent) logContent.textContent = logText || 'Kein Log verfügbar.';
      } else {
        var errMsg = response.error ? response.error.message : 'Fehler beim Laden des Logs';
        if (logContent) logContent.textContent = 'Fehler: ' + errMsg;
      }
    }
  };

  xhr.send();

  // Also update status
  loadTaskStatus(upid);
}

function loadTaskStatus(upid) {
  var xhr = new XMLHttpRequest();
  xhr.open('GET', '/api/nodes/' + nodeId + '/tasks/' + encodeURIComponent(upid) + '/status', true);
  xhr.timeout = 30000;

  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      var response;
      try {
        response = JSON.parse(xhr.responseText);
      } catch (e) {
        response = { success: false, error: { message: 'Ungültige Antwort' } };
      }

      var statusEl = document.getElementById('taskLogStatus');
      if (xhr.status >= 200 && xhr.status < 300 && response.success) {
        var status = response.data;
        var statusClass = 'unknown';
        var statusText = status.status || '-';

        if (status.status === 'running') {
          statusClass = 'running';
          statusText = 'Laufend';
        } else if (status.exitstatus === 'OK') {
          statusClass = 'ok';
          statusText = 'OK';
        } else if (status.exitstatus) {
          statusClass = 'error';
          statusText = 'Fehler: ' + status.exitstatus;
        }

        if (statusEl) {
          statusEl.className = 'task-status ' + statusClass;
          statusEl.textContent = statusText;
        }
      }
    }
  };

  xhr.send();
}

function refreshTaskLog() {
  if (currentTaskUpid) {
    loadTaskLog(currentTaskUpid);
  }
}

function toggleTaskLogAutoRefresh() {
  var checkbox = document.getElementById('taskLogAutoRefresh');
  if (checkbox && checkbox.checked) {
    // Start auto-refresh
    taskLogAutoRefreshInterval = setInterval(function() {
      if (currentTaskUpid) {
        loadTaskLog(currentTaskUpid);
      }
    }, 2000);
  } else {
    // Stop auto-refresh
    if (taskLogAutoRefreshInterval) {
      clearInterval(taskLogAutoRefreshInterval);
      taskLogAutoRefreshInterval = null;
    }
  }
}

// =====================================================
// Stop Task
// =====================================================

function stopTask(upid) {
  if (!confirm('Moechten Sie diesen Task wirklich stoppen?')) {
    return;
  }

  var xhr = new XMLHttpRequest();
  xhr.open('DELETE', '/api/nodes/' + nodeId + '/tasks/' + encodeURIComponent(upid), true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.timeout = 30000;

  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      var response;
      try {
        response = JSON.parse(xhr.responseText);
      } catch (e) {
        response = { success: false, error: { message: 'Ungültige Antwort' } };
      }

      if (xhr.status >= 200 && xhr.status < 300 && response.success) {
        loadTaskData();
        window.NP && window.NP.UI && window.NP.UI.showToast && window.NP.UI.showToast('Task gestoppt', 'success');
      } else {
        var errMsg = response.error ? response.error.message : 'Stoppen fehlgeschlagen';
        alert('Fehler: ' + errMsg);
      }
    }
  };

  xhr.send();
}

// =====================================================
// Close Modal
// =====================================================

function closeTaskModal(modalId) {
  // Stop auto-refresh when closing modal
  if (taskLogAutoRefreshInterval) {
    clearInterval(taskLogAutoRefreshInterval);
    taskLogAutoRefreshInterval = null;
  }

  var checkbox = document.getElementById('taskLogAutoRefresh');
  if (checkbox) checkbox.checked = false;

  currentTaskUpid = null;

  var modal = document.getElementById(modalId);
  if (modal) {
    modal.style.display = 'none';
  }
}

// =====================================================
// Initialize on tab click
// =====================================================

var taskTabInitialized = false;
var taskTabBtn = document.querySelector('[data-tab="tasks"]');
if (taskTabBtn && !taskTabBtn.hasAttribute('data-task-listener')) {
  taskTabBtn.addEventListener('click', function() {
    // Load first page on first tab click
    if (!taskTabInitialized) {
      taskTabInitialized = true;
      taskCurrentPage = 1;
      loadTaskData(1);
    }
  });
  taskTabBtn.setAttribute('data-task-listener', 'true');
}
