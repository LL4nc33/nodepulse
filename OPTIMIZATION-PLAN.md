# nodepulse Optimierungsplan

## Dateigroessen-Analyse

| Datei | Zeilen | Max | Aktion |
|-------|--------|-----|--------|
| `style.css` | 7017 | 2000 | Aufteilen in Module |
| `nodes/detail.ejs` | 2886 | 2000 | Aufteilen in Partials |
| `api.js` | 2460 | 2000 | Aufteilen in Route-Module |
| `db/index.js` | 1677 | 2000 | OK (knapp) |

---

## 1. CSS Modularisierung

### Vorgeschlagene Struktur:
```
src/public/css/
├── style.css          (Hauptdatei - importiert alles)
├── base/
│   ├── variables.css  (~100 Zeilen - CSS Custom Properties)
│   ├── reset.css      (~50 Zeilen - Browser Reset)
│   └── typography.css (~100 Zeilen - Fonts, Text)
├── layout/
│   ├── header.css     (~200 Zeilen)
│   ├── sidebar.css    (~300 Zeilen)
│   └── grid.css       (~150 Zeilen)
├── components/
│   ├── buttons.css    (~300 Zeilen)
│   ├── forms.css      (~400 Zeilen)
│   ├── cards.css      (~200 Zeilen)
│   ├── tables.css     (~300 Zeilen)
│   └── modals.css     (~200 Zeilen)
├── pages/
│   ├── dashboard.css  (~400 Zeilen)
│   ├── nodes.css      (~500 Zeilen)
│   ├── monitoring.css (~400 Zeilen)
│   ├── settings.css   (~300 Zeilen)
│   └── alerts.css     (~300 Zeilen)
├── features/
│   ├── proxmox.css    (~500 Zeilen)
│   ├── docker.css     (~300 Zeilen)
│   └── charts.css     (~300 Zeilen)
└── responsive.css     (~800 Zeilen - alle @media queries)
```

### Alternative (einfacher):
```
src/public/css/
├── base.css       (~800 Zeilen - Variables, Reset, Layout, Components)
├── pages.css      (~1500 Zeilen - Dashboard, Nodes, Monitoring, Settings, Alerts)
├── features.css   (~1200 Zeilen - Proxmox, Docker, Charts)
└── responsive.css (~800 Zeilen - Media Queries)
```

**Header.ejs Aenderung:**
```html
<link rel="stylesheet" href="/static/css/base.css?v=4.0">
<link rel="stylesheet" href="/static/css/pages.css?v=4.0">
<link rel="stylesheet" href="/static/css/features.css?v=4.0">
<link rel="stylesheet" href="/static/css/responsive.css?v=4.0">
```

---

## 2. Template Modularisierung (detail.ejs)

### Aktuelle Struktur (2886 Zeilen in einer Datei):
- Zeile 1-100: Header, Breadcrumb, Node-Info
- Zeile 100-300: Stats Cards, Quick Actions
- Zeile 300-500: Hardware Tab
- Zeile 500-650: Docker Tab
- Zeile 650-950: Proxmox Tab (VMs, CTs, Storage, Snapshots)
- Zeile 950-1050: Services Tab
- Zeile 1050-1200: Terminal Tab
- Zeile 1200-2886: JavaScript (Modals, Actions, etc.)

### Vorgeschlagene Struktur:
```
src/views/nodes/
├── detail.ejs              (~300 Zeilen - Hauptstruktur)
└── partials/
    ├── detail-header.ejs   (~100 Zeilen - Breadcrumb, Info)
    ├── detail-stats.ejs    (~150 Zeilen - Stats Cards)
    ├── detail-tabs.ejs     (~50 Zeilen - Tab Navigation)
    ├── tabs/
    │   ├── hardware.ejs    (~200 Zeilen)
    │   ├── docker.ejs      (~300 Zeilen)
    │   ├── proxmox.ejs     (~400 Zeilen)
    │   ├── services.ejs    (~150 Zeilen)
    │   └── terminal.ejs    (~100 Zeilen)
    └── modals/
        ├── docker-modals.ejs   (~200 Zeilen)
        ├── proxmox-modals.ejs  (~300 Zeilen)
        └── confirm-modal.ejs   (~50 Zeilen)
```

