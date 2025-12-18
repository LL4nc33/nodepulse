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

// Network Diagnostics Functions
// =====================================================
var networkData = null;
var activeNetworkXHR = null;

function loadNetworkDiagnostics(nodeId) {
  var contentEl = document.getElementById('network-content');
  var btn = document.getElementById('btn-refresh-network');

  if (!contentEl) return;

  if (activeNetworkXHR) {
    activeNetworkXHR.abort();
    activeNetworkXHR = null;
  }

  contentEl.innerHTML = '<div class="loading-placeholder"><span class="spinner"></span><span>Netzwerk-Informationen werden geladen...</span></div>';

  if (btn) {
    btn.classList.add('loading');
    btn.disabled = true;
  }

  var xhr = new XMLHttpRequest();
  activeNetworkXHR = xhr;
  xhr.open('GET', '/api/nodes/' + nodeId + '/network', true);
  xhr.timeout = 120000;

  function resetState() {
    activeNetworkXHR = null;
    if (btn) {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  }

  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      resetState();

      var response;
      try {
        response = JSON.parse(xhr.responseText);
      } catch (e) {
        response = { success: false, error: { message: 'Ungültige Antwort' } };
      }

      if (xhr.status >= 200 && xhr.status < 300 && response.success) {
        networkData = response.data;
        renderNetworkDiagnostics();
      } else {
        var errMsg = response.error ? response.error.message : 'Fehler beim Laden';
        contentEl.innerHTML = '<div class="empty-state"><p>' + escapeHtml(errMsg) + '</p><button class="btn btn-secondary" onclick="loadNetworkDiagnostics(' + nodeId + ')">Erneut versuchen</button></div>';
      }
    }
  };

  xhr.onerror = function() {
    resetState();
    contentEl.innerHTML = '<div class="empty-state"><p>Netzwerkfehler</p></div>';
  };

  xhr.ontimeout = function() {
    resetState();
    contentEl.innerHTML = '<div class="empty-state"><p>Timeout</p></div>';
  };

  xhr.send();
}