**JavaScript auslagern:**
```
src/public/js/
├── node-detail.js      (~500 Zeilen - Tab-Logik, Actions)
├── docker-actions.js   (~300 Zeilen - Docker-spezifisch)
└── proxmox-actions.js  (~400 Zeilen - Proxmox-spezifisch)
```

---

## 3. API Route Modularisierung (api.js)

### Aktuelle Struktur (2460 Zeilen):
- Zeile 1-200: Nodes CRUD
- Zeile 200-400: Tags
- Zeile 400-600: Stats & Discovery
- Zeile 600-1000: Docker Actions
- Zeile 1000-1600: Proxmox Actions
- Zeile 1600-1900: Services & SSH
- Zeile 1900-2460: Alerts, Settings, Misc

### Vorgeschlagene Struktur:
```
src/routes/
├── api/
│   ├── index.js        (~100 Zeilen - Router Setup, Middleware)
│   ├── nodes.js        (~300 Zeilen - Nodes CRUD)
│   ├── tags.js         (~100 Zeilen - Tags CRUD)
│   ├── stats.js        (~200 Zeilen - Stats & Discovery)
│   ├── docker.js       (~400 Zeilen - Docker Actions)
│   ├── proxmox.js      (~600 Zeilen - Proxmox Actions)
│   ├── services.js     (~200 Zeilen - Systemd Services)
│   ├── alerts.js       (~200 Zeilen - Alerts)
│   └── settings.js     (~100 Zeilen - Settings)
└── web.js              (~650 Zeilen - unveraendert)
```

**Beispiel api/index.js:**
```javascript
const express = require('express');
const router = express.Router();

// Sub-Routers
router.use('/nodes', require('./nodes'));
router.use('/tags', require('./tags'));
router.use('/docker', require('./docker'));
router.use('/proxmox', require('./proxmox'));
router.use('/alerts', require('./alerts'));
router.use('/settings', require('./settings'));

module.exports = router;
```

---

## 4. Performance-Optimierungen

### 4.1 N+1 Query Problem (KRITISCH)

**Problem:** Sidebar-Daten werden bei jedem Request mehrfach geladen.

**Loesung:** Middleware + Caching

```javascript
// src/middleware/sidebar.js
const cache = new Map();
const CACHE_TTL = 5000; // 5 Sekunden

function getSidebarData() {
  const now = Date.now();
  const cached = cache.get('sidebar');

  if (cached && (now - cached.timestamp) < CACHE_TTL) {
    return cached.data;
  }

  const allNodes = db.nodes.getAll();
  const data = {
    nodes: allNodes,
    nodeTree: buildTree(allNodes), // In-Memory statt DB
    tags: db.tags.getAll(),
    onlineCount: allNodes.filter(n => n.online).length,
    offlineCount: allNodes.filter(n => !n.online).length
  };

  cache.set('sidebar', { data, timestamp: now });
  return data;
}

// Cache invalidieren bei Node-Aenderungen
function invalidateCache() {
  cache.delete('sidebar');
}
```

### 4.2 Tab-State bei Refresh erhalten

**Problem:** Bei Daten-Refresh wird zur Uebersicht zurueckgesprungen.

**Loesung:** URL-Hash + LocalStorage

```javascript
// Tab-State speichern
function selectTab(tabId) {
  // ... existing code ...
  window.location.hash = tabId;
  localStorage.setItem('lastTab-' + nodeId, tabId);
}

// Tab-State wiederherstellen
function restoreTab() {
  var hash = window.location.hash.replace('#', '');
  var saved = localStorage.getItem('lastTab-' + nodeId);
  var tabId = hash || saved || 'overview';
  selectTab(tabId);
}

// Bei AJAX-Refresh Tab beibehalten
function refreshData() {
  var currentTab = document.querySelector('.tab-btn.active');
  ajax('GET', '/api/nodes/' + nodeId + '/stats', null, function(err, data) {
    updateStatsDisplay(data);
    // Tab bleibt aktiv, kein Redirect
  });
}
```