function renderNetworkDiagnostics() {
  var contentEl = document.getElementById('network-content');
  if (!contentEl || !networkData) return;

  var d = networkData;
  var html = '<div class="network-grid">';

  // Connectivity Status
  html += '<div class="network-card network-card-status">';
  html += '<div class="network-card-header"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg><span>Konnektivitaet</span></div>';
  html += '<div class="network-card-body">';
  if (d.gateway) {
    html += '<div class="status-row"><span>Gateway:</span><span class="badge ' + (d.gateway.reachable ? 'badge-success' : 'badge-error') + '">' + (d.gateway.ip || '-') + '</span></div>';
    if (d.gateway.latency_ms) {
      html += '<div class="status-row"><span>Gateway Latenz:</span><span>' + d.gateway.latency_ms + ' ms</span></div>';
    }
  }
  if (d.internet) {
    html += '<div class="status-row"><span>DNS:</span><span class="badge ' + (d.internet.dns_working ? 'badge-success' : 'badge-error') + '">' + (d.internet.dns_working ? 'OK' : 'Fehler') + '</span></div>';
    html += '<div class="status-row"><span>Internet:</span><span class="badge ' + (d.internet.connectivity ? 'badge-success' : 'badge-error') + '">' + (d.internet.connectivity ? 'Verbunden' : 'Offline') + '</span></div>';
  }
  html += '</div></div>';

  // Interfaces
  if (d.interfaces && d.interfaces.length > 0) {
    html += '<div class="network-card network-card-wide">';
    html += '<div class="network-card-header"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg><span>Interfaces (' + d.interfaces.length + ')</span></div>';
    html += '<div class="network-card-body"><table class="network-table"><thead><tr><th>Name</th><th>Status</th><th>IP</th><th>MAC</th><th>Speed</th><th>RX/TX</th></tr></thead><tbody>';
    for (var i = 0; i < d.interfaces.length; i++) {
      var iface = d.interfaces[i];
      var stateClass = iface.state === 'UP' ? 'badge-success' : 'badge-muted';
      var rxMB = iface.rx_bytes ? (iface.rx_bytes / 1048576).toFixed(1) : '0';
      var txMB = iface.tx_bytes ? (iface.tx_bytes / 1048576).toFixed(1) : '0';
      html += '<tr>';
      html += '<td><strong>' + escapeHtml(iface.name) + '</strong></td>';
      html += '<td><span class="badge ' + stateClass + '">' + escapeHtml(iface.state || '-') + '</span></td>';
      html += '<td>' + escapeHtml(iface.ipv4 || '-') + '</td>';
      html += '<td class="mono">' + escapeHtml(iface.mac || '-') + '</td>';
      html += '<td>' + (iface.speed ? iface.speed + ' Mbps' : '-') + '</td>';
      html += '<td>' + rxMB + ' / ' + txMB + ' MB</td>';
      html += '</tr>';
    }
    html += '</tbody></table></div></div>';
  }

  // DNS Configuration
  if (d.dns) {
    html += '<div class="network-card">';
    html += '<div class="network-card-header"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg><span>DNS</span></div>';
    html += '<div class="network-card-body">';
    html += '<div class="status-row"><span>Nameserver:</span><span>' + (d.dns.nameservers ? d.dns.nameservers.join(', ') : '-') + '</span></div>';
    if (d.dns.search_domains && d.dns.search_domains.length > 0) {
      html += '<div class="status-row"><span>Search:</span><span>' + d.dns.search_domains.join(', ') + '</span></div>';
    }
    html += '</div></div>';
  }

  // Firewall
  if (d.firewall) {
    html += '<div class="network-card">';
    html += '<div class="network-card-header"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg><span>Firewall</span></div>';
    html += '<div class="network-card-body">';
    html += '<div class="status-row"><span>Typ:</span><span>' + escapeHtml(d.firewall.type || 'none') + '</span></div>';
    html += '<div class="status-row"><span>Status:</span><span class="badge ' + (d.firewall.status === 'active' ? 'badge-success' : 'badge-muted') + '">' + escapeHtml(d.firewall.status || '-') + '</span></div>';
    html += '<div class="status-row"><span>Regeln:</span><span>' + (d.firewall.rules_count || 0) + '</span></div>';
    html += '</div></div>';
  }

  // Connections Summary
  if (d.connections) {
    html += '<div class="network-card">';
    html += '<div class="network-card-header"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg><span>Verbindungen</span></div>';
    html += '<div class="network-card-body">';
    html += '<div class="status-row"><span>Established:</span><span class="badge badge-success">' + (d.connections.established || 0) + '</span></div>';
    html += '<div class="status-row"><span>Time Wait:</span><span>' + (d.connections.time_wait || 0) + '</span></div>';
    html += '<div class="status-row"><span>Close Wait:</span><span>' + (d.connections.close_wait || 0) + '</span></div>';
    html += '</div></div>';
  }

  // Listening Ports
  if (d.listening_ports && d.listening_ports.length > 0) {
    html += '<div class="network-card network-card-wide">';
    html += '<div class="network-card-header"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg><span>Listening Ports (' + d.listening_ports.length + ')</span></div>';
    html += '<div class="network-card-body"><div class="ports-grid">';
    for (var j = 0; j < Math.min(d.listening_ports.length, 20); j++) {
      var port = d.listening_ports[j];
      html += '<div class="port-item"><span class="port-num">' + escapeHtml(port.port) + '</span><span class="port-proto">' + escapeHtml(port.proto || '') + '</span><span class="port-process">' + escapeHtml(port.process || '') + '</span></div>';
    }
    if (d.listening_ports.length > 20) {
      html += '<div class="port-item">+' + (d.listening_ports.length - 20) + ' weitere...</div>';
    }
    html += '</div></div></div>';
  }

  // Routes
  if (d.routes && d.routes.length > 0) {
    html += '<div class="network-card network-card-wide">';
    html += '<div class="network-card-header" onclick="toggleNetworkSection(this)" style="cursor:pointer;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg><span>Routing Table (' + d.routes.length + ')</span><span class="network-toggle">+</span></div>';
    html += '<div class="network-card-body" style="display:none;"><table class="network-table"><thead><tr><th>Destination</th><th>Gateway</th><th>Device</th><th>Metric</th></tr></thead><tbody>';
    for (var k = 0; k < d.routes.length; k++) {
      var route = d.routes[k];
      html += '<tr>';
      html += '<td>' + escapeHtml(route.destination || '-') + '</td>';
      html += '<td>' + escapeHtml(route.gateway || 'direct') + '</td>';
      html += '<td>' + escapeHtml(route.device || '-') + '</td>';
      html += '<td>' + (route.metric || '-') + '</td>';
      html += '</tr>';
    }
    html += '</tbody></table></div></div>';
  }

  // ARP Table
  if (d.arp && d.arp.length > 0) {
    html += '<div class="network-card network-card-wide">';
    html += '<div class="network-card-header" onclick="toggleNetworkSection(this)" style="cursor:pointer;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg><span>ARP Cache (' + d.arp.length + ')</span><span class="network-toggle">+</span></div>';
    html += '<div class="network-card-body" style="display:none;"><table class="network-table"><thead><tr><th>IP</th><th>MAC</th><th>Device</th><th>State</th></tr></thead><tbody>';
    for (var m = 0; m < Math.min(d.arp.length, 30); m++) {
      var arp = d.arp[m];
      html += '<tr>';
      html += '<td>' + escapeHtml(arp.ip || '-') + '</td>';
      html += '<td class="mono">' + escapeHtml(arp.mac || '-') + '</td>';
      html += '<td>' + escapeHtml(arp.device || '-') + '</td>';
      html += '<td>' + escapeHtml(arp.state || '-') + '</td>';
      html += '</tr>';
    }
    html += '</tbody></table></div></div>';
  }

  // Statistics
  if (d.statistics) {
    html += '<div class="network-card">';
    html += '<div class="network-card-header"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></svg><span>Statistiken</span></div>';
    html += '<div class="network-card-body">';
    html += '<div class="status-row"><span>TCP Active Opens:</span><span>' + (d.statistics.tcp_active_opens || 0) + '</span></div>';
    html += '<div class="status-row"><span>TCP Passive Opens:</span><span>' + (d.statistics.tcp_passive_opens || 0) + '</span></div>';
    html += '<div class="status-row"><span>TCP Failed:</span><span class="' + (d.statistics.tcp_failed_attempts > 100 ? 'text-warning' : '') + '">' + (d.statistics.tcp_failed_attempts || 0) + '</span></div>';
    html += '<div class="status-row"><span>UDP In:</span><span>' + (d.statistics.udp_in_datagrams || 0) + '</span></div>';
    html += '<div class="status-row"><span>UDP Out:</span><span>' + (d.statistics.udp_out_datagrams || 0) + '</span></div>';
    html += '</div></div>';
  }

  html += '</div>';
  contentEl.innerHTML = html;
}