### 4.3 Auto-Refresh ohne Page Reload

**Problem:** `window.location.reload()` verliert alle States.

**Loesung:** AJAX-basierter Refresh

```javascript
// Statt:
setInterval(function() {
  window.location.reload();
}, 30000);

// Besser:
setInterval(function() {
  refreshNodeStats();  // Nur Daten aktualisieren
  refreshAlertBadge(); // Badge aktualisieren
}, 30000);

function refreshNodeStats() {
  ajax('GET', '/api/nodes/' + nodeId + '/stats', null, function(err, data) {
    if (!err && data.success) {
      updateCPUCard(data.data.cpu_percent);
      updateRAMCard(data.data.ram_percent);
      updateDiskCard(data.data.disk_percent);
      // ... keine Page-Navigation
    }
  });
}
```

---

## 5. Code-Cleanup

### 5.1 Validierung extrahieren

**Neue Datei:** `src/validators/index.js`

```javascript
const validators = {
  port: function(value) {
    var port = parseInt(value, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      return { valid: false, message: 'Port muss zwischen 1 und 65535 liegen' };
    }
    return { valid: true, value: port };
  },

  required: function(value, fieldName) {
    if (!value || !String(value).trim()) {
      return { valid: false, message: fieldName + ' ist erforderlich' };
    }
    return { valid: true, value: String(value).trim() };
  },

  hostname: function(value) {
    var pattern = /^[a-zA-Z0-9]([a-zA-Z0-9\-\.]*[a-zA-Z0-9])?$/;
    if (!pattern.test(value)) {
      return { valid: false, message: 'Ungueltiger Hostname' };
    }
    return { valid: true, value: value };
  }
};

module.exports = validators;
```

### 5.2 Threshold-Config zentralisieren

**Neue Datei:** `src/config/thresholds.js`

```javascript
function getThresholds(settings) {
  return {
    cpu_warning: parseInt(settings.alert_cpu_warning, 10) || 80,
    cpu_critical: parseInt(settings.alert_cpu_critical, 10) || 95,
    ram_warning: parseInt(settings.alert_ram_warning, 10) || 85,
    ram_critical: parseInt(settings.alert_ram_critical, 10) || 95,
    disk_warning: parseInt(settings.alert_disk_warning, 10) || 80,
    disk_critical: parseInt(settings.alert_disk_critical, 10) || 95,
    temp_warning: parseInt(settings.alert_temp_warning, 10) || 70,
    temp_critical: parseInt(settings.alert_temp_critical, 10) || 85
  };
}

module.exports = { getThresholds };
```

---

## 6. Implementierungs-Reihenfolge

### Phase 1: Kritische Fixes (sofort)
1. Tab-State bei Refresh erhalten
2. AJAX-Refresh statt Page Reload
3. Sidebar-Caching implementieren

### Phase 2: Datei-Splitting (1-2 Tage)
4. api.js in Module aufteilen
5. detail.ejs in Partials aufteilen
6. JavaScript aus Templates extrahieren

### Phase 3: CSS Modularisierung (optional)
7. CSS in 4 Dateien aufteilen
8. Media Queries konsolidieren

### Phase 4: Weitere Optimierungen
9. Validierung extrahieren
10. Config zentralisieren
11. Alert-Queries mit JOIN optimieren

---

## 7. Geschaetzte Zeilen nach Optimierung

| Datei | Vorher | Nachher |
|-------|--------|---------|
| `style.css` | 7017 | ~800 (base.css) |
| `pages.css` | - | ~1500 |
| `features.css` | - | ~1200 |
| `responsive.css` | - | ~800 |
| `detail.ejs` | 2886 | ~300 |
| `api.js` | 2460 | ~100 (index) |
| `api/nodes.js` | - | ~300 |
| `api/docker.js` | - | ~400 |
| `api/proxmox.js` | - | ~600 |

**Alle Dateien unter 2000 Zeilen!**