function toggleNetworkSection(headerEl) {
  var body = headerEl.nextElementSibling;
  var toggle = headerEl.querySelector('.network-toggle');
  if (body.style.display === 'none') {
    body.style.display = 'block';
    if (toggle) toggle.textContent = '-';
  } else {
    body.style.display = 'none';
    if (toggle) toggle.textContent = '+';
  }
}

function runPingTest(nodeId) {
  var targetEl = document.getElementById('ping-target');
  var resultEl = document.getElementById('ping-result');
  var btn = document.getElementById('btn-ping');

  if (!targetEl || !resultEl || !btn) return;

  var target = targetEl.value.trim();
  if (!target) {
    resultEl.innerHTML = '<div class="tool-error">Bitte Ziel eingeben</div>';
    resultEl.style.display = 'block';
    return;
  }

  btn.classList.add('loading');
  btn.disabled = true;
  resultEl.innerHTML = '<div class="tool-loading"><span class="spinner"></span> Ping läuft...</div>';
  resultEl.style.display = 'block';

  var xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/nodes/' + nodeId + '/network/ping', true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.timeout = 60000;

  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      btn.classList.remove('loading');
      btn.disabled = false;

      var response;
      try {
        response = JSON.parse(xhr.responseText);
      } catch (e) {
        response = { success: false, error: { message: 'Ungültige Antwort' } };
      }

      if (xhr.status >= 200 && xhr.status < 300 && response.success) {
        var r = response.data;
        var html = '<div class="tool-success">';
        html += '<div class="ping-stats">';
        html += '<span class="ping-stat"><strong>' + r.transmitted + '</strong> gesendet</span>';
        html += '<span class="ping-stat"><strong>' + r.received + '</strong> empfangen</span>';
        html += '<span class="ping-stat ' + (r.loss_percent > 0 ? 'text-error' : '') + '"><strong>' + r.loss_percent + '%</strong> Verlust</span>';
        if (r.avg_ms !== null) {
          html += '<span class="ping-stat"><strong>' + r.avg_ms.toFixed(2) + ' ms</strong> avg</span>';
        }
        html += '</div>';
        if (r.min_ms !== null && r.max_ms !== null) {
          html += '<div class="ping-detail">min/avg/max: ' + r.min_ms.toFixed(2) + ' / ' + r.avg_ms.toFixed(2) + ' / ' + r.max_ms.toFixed(2) + ' ms</div>';
        }
        html += '</div>';
        resultEl.innerHTML = html;
      } else {
        var errMsg = response.error ? response.error.message : 'Fehler';
        resultEl.innerHTML = '<div class="tool-error">' + escapeHtml(errMsg) + '</div>';
      }
    }
  };

  xhr.onerror = function() {
    btn.classList.remove('loading');
    btn.disabled = false;
    resultEl.innerHTML = '<div class="tool-error">Netzwerkfehler</div>';
  };

  xhr.ontimeout = function() {
    btn.classList.remove('loading');
    btn.disabled = false;
    resultEl.innerHTML = '<div class="tool-error">Timeout</div>';
  };

  xhr.send(JSON.stringify({ target: target, count: 4 }));
}

function runDnsLookup(nodeId) {
  var hostnameEl = document.getElementById('dns-hostname');
  var resultEl = document.getElementById('dns-result');
  var btn = document.getElementById('btn-dns');

  if (!hostnameEl || !resultEl || !btn) return;

  var hostname = hostnameEl.value.trim();
  if (!hostname) {
    resultEl.innerHTML = '<div class="tool-error">Bitte Hostname eingeben</div>';
    resultEl.style.display = 'block';
    return;
  }

  btn.classList.add('loading');
  btn.disabled = true;
  resultEl.innerHTML = '<div class="tool-loading"><span class="spinner"></span> DNS Lookup...</div>';
  resultEl.style.display = 'block';

  var xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/nodes/' + nodeId + '/network/dns', true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.timeout = 30000;

  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      btn.classList.remove('loading');
      btn.disabled = false;

      var response;
      try {
        response = JSON.parse(xhr.responseText);
      } catch (e) {
        response = { success: false, error: { message: 'Ungültige Antwort' } };
      }

      if (xhr.status >= 200 && xhr.status < 300 && response.success) {
        var r = response.data;
        var html = '<div class="' + (r.success ? 'tool-success' : 'tool-error') + '">';
        html += '<div><strong>' + escapeHtml(r.hostname) + '</strong></div>';
        if (r.addresses && r.addresses.length > 0) {
          html += '<div class="dns-addresses">';
          for (var i = 0; i < r.addresses.length; i++) {
            html += '<span class="dns-ip">' + escapeHtml(r.addresses[i]) + '</span>';
          }
          html += '</div>';
        } else {
          html += '<div>Keine Adressen gefunden</div>';
        }
        html += '</div>';
        resultEl.innerHTML = html;
      } else {
        var errMsg = response.error ? response.error.message : 'Fehler';
        resultEl.innerHTML = '<div class="tool-error">' + escapeHtml(errMsg) + '</div>';
      }
    }
  };

  xhr.onerror = function() {
    btn.classList.remove('loading');
    btn.disabled = false;
    resultEl.innerHTML = '<div class="tool-error">Netzwerkfehler</div>';
  };

  xhr.send(JSON.stringify({ hostname: hostname }));
}

function runTraceroute(nodeId) {
  var targetEl = document.getElementById('trace-target');
  var resultEl = document.getElementById('trace-result');
  var btn = document.getElementById('btn-trace');

  if (!targetEl || !resultEl || !btn) return;

  var target = targetEl.value.trim();
  if (!target) {
    resultEl.innerHTML = '<div class="tool-error">Bitte Ziel eingeben</div>';
    resultEl.style.display = 'block';
    return;
  }

  btn.classList.add('loading');
  btn.disabled = true;
  resultEl.innerHTML = '<div class="tool-loading"><span class="spinner"></span> Traceroute läuft (kann 30-60 Sek dauern)...</div>';
  resultEl.style.display = 'block';

  var xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/nodes/' + nodeId + '/network/traceroute', true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.timeout = 90000;

  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      btn.classList.remove('loading');
      btn.disabled = false;

      var response;
      try {
        response = JSON.parse(xhr.responseText);
      } catch (e) {
        response = { success: false, error: { message: 'Ungültige Antwort' } };
      }

      if (xhr.status >= 200 && xhr.status < 300 && response.success) {
        var r = response.data;
        var html = '<div class="tool-success">';
        html += '<div class="trace-header">Traceroute zu <strong>' + escapeHtml(r.target) + '</strong></div>';
        if (r.hops && r.hops.length > 0) {
          html += '<div class="trace-hops">';
          for (var i = 0; i < r.hops.length; i++) {
            var hop = r.hops[i];
            html += '<div class="trace-hop"><span class="hop-num">' + hop.hop + '</span><span class="hop-host">' + escapeHtml(hop.host || '*') + '</span><span class="hop-time">' + (hop.time_ms ? hop.time_ms.toFixed(2) + ' ms' : '*') + '</span></div>';
          }
          html += '</div>';
        } else {
          html += '<pre class="trace-raw">' + escapeHtml(r.raw || 'Keine Daten') + '</pre>';
        }
        html += '</div>';
        resultEl.innerHTML = html;
      } else {
        var errMsg = response.error ? response.error.message : 'Fehler';
        resultEl.innerHTML = '<div class="tool-error">' + escapeHtml(errMsg) + '</div>';
      }
    }
  };

  xhr.onerror = function() {
    btn.classList.remove('loading');
    btn.disabled = false;
    resultEl.innerHTML = '<div class="tool-error">Netzwerkfehler</div>';
  };

  xhr.ontimeout = function() {
    btn.classList.remove('loading');
    btn.disabled = false;
    resultEl.innerHTML = '<div class="tool-error">Timeout - Traceroute hat zu lange gedauert</div>';
  };

  xhr.send(JSON.stringify({ target: target, maxHops: 20 }));
}

// Load network info when network tab is opened
var networkTabBtn = document.querySelector('[data-tab="network"]');
if (networkTabBtn && !networkTabBtn.hasAttribute('data-network-listener')) {
  networkTabBtn.addEventListener('click', function() {
    if (!networkData) {
      loadNetworkDiagnostics(nodeId);
    }
  });
  networkTabBtn.setAttribute('data-network-listener', 'true');
}

// =====================================================
// Terminal Bottom Panel
// =====================================================

var terminalPanel = document.getElementById('terminalPanel');
var terminalToggleBtn = document.getElementById('terminalToggleBtn');
var terminalResizeHandle = document.getElementById('terminalResizeHandle');
var terminalMinimizeBtn = document.getElementById('terminalMinimizeBtn');

// Terminal state management
var terminalState = {
  visible: false,
  minimized: false,
  height: 400 // Default height
};

// Load state from localStorage
(function loadTerminalState() {
  try {
    var savedState = localStorage.getItem('terminalPanelState');
    if (savedState) {
      var parsed = JSON.parse(savedState);
      terminalState.visible = parsed.visible || false;
      terminalState.minimized = parsed.minimized || false;
      terminalState.height = parsed.height || 400;
    }
  } catch (e) {
    // Fallback to defaults
  }

  // Apply saved state
  if (terminalPanel) {
    terminalPanel.style.height = terminalState.height + 'px';

    if (terminalState.visible) {
      terminalPanel.classList.remove('hidden');
      if (terminalState.minimized) {
        terminalPanel.classList.add('minimized');
      }
      if (terminalToggleBtn) {
        terminalToggleBtn.style.display = 'none';
      }
    } else {
      terminalPanel.classList.add('hidden');
      if (terminalToggleBtn) {
        terminalToggleBtn.style.display = 'flex';
      }
    }
  }
})();

// Save state to localStorage
function saveTerminalState() {
  try {
    localStorage.setItem('terminalPanelState', JSON.stringify(terminalState));
  } catch (e) {
    // Ignore localStorage errors
  }
}

// Toggle terminal panel visibility/minimized state
function toggleTerminalPanel() {
  if (!terminalPanel) return;

  if (terminalPanel.classList.contains('hidden')) {
    // Show panel
    terminalPanel.classList.remove('hidden');
    terminalState.visible = true;
    terminalState.minimized = false;
    if (terminalToggleBtn) {
      terminalToggleBtn.style.display = 'none';
    }
  } else if (terminalPanel.classList.contains('minimized')) {
    // Restore from minimized
    terminalPanel.classList.remove('minimized');
    terminalState.minimized = false;
  } else {
    // Minimize panel
    terminalPanel.classList.add('minimized');
    terminalState.minimized = true;
  }

  saveTerminalState();
}

// Close terminal panel completely
function closeTerminalPanel() {
  if (!terminalPanel) return;

  terminalPanel.classList.add('hidden');
  terminalPanel.classList.remove('minimized');
  terminalState.visible = false;
  terminalState.minimized = false;

  if (terminalToggleBtn) {
    terminalToggleBtn.style.display = 'flex';
  }

  saveTerminalState();
}

// Terminal resize functionality
(function initTerminalResize() {
  if (!terminalResizeHandle || !terminalPanel) return;

  var isResizing = false;
  var startY = 0;
  var startHeight = 0;

  terminalResizeHandle.addEventListener('mousedown', function(e) {
    isResizing = true;
    startY = e.clientY;
    startHeight = terminalPanel.offsetHeight;

    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';

    e.preventDefault();
  });

  document.addEventListener('mousemove', function(e) {
    if (!isResizing) return;

    var deltaY = startY - e.clientY;
    var newHeight = startHeight + deltaY;

    // Constrain height between 200px and 80% of viewport
    var minHeight = 200;
    var maxHeight = window.innerHeight * 0.8;
    newHeight = Math.max(minHeight, Math.min(newHeight, maxHeight));

    terminalPanel.style.height = newHeight + 'px';
    terminalState.height = newHeight;
  });

  document.addEventListener('mouseup', function() {
    if (isResizing) {
      isResizing = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      saveTerminalState();
    }
  });
})();

// Focus terminal input on panel open
if (terminalPanel) {
  var observer = new MutationObserver(function(mutations) {
    for (var i = 0; i < mutations.length; i++) {
      var mutation = mutations[i];
      if (mutation.attributeName === 'class') {
        var wasHidden = mutation.oldValue && mutation.oldValue.indexOf('hidden') > -1;
        var isVisible = !terminalPanel.classList.contains('hidden');

        if (wasHidden && isVisible) {
          var input = document.getElementById('command-input');
          if (input) {
            setTimeout(function() {
              input.focus();
            }, 100);
          }
        }
      }
    }
  });

  observer.observe(terminalPanel, {
    attributes: true,
    attributeOldValue: true,
    attributeFilter: ['class']
  });
}

// Keyboard shortcut: Ctrl+` to toggle terminal (like VS Code)
document.addEventListener('keydown', function(e) {
  // Ctrl+` or Cmd+` (keyCode 192 is backtick)
  if ((e.ctrlKey || e.metaKey) && e.keyCode === 192) {
    e.preventDefault();
    toggleTerminalPanel();
  }
});
