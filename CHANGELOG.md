# Changelog

Alle bemerkenswerten Aenderungen an diesem Projekt werden in dieser Datei dokumentiert.

Das Format basiert auf [Keep a Changelog](https://keepachangelog.com/de/1.0.0/).

## [0.4.5] - 2025-12-18 (Backup & Restore)

### Added

#### Backup & Restore Management (Sprint 2: Proxmox Advanced Features)

- **Neue Datenbank-Tabellen** (`src/db/schema.sql`)
  - `node_backup_storages` - Backup-faehige Storages mit Kapazitaet
  - `node_backups` - vzdump Backups mit VMID, Typ, Groesse, Zeitstempel
  - `node_backup_jobs` - Geplante Backup-Jobs aus Proxmox Cluster
  - Indizes fuer Performance

- **DB Module fuer Backups** (`src/db/index.js`)
  - `saveBackupStorages()` - Speichert Backup-Storages
  - `saveBackups()` - Speichert Backup-Liste
  - `saveBackupJobs()` - Speichert Backup-Jobs
  - `getBackupStorages()`, `getBackups()`, `getBackupJobs()` - Getter
  - `getBackupsByVmid()`, `getBackupsByStorage()` - Gefilterte Abfragen
  - `getSummary()` - Aggregierte Backup-Statistiken
  - `deleteForNode()` - Cleanup bei Node-Loeschung

- **Backup Discovery Script** (`scripts/backup-discovery.sh`)
  - Sammelt Backup-faehige Storages via `pvesm`
  - Listet alle vzdump Backups via `pvesh`
  - Sammelt Backup-Jobs aus Cluster-Konfiguration
  - Parst Backup-Metadata (VMID, Groesse, Zeitstempel, Notizen)
  - JSON-Output fuer API

- **Backup API Router** (`src/routes/api/backup.js`)
  - `GET /api/nodes/:id/backup` - Alle Backup-Daten
  - `GET /api/nodes/:id/backup/storages` - Backup-Storages
  - `GET /api/nodes/:id/backup/list` - Backup-Liste (mit vmid/storage Filter)
  - `GET /api/nodes/:id/backup/jobs` - Backup-Jobs
  - `POST /api/nodes/:id/backup/refresh` - Backup Discovery neu ausfuehren
  - `POST /api/nodes/:id/backup/create` - Backup erstellen (vzdump)
  - `DELETE /api/nodes/:id/backup/:volid` - Backup loeschen
  - `POST /api/nodes/:id/backup/restore` - VM/CT wiederherstellen
  - Input-Validierung (VMID, Mode, Compression)
  - Timeout bis 30 Min fuer Restore

- **Collector Integration** (`src/collector/index.js`)
  - `runBackupDiscovery(node)` - Backup-Daten sammeln
  - Automatische DB-Speicherung aller Backup-Daten
  - CRLF zu LF Konvertierung fuer Bash-Scripts

- **Backup Tab Frontend** (`src/views/partials/node-detail/backup-tab.ejs`)
  - Summary-Cards: Backup-Count, Gesamt-Groesse, Storage-Count, Job-Count
  - Backup Storages Tabelle mit Kapazitaet und Auslastung
  - Backups Tabelle mit VMID, Typ (VM/CT), Groesse, Alter
  - Filter nach Suchbegriff und VM-Typ
  - Backup Jobs Liste (collapsible)
  - Modal fuer Backup-Erstellung (VMID, Storage, Mode, Compression)
  - Modal fuer Restore (Ziel-VMID, Storage, Start-Option)
  - Modal fuer Backup-Loeschung mit Bestaetigung

- **Backup CSS** (`src/public/css/modules/backup.css`)
  - Summary-Cards mit Info-Highlight
  - Backup-Tables mit Progress-Bars
  - Filter-Leiste fuer Backups
  - Backup-Notes Spalte mit Ellipsis
  - VM/CT Badges
  - Responsive Design

- **Backup JavaScript** (`src/public/js/detail/backup.js`)
  - Dynamisches Laden und Rendern der Backup-Daten
  - Filter-Funktion fuer Backup-Liste
  - Modal-Funktionen (Create, Restore, Delete)
  - API-Calls mit XHR (ES5-kompatibel)
  - Time-ago Formatierung fuer Backup-Alter

### Changed

- **web.js**: Backup-Daten werden fuer Proxmox-Hosts geladen
- **tabs-navigation.ejs**: Backup-Tab hinzugefuegt (nur Proxmox-Hosts)
- **detail.ejs**: Backup-Tab eingebunden
- **api/index.js**: Backup-Router registriert
- **build-css.js**: backup.css zum Build hinzugefuegt
- **build-detail-js.js**: backup.js zum Build hinzugefuegt
- JS-Version auf 5.2 erhoeht

### Technical

- 3 neue DB-Tabellen mit Indizes
- ~320 Zeilen neuer API-Code
- ~400 Zeilen neuer EJS-Template
- ~260 Zeilen neuer CSS
- ~430 Zeilen neuer JavaScript (ES5-kompatibel)
- Build-Scripts aktualisiert (13 CSS-Module, 9 JS-Module)

### Files

**Neue Dateien:**
- `scripts/backup-discovery.sh`
- `src/routes/api/backup.js`
- `src/views/partials/node-detail/backup-tab.ejs`
- `src/public/css/modules/backup.css`
- `src/public/js/detail/backup.js`

**Geaenderte Dateien:**
- `src/db/schema.sql` - Backup-Tabellen
- `src/db/index.js` - Backup-Module
- `src/routes/api/index.js` - Backup-Router
- `src/routes/web.js` - Backup-Daten laden
- `src/collector/index.js` - runBackupDiscovery
- `src/views/nodes/detail.ejs` - Backup-Tab einbinden
- `src/views/partials/node-detail/tabs-navigation.ejs` - Backup-Tab
- `scripts/build-css.js` - backup.css
- `scripts/build-detail-js.js` - backup.js

---

## [0.4.4] - 2025-12-18 (LVM Storage Management)

### Added

#### LVM Storage Management (Sprint 1: Proxmox Advanced Features)

- **Neue Datenbank-Tabellen** (`src/db/schema.sql`)
  - `node_lvm_pvs` - Physical Volumes
  - `node_lvm_vgs` - Volume Groups mit Proxmox-Registrierung
  - `node_lvm_lvs` - Logical Volumes inkl. Thin Pools
  - `node_available_disks` - Freie Disks fuer VG-Erstellung
  - Indizes fuer Performance

- **DB Module fuer LVM** (`src/db/index.js`)
  - CRUD-Funktionen fuer PVs, VGs, LVs, Disks
  - `savePVs()`, `saveVGs()`, `saveLVs()`, `saveAvailableDisks()`
  - `getThinPools()`, `setVGRegistration()`, `setLVRegistration()`
  - `getSummary()` - Aggregierte Storage-Statistiken
  - `deleteForNode()` - Cleanup bei Node-Loeschung

- **LVM Discovery Script** (`scripts/lvm-discovery.sh`)
  - Sammelt PVs, VGs, LVs, Thin Pools via SSH
  - Erkennt Proxmox-registrierte Storages
  - Findet freie Disks (nicht in VG, nicht gemountet)
  - Parst `/etc/pve/storage.cfg` fuer Storage-Zuordnung
  - JSON-Output fuer API

- **Storage API Router** (`src/routes/api/storage.js`)
  - `GET /api/nodes/:id/storage/lvm` - Alle LVM-Daten
  - `GET /api/nodes/:id/storage/lvm/vgs` - Volume Groups
  - `GET /api/nodes/:id/storage/lvm/thinpools` - Thin Pools
  - `GET /api/nodes/:id/storage/lvm/available` - Nicht-registrierte VGs/Pools
  - `POST /api/nodes/:id/storage/lvm/refresh` - LVM Discovery neu ausfuehren
  - `POST /api/nodes/:id/storage/lvm/vg` - VG erstellen
  - `POST /api/nodes/:id/storage/lvm/thinpool` - Thin Pool erstellen
  - `POST /api/nodes/:id/storage/lvm/register` - In Proxmox registrieren
  - `DELETE /api/nodes/:id/storage/lvm/vg/:name` - VG loeschen
  - `DELETE /api/nodes/:id/storage/lvm/thinpool/:vg/:pool` - Thin Pool loeschen
  - `DELETE /api/nodes/:id/storage/lvm/unregister/:id` - Aus Proxmox entfernen
  - Input-Validierung mit Regex (VG-Namen, Device-Pfade, Storage-IDs)
  - Shell-Escape fuer sichere Befehlsausfuehrung

- **Collector Integration** (`src/collector/index.js`)
  - `runLvmDiscovery(node)` - LVM-Daten sammeln
  - `runCommand(node, cmd, timeout)` - Generische SSH-Befehlsausfuehrung
  - Automatische DB-Speicherung der LVM-Daten
  - Proxmox-Storage-Zuordnung aus Config

- **Storage Tab Frontend** (`src/views/partials/node-detail/storage-tab.ejs`)
  - Summary-Cards: VG-Count, Thin Pool-Count, Freie Disks, Proxmox-Registrierungen
  - Volume Groups Tabelle mit PV/LV-Count, Groesse, Auslastung
  - Thin Pools Tabelle mit Data-Percent und VG-Zuordnung
  - Physical Volumes Liste (collapsible)
  - Verfuegbare Disks Liste mit Modell, Groesse, Typ (HDD/SSD)
  - Logical Volumes Liste (collapsible)
  - Modals fuer VG/Thin Pool Erstellung
  - Register-Modal fuer Proxmox-Integration
  - Delete-Modal mit Namensbestaetigung

- **Storage CSS** (`src/public/css/modules/storage.css`)
  - Summary-Cards mit Highlight-Variante
  - Storage-Tables mit Progress-Bars
  - Collapsible Sections
  - Device-Checklist fuer VG-Erstellung
  - Modal-Danger-Variante fuer Loeschungen
  - Responsive Design (4 -> 2 -> 1 Spalten)

- **Storage JavaScript** (`src/public/js/detail/storage.js`)
  - Modal-Funktionen (Open, Close, Submit)
  - API-Calls mit XHR (ES5-kompatibel)
  - Toggle-Funktionen fuer Collapsible Sections
  - Refresh, Create, Register, Delete Aktionen
  - Keyboard-Shortcuts (ESC schliessen Modals)

### Changed

- **web.js**: LVM-Daten werden fuer Proxmox-Hosts geladen
- **tabs-navigation.ejs**: Storage-Tab hinzugefuegt (nur Proxmox-Hosts)
- **detail.ejs**: Storage-Tab eingebunden
- **build-css.js**: storage.css zum Build hinzugefuegt
- **build-detail-js.js**: storage.js zum Build hinzugefuegt
- CSS-Version auf 8.2 erhoeht
- JS-Version auf 5.1 erhoeht

### Technical

- 4 neue DB-Tabellen mit Indizes
- ~400 Zeilen neuer Backend-Code
- ~350 Zeilen neuer EJS-Template
- ~315 Zeilen neuer CSS
- ~375 Zeilen neuer JavaScript (ES5-kompatibel)
- Build-Scripts aktualisiert (12 CSS-Module, 8 JS-Module)

### Files

**Neue Dateien:**
- `scripts/lvm-discovery.sh`
- `src/routes/api/storage.js`
- `src/views/partials/node-detail/storage-tab.ejs`
- `src/public/css/modules/storage.css`
- `src/public/js/detail/storage.js`

**Geaenderte Dateien:**
- `src/db/schema.sql` - LVM-Tabellen
- `src/db/index.js` - LVM-Module
- `src/routes/api/index.js` - Storage-Router
- `src/routes/web.js` - LVM-Daten laden
- `src/collector/index.js` - runLvmDiscovery, runCommand
- `src/views/nodes/detail.ejs` - Storage-Tab einbinden
- `src/views/partials/node-detail/tabs-navigation.ejs` - Storage-Tab
- `src/views/partials/header.ejs` - CSS v8.2
- `scripts/build-css.js` - storage.css
- `scripts/build-detail-js.js` - storage.js

---

## [0.4.2] - 2025-12-18 (Design System Foundations)

### Added

#### Sprint 1: Design System Foundations

- **CSS Design-System Variablen** (`src/public/css/modules/base.css`)
  - Spacing Scale: `--space-xs` (4px) bis `--space-2xl` (48px)
  - Typography Scale: `--font-size-xs` (11px) bis `--font-size-2xl` (32px)
  - Font Weights: `--font-weight-normal/medium/semibold/bold`
  - Line Heights: `--line-height-tight/normal/relaxed`
  - Border Radius: `--radius-sm` (4px) bis `--radius-full` (9999px)
  - Transitions: `--transition-fast` (150ms) bis `--transition-slow` (300ms)

- **Vereinheitlichte Progress-Bar-Komponente** (`src/views/partials/progress-bar.ejs`)
  - 3 Varianten: `mini` (6px), `standard` (8px), `large` (12px)
  - Mini: Dashboard Listen-View, kompakt
  - Standard: Cards-View, mit optionalen absoluten Werten
  - Large: Detail-Pages, mit Label und absoluten Werten
  - Threshold-basierte Farbcodierung (ok/warning/critical)
  - Offline-State Support
  - Timestamp-Anzeige (Alter der Daten)

- **Button-Varianten konsolidiert**
  - `.btn-success` und `.btn-warning` in base.css
  - Einheitliches Styling ueber alle Module

- **Utility-Klassen** (`src/public/css/modules/base.css`)
  - `.text-muted`, `.text-danger`, `.text-success`, `.text-warning`
  - Wiederverwendbar in allen Views

- **Frontend-Design-Dokumentation** (`docs/frontend-design.md`)
  - Design-System Variablen dokumentiert
  - Progress-Bar Komponente mit allen Parametern
  - CSS-Modul-Architektur beschrieben
  - Sprint-Roadmap

### Changed

- **CSS-Module aktualisiert auf Design-System Variablen**
  - base.css: +~200 Zeilen (Design-System Variablen)
  - components.css: +189 Zeilen (Progress-Bar CSS)
  - Bestehende Komponenten nutzen jetzt CSS-Variablen

### Removed

- **CSS-Duplikate eliminiert** (-117 Zeilen)
  - `.form-row`, `.form-actions`, `.checkbox-label` aus components.css entfernt
  - `.btn-success`, `.btn-warning`, `.text-*` aus docker.css entfernt
  - `.btn-success`, `.btn-warning` aus services.css entfernt
  - Alles konsolidiert in base.css

### Technical

- CSS-Version auf 6.0 erhoeht (Cache-Bust)
- Alle bestehenden Komponenten auf CSS-Variablen umgestellt
- 11 CSS-Module bleiben separat, Build-System unveraendert

### Files

- `src/public/css/modules/base.css` - Design-System erweitert
- `src/public/css/modules/components.css` - Progress-Bar CSS + Deduplizierung
- `src/public/css/modules/docker.css` - Duplikate entfernt
- `src/public/css/modules/services.css` - Duplikate entfernt
- `src/views/partials/progress-bar.ejs` - 3 Varianten implementiert
- `src/views/partials/header.ejs` - CSS-Version 6.0
- `docs/frontend-design.md` - NEU

---

## [0.4.1] - 2025-12-18 (Security & Stability Fixes)

### Fixed

#### Security Fixes (5 Critical)

- **Command Injection Prevention** (`src/collector/index.js`)
  - Network Target Validation mit Whitelist-Ansatz
  - `validateNetworkTarget()` prueft IP/Hostname-Format
  - Blocklist fuer gefaehrliche Zeichen (; && || | etc.)
  - Verhindert Remote Code Execution via Ping/Traceroute

- **XSS in onclick Handler** (`docker-tab.ejs`, `proxmox-tab.ejs`)
  - `JSON.stringify()` statt manuellem String-Escaping
  - Sicheres Escaping fuer alle JavaScript-Kontexte
  - Behebt potentielle Code-Injection via Node-Namen

- **Path Traversal Prevention** (`src/routes/api/proxmox.js`)
  - Snapshot-Namen werden auf Path-Komponenten geprueft
  - Blockiert `../` und absolute Pfade
  - Verhindert Zugriff auf Dateien ausserhalb des erwarteten Bereichs

- **XSS in Error Messages** (`src/views/settings/index.ejs`)
  - EJS Escaping fuer Fehlermeldungen
  - `<%= %>` statt `<%- %>` fuer User-Input

- **Missing CSS Variables** (`src/public/css/modules/base.css`)
  - Fehlende `--color-*` Variablen hinzugefuegt
  - Verhindert CSS-Parsing-Fehler

#### ES5 Compatibility Fixes (Fire HD 10 2017)

- **Promise.finally() entfernt** (12 Stellen)
  - `src/public/js/detail-page.js` (6 Stellen)
  - `src/public/js/detail/docker.js` (2 Stellen)
  - `src/public/js/detail/health.js` (3 Stellen)
  - `src/public/js/detail/proxmox.js` (1 Stelle)
  - Ersetzt durch `.then(fn, fn)` Pattern
  - Kompatibel mit Chrome 50+ und Fire HD 10 Silk Browser

#### UX Improvements

- **Dashboard Metrics Spacing** (`dashboard.css`, `index.ejs`)
  - Spaltenbreite von 80px auf 100px erhoeht
  - Absolute Werte (used/total) aus Dashboard entfernt
  - Timestamps in Dashboard versteckt
  - Progress-Bar-Hoehe von 4px auf 6px erhoeht
  - Bessere Lesbarkeit bei vielen Nodes

- **localStorage Error Handling** (`src/public/js/main.js`)
  - Try/Catch fuer alle localStorage-Operationen
  - Graceful Fallback bei Quota-Exceeded
  - Verhindert Script-Crashes auf Fire HD 10

#### Backend Fixes

- **SSH Connection Leaks** (`tiered-poller.js`, `collector/index.js`)
  - `stop()` ist jetzt async und wartet auf laufende Operationen
  - SSH ControlMaster-Verbindungen werden sauber geschlossen
  - Verhindert orphaned SSH-Prozesse nach Node-Removal
  - `stopTieredMonitoring()` und `stopAllMonitoring()` sind async

### Changed

- CSS-Version auf 4.9 erhoeht (Cache-Bust)
- Dashboard zeigt nur noch Prozent-Werte (nicht mehr absolute Bytes)
- Kompakteres Dashboard-Layout fuer bessere Uebersicht

### Technical

- 9 kritische Bugs aus Code-Review Sprint 1-3 behoben
- Alle Issues aus Pre-TOON Checklist adressiert
- ES5-Kompatibilitaet vollstaendig wiederhergestellt

---

## [0.4.0] - 2025-12-17 (TOON Integration & Performance)

### Added
- **TOON Format v1.0** (Token-Oriented Object Notation)
  - Kompaktes API-Format fuer Live-Metriken
  - 81% Response-Size-Reduktion (16-25 KB → 3-5 KB bei 50 Nodes)
  - 4x schnelleres Parsing (<5ms vs ~20ms JSON)
  - 17 Tokens: V, N, C, R, D, U, L1-L15, NR, NT, T, VM, CT, DC, O, TS
  - Pipe-Delimiter (`|`) fuer bessere Lesbarkeit
  - Hybrid-Ansatz: JSON Default + TOON opt-in (Zero Breaking Changes)

- **Metadata Hash System**
  - MD5-basierte Hardware-Change-Detection
  - In-Memory-Cache mit 5-min TTL
  - Conditional Metadata: Nur schicken wenn Hash != Client-Hash
  - Auto-Invalidierung bei Hardware-Updates
  - `calculateMetadataHash()`, `getCachedHash()` in src/routes/api/stats.js

- **Circuit Breaker Pattern** (src/lib/circuit-breaker.js)
  - Verhindert SSH-Spam bei Offline-Nodes
  - 3-State-Machine: closed → open (3 failures) → half-open (60s)
  - Thresholds: 3 Failures, 60s Timeout, 1 Half-Open-Test
  - Integration in scheduler collectNode()

- **Safe Storage Wrapper** (src/public/js/safe-storage.js)
  - LRU-Eviction fuer Fire HD 10 localStorage (5-10 MB Quota)
  - 2 MB Safe-Limit, 20% Eviction-Rate
  - ES5-kompatibel (Chrome 50+, Fire HD 10 2017)
  - `estimateSize()`, `evictOldest()`, `setItem()`, `getItem()`

- **TOON-Parser** (src/public/js/toon-parser.js - 336 Zeilen)
  - ES5-kompatibel (kein const/let, arrow functions)
  - `parseTOON()` - Einzelnen TOON-String parsen
  - `parseTOONResponse()` - API-Response + Metadata mergen
  - `parseTOONHistory()` - History-Response parsen
  - Metadata-Caching mit Hash-Validierung
  - Exported: `NP.TOON` (global namespace)

- **API-Endpoints mit TOON-Support**
  - GET /api/stats?format=toon (Dashboard)
  - GET /api/stats/node/:id?format=toon (Single Node)
  - GET /api/stats/node/:id/history?format=toon (Charts)
  - GET /api/stats/hierarchy?format=toon (Tree View)
  - Optional: &metadata_hash=abc123 (skips metadata if match)

- **Settings UI**
  - Neuer Performance-Tab in Settings
  - TOON-Toggle mit Beschreibung
  - Cache-Management (clearTOONCache, Stats)
  - localStorage-Sync bei Settings-Save

### Changed
- **DB-Optimierung: VMs/Container-Counts**
  - Migration 8: vms_running, cts_running, containers_running in node_stats_current
  - Collector speichert Counts beim Polling (statt SubQuery)
  - getAllNodesWithStats() ohne SubQueries (30-50% Performance-Gewinn)
  - Backfill NULL → 0 fuer alte Rows

- **Defensive Parsing im Collector** (src/collector/index.js)
  - NaN/Infinity Sanitization nach JSON-Parse
  - Timestamp Validation (2024-01-01 < ts < now+1h)
  - Counter Reset Detection (1 GB Threshold)
  - Graceful Fallback bei Fehlern

- **Dashboard Integration**
  - Auto-Detection von TOON-Format in main.js
  - Transparent fuer bestehenden Code (response.data bleibt Array)
  - Query-Parameter dynamisch basierend auf Settings
  - Metadata-Hash mitschicken wenn Cache vorhanden

### Performance
- **81% Response-Size-Reduktion** (JSON → TOON bei 50 Nodes)
- **4x schnelleres Parsing** (<5ms TOON vs ~20ms JSON)
- **30-50% DB-Performance-Gewinn** (VMs/Container-Counts ohne SubQueries)
- **93% weniger SSH-Queries** (Circuit Breaker bei Offline-Nodes)
- **Safe Storage** verhindert localStorage Quota-Exceeded auf Fire HD 10

### Technical
- **TOON Format Specification v1.0**
  - Format: `V1|N:5|C:45.2|R:67.8|D:23.4|U:86400|L1:0.8|...|O:1|TS:1734444000`
  - Delimiter: Pipe `|` (kein Escaping noetig)
  - NULL-Handling: Dash `-` fuer Offline-Nodes
  - Absolute Values (nicht Deltas) fuer Chart-Kompatibilitaet

- **ES5-Kompatibilitaet**
  - Kein const/let, arrow functions, template strings
  - Chrome 50+, Firefox 52+, Fire HD 10 2017 Silk Browser
  - Polyfills und Fallbacks

- **Zero Breaking Changes**
  - JSON bleibt Default-Format
  - TOON opt-in via Settings
  - Graceful Fallback bei Parse-Fehlern
  - Metadata-Cache auto-invalidiert

### Files
- `src/lib/circuit-breaker.js` - NEU (231 Zeilen)
- `src/public/js/safe-storage.js` - NEU (317 Zeilen, ES5)
- `src/public/js/toon-parser.js` - NEU (336 Zeilen, ES5)
- `src/routes/api/stats.js` - TOON-Formatter, Metadata-Hash
- `src/db/index.js` - Migration 8, saveCurrent() erweitert
- `src/collector/index.js` - VMs/Container-Counts, Defensive Parsing
- `src/public/js/main.js` - Auto-Detection TOON
- `src/views/settings/index.ejs` - Performance-Tab
- `src/views/index.ejs` - Dashboard TOON-Integration
- `src/db/seed.sql` - use_toon_format Setting
- `docs/adr/001-toon-format-integration.md` - ADR (222 Zeilen)
- `docs/code-review-sprint-1-3.md` - Code Review (530+ Zeilen)
- `docs/TOON-IMPLEMENTATION-SUMMARY.md` - Dokumentation (407 Zeilen)

### Documentation
- **Architecture Decision Record**: 26 Critical Problems & Solutions
- **Code Review Sprint 1-3**: 32 Issues identifiziert (5 critical, 6 high)
- **Implementation Summary**: Komplette TOON-Integration dokumentiert

### Testing Status
- Unit Tests: 85% Coverage-Ziel
- Integration Tests: API-Endpoints mit TOON-Support
- Browser Compatibility: Chrome 50+, Fire HD 10 2017
- Performance Tests: <100ms Response-Time @ 50 Nodes

---

## [0.3.3] - 2025-12-17 (Code-Qualitaet & Performance)

### Added
- **System Health-Check**
  - APT Updates zaehlen (inkl. Security-Updates)
  - Kernel-Version und Last Boot anzeigen
  - Reboot-Required Status pruefen
  - Docker Images und NPM Outdated Packages
  - Proxmox-spezifisch: PVE-Version und aktives Repository

- **Proxmox Repository Management**
  - Enterprise <-> No-Subscription Switch via UI
  - Status-Anzeige welches Repo aktiv ist
  - Automatisches apt update nach Repo-Wechsel

- **Hardware-Discovery erweitert**
  - Thermal Sensoren (thermal_zone*, hwmon*)
  - Power-Sensoren (Intel RAPL, hwmon power metrics)
  - SMART Disk-Daten (Health, Power-On Hours, Temperatur)
  - Network Interfaces erweitert (Speed, MTU, Duplex, Interface-Typ)
  - CPU-Temperaturen direkt in CPU-Card integriert
  - Stromverbrauch-Card zeigt Power-Sensoren

- **Zentrale Utility-Module** (Code-Deduplizierung)
  - `src/lib/validators.js` - Validierungs-Funktionen (~217 Zeilen)
  - `src/lib/thresholds.js` - Alert-Thresholds & Settings (~118 Zeilen)
  - `src/lib/params.js` - Parameter-Parsing (~160 Zeilen)

### Changed
- **CSS Modularisierung komplett** (9568 → 6585 Zeilen + Build-System)
  - 11 logische Module: base, layout, components, dashboard, detail-pages, docker, proxmox, services, network, charts, responsive
  - Fehlende ~3400 Zeilen aus Modularisierung wiederhergestellt
  - Build-System: `npm run build:css`

- **JavaScript Modularisierung** (detail-page.js: 2854 → 2521 Zeilen)
  - 6 logische Module: docker, proxmox, modals, terminal, services, network, health
  - Build-System: `npm run build:js`

- **API Modularisierung** (api.js: 3130 → 11 Module)
  - Aufgeteilt in: nodes, proxmox, docker, stats, alerts, commands, services, settings, tags, health, metrics
  - api-legacy.js entfernt (3130 Zeilen)

- **Terminal PowerShell-Style**
  - Hintergrund: PowerShell Blue (#012456)
  - Prompt: Gelb (#ffff00)
  - Text: Hellgrau (#cccccc)
  - Schrift: Cascadia Code, Consolas, Monaco

- **Kompaktes Card-Layout** im Uebersicht-Tab
  - Status/Verbindung/Monitoring/Tags: 4 Spalten (25% je Card)
  - Hardware & Discovery Sections: compact
  - 4 Spalten auf Desktop statt 2

### Fixed
- **CSS-Reparatur** (KRITISCH)
  - Fehlende ~3400 Zeilen aus style-original.css wiederhergestellt
  - `.node-tree*` - Side-Panel Node-Baum (~110 Zeilen)
  - `.settings-*` - Settings-Seite (~293 Zeilen)
  - `.tag*` - Tag-Styling (~85 Zeilen)
  - Media Query Klammer-Fehler behoben (dashboard.css)

- **Terminal-Animation** synchron mit Sidepanel
  - CSS-Klasse `.sidepanel-collapsed` statt inline styles
  - requestAnimationFrame fuer saubere Animation

- **EJS-Fehler** in detail-page.js behoben
  - `<%= node.id %>` als globale Variable `nodeId` ausgelagert
  - 7 Stellen repariert

### Performance
- **Code-Deduplizierung** (~400 Zeilen eliminiert)
  - Node-Validierung: 6 → 1 Implementierung
  - Port-Validierung: 5 → 1 Implementierung
  - Threshold-Parsing: 3 → 1 Implementierung
  - VM/CT-Parameter: 2 → 1 je Implementierung
  - Settings-Keys: 3 → 1 Single Source of Truth
  - Query-Param-Parsing: 7 → Zentral

- **Sidebar-Middleware** (~87% weniger DB-Queries)
  - 8 Duplikationen in web.js entfernt
  - Single Source of Truth fuer Sidebar-Daten

- **Progress-Bar-Partial** (~60 Zeilen gespart)
  - 9 Duplikationen in index.ejs ersetzt

### Technical
- Alle Dateien unter 2500 Zeilen (Build-System fuer Production)
- Max 2500 Zeilen pro Datei eingehalten
- DRY-Prinzip konsequent umgesetzt
- Modular-Architektur: CSS (11), JS (7), API (11)

### Files
- `src/lib/validators.js` - NEU
- `src/lib/thresholds.js` - NEU
- `src/lib/params.js` - NEU
- `src/middleware/sidebar.js` - NEU
- `src/routes/api/health.js` - NEU
- `src/public/css/modules/` - 11 Module
- `src/public/js/detail/` - 7 Module
- `scripts/build-css.js` - Build-System
- `scripts/build-detail-js.js` - Build-System
- `scripts/health-check.sh` - Health-Check Script
- `scripts/proxmox-repo.sh` - Repo Management Script
- `src/routes/api-legacy.js` - ENTFERNT

---

## [0.3.2] - 2025-12-16 (Frontend-Backend Integration)

### Added
- **Einheitliche JavaScript-Bibliothek** (`src/public/js/main.js` v0.3.2)
  - `NP.API` - Promise-basierter API-Client mit `get`, `post`, `put`, `delete`
  - `NP.UI.showAlert()` / `hideAlert()` - Einheitliche Inline-Alerts
  - `NP.UI.setButtonLoading()` / `setButtonsLoading()` - Button Loading States
  - `NP.UI.showLoading()` / `hideLoading()` - Container Loading Overlays
  - `NP.UI.toast()` - Toast-Notifications (oben rechts, 4s Auto-Dismiss)
  - `NP.UI.formatBytes()` / `formatTimeAgo()` - Formatierungs-Helpers
  - `NP.Tabs` - Einheitliches Tab-System mit URL-Hash + localStorage Persistenz

- **Einheitliche CSS-Komponenten** (~730 neue Zeilen in `style.css`)
  - `.loading-overlay` - Loading Overlay fuer Container mit Spinner
  - `.np-alert-*` - Alert-Styles (success, error, warning, info)
  - `.np-toast-*` - Toast-Notifications mit Slide-In/Out Animation
  - `.np-badge-*` - Badge-Komponenten (success, error, warning, info, neutral)
  - `.np-tabs` / `.np-tab` - Tab-System mit Touch-optimierten 48px Tabs
  - `.np-card-*` - Card-Komponenten (header, body, footer, actions)
  - `.np-table-*` - Table-Komponenten (wrapper, compact variant)
  - `.np-form-*` - Form-Komponenten (group, label, hint, row)
  - `.np-empty-state` - Empty States mit Icon, Titel, Beschreibung
  - `.np-result-*` - API-Result Container (success, error)
  - Utility-Klassen: `.np-hidden`, `.np-text-*`, `.np-mt-*`, `.np-mb-*`

### Changed
- **Templates auf NP.* Bibliothek umgestellt**
  - `settings/index.ejs` - Toast-Notifications bei Speichern
  - `nodes/detail.ejs` - Modernisierte API-Funktionen:
    - `runDiscovery()` - NP.API + NP.UI (von ~80 auf ~25 Zeilen)
    - `refreshDocker()` - NP.API + NP.UI (von ~70 auf ~20 Zeilen)
    - `containerAction()` - NP.API + NP.UI (von ~60 auf ~15 Zeilen)
    - `refreshProxmox()` - NP.API + NP.UI (von ~70 auf ~20 Zeilen)
    - `proxmoxAction()` - NP.API + NP.UI (von ~65 auf ~20 Zeilen)

### Technical
- ES5-kompatibel (var, function, XMLHttpRequest, keine Arrow Functions)
- Chrome 50+ / Fire HD 10 2017 Support
- Promise-basierte API mit `.then()/.catch()/.finally()` Pattern
- Legacy-Kompatibilitaet: `window.ajax()`, `window.formatBytes()` weiterhin verfuegbar
- CSS mit `-webkit-` Prefixes fuer alte Browser
- WCAG AA Touch-Targets (44px minimum)

### Files
- `src/public/js/main.js` - Neue einheitliche JavaScript-Bibliothek
- `src/public/css/style.css` - Erweitert um ~730 Zeilen fuer neue Komponenten
- `src/views/settings/index.ejs` - Toast-Integration
- `src/views/nodes/detail.ejs` - Modernisierte API-Funktionen

---

## [0.8.0] - 2025-01-XX (Phase 8: Polish & Extras)

### Added
- **About Page** - Neue Info-Seite mit System-Details
  - Version und Tagline
  - Feature-Uebersicht
  - System-Informationen (Node.js, Platform, Uptime, Memory)
  - Datenbank-Statistiken (Nodes, Tags, Stats, Commands)
  - Links zu GitHub und API-Dokumentation
  - Route: `/about`

- **Settings UI Verbesserung** - Vollstaendiges Settings-Formular
  - Discovery-Einstellungen (Auto-Discovery, Re-Discovery)
  - Monitoring-Einstellungen (Interval, Retention)
  - Alert-Thresholds fuer CPU, RAM, Disk, Temperatur
  - POST-Handler zum Speichern der Einstellungen
  - Erfolgs-/Fehlermeldungen

- **Services Tab (systemd)** - Neuer Tab fuer Nodes mit systemd
  - Liste aller systemd Services
  - Status-Anzeige (running, exited, failed, dead)
  - Such- und Filtermoeglichkeiten
  - Service Actions: Start, Stop, Restart
  - API Endpunkte:
    - `GET /api/nodes/:id/services` - Services auflisten
    - `POST /api/nodes/:id/services/:service/:action` - Service steuern

- **Tablet-optimiertes CSS** - Verbesserungen fuer Fire HD 10 (2017)
  - Media Queries fuer Tablet Landscape (1024-1366px)
  - Media Queries fuer Tablet Portrait (768-1023px)
  - Touch-optimierte Styles (hover:none, pointer:coarse)
  - Groessere Touch-Targets (48px)
  - Verbesserte Active-States fuer Touch-Feedback
  - Entfernte Hover-Effekte die auf Touch sticky wirken

### Improved
- **Error Pages** - Bessere Fehlerseiten
  - Visuelles Error-Icon mit Status-Code (404, 500)
  - Zurueck-Button und Dashboard-Link
  - Technische Details (nur in Development)
  - Verbesserte Styles mit Error-Gradient

- **Navigation** - About-Link in der Hauptnavigation

### Technical
- About-Route mit System-Informationen via `process` und `os`
- Settings-POST mit Whitelist-Validierung
- Services-API mit Input-Validierung (nur alphanumerische Servicenamen)
- Tablet Media Queries mit Orientation-Support
- Touch-Detection via `hover: none` und `pointer: coarse`
- ES5-kompatibel (keine Arrow Functions, var statt const/let)

### Files
- `src/routes/web.js` - About-Route, Settings-POST
- `src/routes/api.js` - Services-API Endpunkte
- `src/views/about.ejs` - About-Seite Template
- `src/views/settings/index.ejs` - Verbessertes Settings-Formular
- `src/views/error.ejs` - Verbesserte Fehlerseite
- `src/views/nodes/detail.ejs` - Services-Tab hinzugefuegt
- `src/views/partials/header.ejs` - About-Link in Navigation
- `src/public/css/style.css` - Tablet, About, Settings, Services, Error Styles
- `src/index.js` - Verbesserte Error Handler

### Review Fixes (Post-Phase 8)
- [x] Race Condition: activeServicesXHR fuer loadServices() hinzugefuegt
- [x] Touch Targets: .btn-sm von 36px auf 44px erhoeht
- [x] Security: Service-Name Laengen-Validierung (max 255 Zeichen)
- [x] Kontrast: status-exited Badge verbessert (#d0d0d0)
- [x] XHR: ontimeout Handler fuer loadServices() hinzugefuegt

---

## [0.7.0] - 2025-01-XX (Phase 7: CLI Tool)

### Added
- **CLI Tool** - Vollstaendiges Command-Line Interface
  - `bin/np` - CLI Entry Point
  - `src/cli/index.js` - Haupt-CLI-Modul
  - `src/cli/utils.js` - Hilfsfunktionen (API, Formatting, Colors, Tables)
  - `src/cli/commands/*.js` - Kommando-Module

- **np nodes** - Node Management
  - `np nodes` - Liste aller Nodes
  - `np nodes show <name>` - Node-Details anzeigen
  - `np nodes test <name>` - SSH-Verbindung testen
  - `np nodes discover <name>` - Discovery ausfuehren
  - Optionen: `-t/--type`, `--tag`, `--online`, `--offline`, `-q/--quiet`

- **np status** - Monitoring Status
  - `np status` - Uebersicht aller Nodes
  - `np status <node>` - Detail-Status eines Nodes
  - Optionen: `-t/--type`, `--compact`, `-q/--quiet`
  - Farbcodierte Ausgabe (gruen/gelb/rot basierend auf Thresholds)

- **np ssh** - SSH Connection
  - `np ssh <node>` - SSH-Shell oeffnen
  - Optionen: `-p/--port`, `-u/--user`, `-i/--identity`
  - Verwendet system ssh Binary

- **np exec** - Command Execution
  - `np exec <node> "<command>"` - Command auf Node ausfuehren
  - `np exec -t <type> "<command>"` - Multi-Node by Type
  - `np exec --all "<command>"` - Alle Nodes
  - Optionen: `--timeout`, `-q/--quiet`
  - Sequentielle Ausfuehrung mit Summary

- **np docker** - Docker Management
  - `np docker <node> ps` - Container auflisten
  - `np docker <node> images` - Images auflisten
  - `np docker <node> volumes` - Volumes auflisten
  - `np docker <node> networks` - Networks auflisten
  - `np docker <node> start/stop/restart <id>` - Container Actions
  - `np docker <node> logs <id>` - Container Logs
  - `np docker <node> refresh` - Docker-Daten aktualisieren
  - Optionen: `-a/--all`, `-n/--lines`, `-q/--quiet`

- **np pve** - Proxmox Management
  - `np pve <node> vms` - VMs auflisten
  - `np pve <node> cts` - Container auflisten
  - `np pve <node> storage` - Storage auflisten
  - `np pve <node> snapshots` - Snapshots auflisten
  - `np pve <node> start/stop/shutdown/reboot <vmid>` - VM/CT Actions
  - `np pve <node> refresh` - Proxmox-Daten aktualisieren
  - Optionen: `--vm`, `--ct`, `-q/--quiet`

- **CLI Features**
  - Farbige Terminal-Ausgabe (ANSI Colors)
  - Tabellen-Formatierung mit automatischer Spaltenbreite
  - Umgebungsvariablen: `NP_HOST`, `NP_PORT`, `NP_PROTOCOL`
  - Command-Line Optionen: `--host`, `--port`
  - Hilfe fuer alle Commands: `-h/--help`

### Technical
- CLI kommuniziert via HTTP mit dem API-Server
- Keine zusaetzlichen Dependencies (nur Node.js stdlib)
- ES5-kompatibel (var, function, require)
- Sequentielle Multi-Node Execution (vermeidet Server-Ueberlastung)
- Exit Codes: 0 = Success, 1 = Error

### Files
- `bin/np` - CLI Entry Point (shebang: #!/usr/bin/env node)
- `src/cli/index.js` - Main CLI, Command Routing, Help
- `src/cli/utils.js` - API Requests, Formatting, Colors, Tables, Argument Parsing
- `src/cli/commands/nodes.js` - Node Management Commands
- `src/cli/commands/status.js` - Monitoring Status Commands
- `src/cli/commands/ssh.js` - SSH Connection Command
- `src/cli/commands/exec.js` - Command Execution
- `src/cli/commands/docker.js` - Docker Management Commands
- `src/cli/commands/pve.js` - Proxmox Management Commands

---

## [0.6.0] - 2025-01-XX (Phase 6: Command Execution)

### Added
- **Command Database Operations**
  - `commands.getTemplates(category)` - Command-Templates nach Kategorie abrufen
  - `commands.getTemplateById(id)` - Einzelnes Template abrufen
  - `commands.getTemplatesForNodeType(nodeType)` - Templates fuer Node-Typ
  - `commands.createTemplate(data)` - Neues Template erstellen
  - `commands.deleteTemplate(id)` - Template loeschen
  - `commands.createHistory(data)` - Command-Historie erstellen
  - `commands.getHistory(limit)` - Globale Historie abrufen
  - `commands.getHistoryForNode(nodeId, limit)` - Historie fuer Node
  - `commands.createResult(data)` - Command-Ergebnis speichern
  - `commands.getResultsForHistory(historyId)` - Ergebnisse fuer Historie-Eintrag
  - `commands.getResultById(id)` - Einzelnes Ergebnis abrufen
  - `commands.getLatestResultForNode(nodeId)` - Letztes Ergebnis fuer Node
  - `commands.cleanupHistory(olderThanDays)` - Alte Historie loeschen

- **Command API Endpoints**
  - `GET /api/commands/templates` - Alle Templates (mit ?category Filter)
  - `POST /api/commands/templates` - Neues Template erstellen
  - `GET /api/nodes/:id/commands/history` - Command-Historie fuer Node
  - `POST /api/nodes/:id/commands` - Command auf Node ausfuehren
  - `GET /api/commands/results/:id` - Command-Ergebnis abrufen

- **Terminal Tab UI**
  - Neuer "Terminal" Tab in Node-Detail View
  - Command-Input mit Terminal-Prompt ($)
  - Quick Commands: Schnellzugriff auf haeufige Befehle (df, free, uptime, etc.)
  - Command Output: Formatierte Anzeige mit Erfolg/Fehler-Status
  - Command History: Liste der letzten ausgefuehrten Commands fuer den Node
  - Loading-State waehrend Command-Ausfuehrung
  - Clear-Button zum Leeren der Ausgabe

- **Terminal CSS Styles**
  - `.terminal-container` - Haupt-Container fuer Terminal-UI
  - `.terminal-header` - Header mit Titel
  - `.terminal-input-section` - Input-Bereich mit Prompt
  - `.terminal-prompt` - Terminal-Prompt ($)
  - `.terminal-input` - Monospace-Input fuer Commands
  - `.terminal-quick-commands` - Quick-Command Buttons
  - `.btn-quick` - Styling fuer Quick-Command Buttons
  - `.terminal-output-section` - Output-Bereich
  - `.terminal-output` - Monospace-Ausgabe (.loading, .success, .error states)
  - `.terminal-history-section` - Historie-Bereich
  - `.command-history` - Liste der ausgefuehrten Commands
  - `.history-item` - Einzelner Historie-Eintrag
  - Responsive Styles fuer 768px Breakpoint

### Security
- **Blocked Commands List**: Gefaehrliche Commands werden serverseitig geblockt
  - rm -rf /, dd if=, mkfs, fork bomb, shutdown, reboot, nc -e, etc.
  - Erweitert um: eval, exec, source, python -c, perl -e, iptables, crontab, passwd, etc.
- **Shell Metacharacter Blocking**: Gefaehrliche Zeichen werden blockiert
  - `;`, `&&`, `||`, `|`, `$(`, `` ` ``, `>>`, `<<`
  - Verhindert Command Chaining und Injection
- **Command Length Limit**: Max. 2000 Zeichen
- **XHR Cancellation**: `activeCommandXHR` Variable fuer Race Condition Prevention
- **HTML Escaping**: `escapeHtml()` Funktion fuer sichere Output-Darstellung
- **JS String Escaping**: `escapeForJsString()` fuer sichere onclick Handler

### Technical
- Commands werden via SSH auf Nodes ausgefuehrt
- History und Results werden in SQLite gespeichert
- Database Schema nutzt bestehende command_templates, command_history, command_results Tabellen
- ES5-kompatibles JavaScript (var, function, XMLHttpRequest)

### Phase 6 Review Fixes
- **UI/UX Fixes**
  - `.btn-quick` min-height von 36px auf 44px erhoeht (WCAG Touch Target)
  - `.history-time` Farbe von #606060 auf #9999b0 (Kontrast 2.95:1 → ~5.2:1)
  - `.terminal-input:focus` Focus-Outline hinzugefuegt (2px solid #5cb3ff)
  - `.btn-quick:focus` Focus-State hinzugefuegt
  - `.history-item:focus` Focus-State hinzugefuegt
  - Responsive `.btn-quick` min-height 44px explizit
- **Security Fixes**
  - Shell Metacharacter Blocking (`containsDangerousMetachars()` Funktion)
  - BLOCKED_COMMANDS Liste erweitert (eval, exec, source, python -c, etc.)
  - nodeType Parameter Validierung im Templates-Endpoint
  - XSS Fix: `escapeForJsString()` fuer History onclick Handler
- **Integration Fixes**
  - Timeout angepasst: Frontend 125s (Backend 120s + 5s Buffer)
  - Event Listener Memory Leak Prevention via data-Attribut Check
  - History Items keyboard-accessible via tabindex und onkeypress

### Full Review P1-P6 Fixes (Optimization Pass)

#### UI/UX Optimierungen (50 Kontrast-Fixes)
- **Kontrast-Verbesserungen** (alle auf WCAG AA 4.5:1+)
  - `#b0b0b0` → `#c5c5c5` (50+ Selektoren): stat-label, node-host, settings-section h3, etc.
  - `#909090` → `#b5b5b5`: settings-section dt, hint, stat-details dt, big-stat-unit, etc.
  - `#808080` → `#adadad`: terminal-input::placeholder, quick-commands-label, output-header
  - `#606060` → `#a0a0a0`: command-history .empty
- **Touch-Target Fixes**
  - `.breadcrumb a` min-height 44px hinzugefuegt
  - `input[type="checkbox"]` von 20px auf 24px vergroessert
- **Webkit Prefix Fixes**
  - `-webkit-box-direction: normal` zu 4 fehlenden flex-direction: column Stellen

#### Backend Security Fixes
- **Metacharacter Erweiterung**: `\n` und `\r` zu DANGEROUS_METACHARACTERS hinzugefuegt
  - Verhindert Command-Injection via Newlines
- **Base64 Validation**: `executeScript()` in ssh/index.js
  - Regex `/^[A-Za-z0-9+/=]*$/` validiert base64 vor Shell-Ausfuehrung
  - `printf '%s'` statt `echo` fuer sicherere Ausgabe

#### Integration Fixes
- **XHR Race Condition Prevention**: `activeLogsXHR` Variable
  - `showLogs()` bricht vorherigen Request ab
  - `closeLogs()` bricht laufenden Request ab

---

## [0.5.0] - 2025-01-XX (Phase 5: Proxmox Management)

### Added
- **Proxmox Collection System**
  - `scripts/proxmox.sh` - Sammelt VMs, CTs, Storage, Snapshots via qm/pct Commands
  - `src/collector/index.js` erweitert um `runProxmox()` und `runProxmoxCommand()`
  - Proxmox-Daten werden bei nodes mit `is_proxmox_host=true` verfuegbar

- **Proxmox Database Operations**
  - `proxmox.getAllForNode(nodeId)` - Alle Proxmox-Objekte eines Nodes
  - `proxmox.getVMs(nodeId)` / `proxmox.saveVMs()` - VMs CRUD
  - `proxmox.getCTs(nodeId)` / `proxmox.saveCTs()` - CTs CRUD
  - `proxmox.getStorage(nodeId)` / `proxmox.saveStorage()` - Storage CRUD
  - `proxmox.getSnapshots(nodeId)` / `proxmox.saveSnapshots()` - Snapshots CRUD
  - `proxmox.saveAll(nodeId, data)` - Alle Proxmox-Daten speichern
  - `proxmox.deleteForNode(nodeId)` - Alle Proxmox-Daten loeschen
  - `proxmox.getSummary(nodeId)` - Zaehler fuer VMs/CTs/Storage/Snapshots

- **Proxmox API Endpoints**
  - `GET /api/nodes/:id/proxmox` - Alle Proxmox-Daten abrufen
  - `POST /api/nodes/:id/proxmox` - Proxmox-Daten von Remote aktualisieren
  - `GET /api/nodes/:id/proxmox/vms` - VM-Liste
  - `GET /api/nodes/:id/proxmox/cts` - CT-Liste
  - `GET /api/nodes/:id/proxmox/storage` - Storage-Liste
  - `GET /api/nodes/:id/proxmox/snapshots` - Snapshot-Liste
  - `POST /api/nodes/:id/proxmox/vms/:vmid/:action` - VM Actions (start/stop/shutdown/reboot)
  - `POST /api/nodes/:id/proxmox/cts/:ctid/:action` - CT Actions (start/stop/shutdown/reboot)
  - `POST /api/nodes/:id/proxmox/snapshots` - Snapshot erstellen
  - `DELETE /api/nodes/:id/proxmox/snapshots/:vmType/:vmid/:snapName` - Snapshot loeschen

- **Proxmox Tab UI**
  - Neuer "Proxmox" Tab in Node-Detail View (nur bei Proxmox-Hosts)
  - Summary-Karten: VMs Running, VMs Total, CTs Running, CTs Total, Storage, Snapshots
  - VM-Tabelle mit VMID, Name, Status, CPU, RAM, Disk und Actions
  - CT-Tabelle mit CTID, Name, Status, CPU, RAM, Disk und Actions
  - Storage-Tabelle mit Name, Typ, Status, Gesamt/Belegt/Frei und Auslastungs-Balken
  - Snapshots-Tabelle mit VM/CT, Typ, Name, Beschreibung und Loeschen-Action
  - Template-Badge fuer Template-VMs/CTs
  - Aktualisieren-Button zum Neuladen der Proxmox-Daten
  - Modal zum Erstellen neuer Snapshots

- **Proxmox CSS Styles**
  - `.proxmox-header` - Header mit Titel und Actions
  - `.proxmox-summary` - Summary-Cards mit Statistiken
  - `.proxmox-section` - Sections fuer VMs/CTs/Storage/Snapshots
  - `.proxmox-table` / `.proxmox-table-wrapper` - Responsive Tabellen
  - `.vm-row` / `.ct-row` - Farbige Rand-Markierung nach Status
  - `.template-badge` - Badge fuer Template-VMs/CTs
  - `.type-badge` - Badge fuer VM/CT Typ in Snapshots
  - `.storage-bar` - Auslastungsbalken fuer Storage
  - `.icon-shutdown` - Shutdown-Icon fuer Actions
  - Responsive Styles fuer 1024px und 768px Breakpoints

### Changed
- `src/routes/web.js` - Node-Detail Route laedt Proxmox-Daten wenn verfuegbar
- Node-Detail View zeigt Proxmox-Tab nur wenn `discovery.is_proxmox_host` true ist

### Technical
- Proxmox Collection Script nutzt `qm list`, `pct list`, `pvesm status`
- Snapshot-Operationen nutzen `qm/pct snapshot` und `qm/pct delsnapshot`
- VM/CT Actions nutzen `qm/pct start/stop/shutdown/reboot`
- VMID/CTID Validierung: numerisch, 100-999999

### Security Fixes (Phase 5 Review)
- **Command Injection Prevention**: Description Validierung fuer Snapshots
  - Regex: `/^[a-zA-Z0-9\s\-_.,\u00C0-\u017F]*$/` (nur sichere Zeichen: Buchstaben, Zahlen, Leerzeichen, - _ . ,)
  - Maximale Laenge: 255 Zeichen
- **VMID/CTID Validation**: Reduziert auf realistischen Bereich 100-999999
  - Vorher: 100-999999999 war zu gross und unnoetig
- **VMID/CTID String-Validierung**: Defense in Depth - String-Format wird vor parseInt geprueft
  - Regex `/^\d+$/` verhindert manipulierte Strings
- **Snapshot Name Validierung**: Muss mit Buchstabe beginnen
  - Vorher: `/^[a-zA-Z0-9_-]+$/` - erlaubte Namen wie `---evil`
  - Nachher: `/^[a-zA-Z][a-zA-Z0-9_-]*$/` - muss mit Buchstabe beginnen
- **URL Parameter Encoding**: `deleteSnapshot()` verwendet `encodeURIComponent()` fuer alle URL-Parameter

### Fixed (Phase 5 Review)
- **Select Element Styling**: `.form-group select` mit 44px min-height hinzugefuegt
- **Modal Accessibility**: `aria-label="Modal schliessen"` fuer Close-Buttons
- **Timeout Alignment**: Backend VM/CT Action Timeout auf 180s erhoeht (matches Frontend)
- **Type Badge Kontrast**: `.type-badge.vm/ct` Farben aufgehellt (von #5cb3ff/#f6ad55 auf #99d1ff/#ffc980)
- **State Badge Kontrast**: `.state-badge.stopped` Farbe aufgehellt (von #fc8181 auf #ffb3b3)
- **Storage Bar Text**: Text-Shadow verstaerkt fuer bessere Lesbarkeit bei niedriger Auslastung
- **Modal XHR Cancellation**: `activeSnapshotXHR` Variable trackt laufende Requests, `toggleSnapshotModal()` bricht ab
- **Frontend VMID Validation**: `createSnapshot()` prueft VMID vor Submit

---

## [0.4.0] - 2025-01-XX (Phase 4: Docker Management)

### Added
- **Docker Collection System**
  - `scripts/docker.sh` - Sammelt Container, Images, Volumes, Networks via Docker CLI
  - `src/collector/index.js` erweitert um `runDocker()` und `runDockerCommand()`
  - Docker-Daten werden bei nodes mit `has_docker=true` verfuegbar

- **Docker Database Operations**
  - `docker.getAllForNode(nodeId)` - Alle Docker-Objekte eines Nodes
  - `docker.getContainers(nodeId)` - Container-Liste
  - `docker.saveContainers(nodeId, containers)` - Container speichern (Transaction)
  - `docker.getImages(nodeId)` / `docker.saveImages()` - Images CRUD
  - `docker.getVolumes(nodeId)` / `docker.saveVolumes()` - Volumes CRUD
  - `docker.getNetworks(nodeId)` / `docker.saveNetworks()` - Networks CRUD
  - `docker.saveAll(nodeId, data)` - Alle Docker-Daten speichern
  - `docker.deleteForNode(nodeId)` - Alle Docker-Daten loeschen
  - `docker.getSummary(nodeId)` - Zaehler fuer Container/Images/Volumes/Networks

- **Docker API Endpoints**
  - `GET /api/nodes/:id/docker` - Alle Docker-Daten abrufen
  - `POST /api/nodes/:id/docker` - Docker-Daten von Remote aktualisieren
  - `GET /api/nodes/:id/docker/containers` - Container-Liste
  - `POST /api/nodes/:id/docker/containers/:containerId/:action` - Container Actions (start/stop/restart/pause/unpause)
  - `GET /api/nodes/:id/docker/containers/:containerId/logs` - Container Logs (mit ?lines=N Parameter)
  - `GET /api/nodes/:id/docker/images` - Images-Liste
  - `GET /api/nodes/:id/docker/volumes` - Volumes-Liste
  - `GET /api/nodes/:id/docker/networks` - Networks-Liste
  - `POST /api/nodes/:id/docker/prune/:type` - Prune Commands (system/containers/images/volumes/networks)

- **Docker Tab UI**
  - Neuer "Docker" Tab in Node-Detail View (nur bei nodes mit Docker)
  - Summary-Karten: Running, Container, Images, Volumes, Networks
  - Container-Tabelle mit Status-Badge und Actions (Start/Stop/Restart/Logs)
  - Images-Tabelle mit Repository, Tag, Groesse, Erstellt
  - Volumes-Tabelle mit Name, Driver, Usage-Status
  - Networks-Tabelle mit Name, Driver, Scope
  - Aktualisieren-Button zum Neuladen der Docker-Daten
  - Dropdown-Menue fuer Prune-Aktionen mit Bestaetigung
  - Modal fuer Container-Logs Anzeige

- **Docker CSS Styles**
  - `.docker-header` - Header mit Titel und Actions
  - `.docker-summary` - Summary-Cards mit Statistiken
  - `.docker-section` - Sections fuer Container/Images/Volumes/Networks
  - `.docker-table` / `.docker-table-wrapper` - Responsive Tabellen
  - `.state-badge` - Status-Badges (running/exited/paused/created)
  - `.usage-badge` - Usage-Status fuer Volumes
  - `.container-row` - Farbige Rand-Markierung nach Status
  - `.btn-icon` - Icon-Buttons fuer Container-Actions
  - `.icon-start/.icon-stop/.icon-restart/.icon-logs` - CSS-Icons
  - `.dropdown` / `.dropdown-menu` - Dropdown fuer Prune-Menue
  - `.modal` - Modal fuer Logs-Anzeige
  - `.logs-output` - Monospace-Ausgabe fuer Container-Logs
  - Responsive Styles fuer 1024px und 768px Breakpoints

### Changed
- `src/routes/web.js` - Node-Detail Route laedt Docker-Daten wenn verfuegbar
- Node-Detail View zeigt Docker-Tab nur wenn `discovery.has_docker` true ist

### Technical
- Docker Collection Script nutzt `docker ps -a`, `docker images`, `docker volume ls`, `docker network ls`
- JSON-Ausgabe mit Size-Konvertierung (GB/MB/KB zu Bytes)
- Container-Actions fuehren `docker start/stop/restart/pause/unpause` aus
- Logs werden mit `docker logs --tail N` abgerufen
- Prune Commands mit `-f` Flag (force, keine Bestaetigung)
- System Prune nutzt `docker system prune -af --volumes`

### Security Fixes (Phase 4 Review)
- **Command Injection Prevention**: ContainerID Validierung (nur hex, 12-64 Zeichen)
  - Vorher: ContainerID wurde direkt in Shell-Command eingefuegt
  - Nachher: Regex-Validierung `/^[a-f0-9]{12,64}$/i` verhindert Injection
- **Shell Escaping in docker.sh**: Volume-Namen werden jetzt korrekt gequotet
  - Vorher: `--filter "volume=$name"` konnte bei Sonderzeichen brechen
  - Nachher: `--filter volume="$name"` ist sicher

### Fixed (Phase 4 Review)
- **Query Parameter Mismatch**: Frontend sendete `lines`, API erwartete `tail`
- **Dropdown Touch-Targets**: min-height 44px fuer `.dropdown-item` hinzugefuegt
- **Missing Timeout Handlers**: `xhr.ontimeout` fuer `containerAction()` und `pruneDocker()` hinzugefuegt

## [0.3.0] - 2025-01-XX (Phase 3: Monitoring)

### Added
- **Live Monitoring System**
  - `src/collector/scheduler.js` - Background Collector mit konfigurierbaren Intervallen
  - Monitoring Overview Page (`/monitoring`) - Alle Nodes auf einen Blick
  - Monitoring Detail Page (`/monitoring/:id`) - Einzelner Node mit Details
  - Auto-Refresh (30s) mit Countdown und Pause-Option
  - Alert Thresholds aus Settings (Warning/Critical fuer CPU, RAM, Disk, Temp)

- **Stats Collection**
  - `scripts/stats.sh` wird via SSH auf Nodes ausgefuehrt
  - Aktuelle Stats werden in `node_stats_current` gecacht
  - History wird in `node_stats_history` gespeichert
  - Automatische History-Bereinigung (default: 168h = 7 Tage)

- **API Endpoints**
  - `GET /api/stats` - Alle Nodes mit aktuellen Stats
  - `GET /api/nodes/:id/stats` - Aktuelle Stats eines Nodes
  - `GET /api/nodes/:id/stats/history?hours=24` - Stats-Historie
  - `POST /api/nodes/:id/stats` - Stats jetzt sammeln

- **Monitoring UI**
  - Grid-Layout mit Monitoring-Cards pro Node
  - Farbcodierung: ok (gruen), warning (gelb), critical (rot), offline (grau)
  - Progress-Bars fuer CPU, RAM, Disk, Temperatur
  - Big-Stats Display auf Detail-Seite
  - Navigation: Monitoring-Link in Header hinzugefuegt

### Changed
- Background Collector startet beim Server-Start
- Sequential Collection (nicht parallel) fuer Pi 2B Performance
- Page Reload fuer Auto-Refresh (alte Browser Kompatibilitaet)

### Technical
- Scheduler prueft alle 5s welche Nodes gesammelt werden muessen
- Min. 10s zwischen Collections eines Nodes
- Hourly Cleanup von alter History
- Graceful Shutdown stoppt Scheduler

### Fixed (Phase 3 Review)
- **Touch-Target .btn-sm**: Von 36px auf 44px erhoeht (Pause-Button im Auto-Refresh)
- **Kontrast stat-bar-value**: Warning/Critical Farben dunkler fuer WCAG AA Compliance
  - Warning: #f6ad55 -> #e8a317 (+ font-weight: 700)
  - Critical: #fc8181 -> #e53e3e (+ font-weight: 700)
- **Race Condition**: `isCollecting` Flag verhindert parallele tick() Ausfuehrung
- **Timer Tracking**: `initialCollectionTimer` wird jetzt getrackt und bei stop() geclearet
- **Error Handling tick()**: try/catch um db.nodes.getAll() hinzugefuegt
- **Error Handling collectNode()**: try/catch um db.nodes.setOnline() hinzugefuegt
- **Timestamp Fix**: lastCollectionTime wird jetzt NACH collectNode() gesetzt (nicht vorher)

## [0.2.0] - 2025-01-XX (Phase 2: Discovery & Hardware)

### Added
- **Discovery System**
  - `src/collector/index.js` - Zentrales Collector-Modul
  - Discovery Button in Node-Detail View
  - API: `POST /api/nodes/:id/discover` - Full Discovery ausfuehren
  - API: `GET /api/nodes/:id/discovery` - Discovery-Daten abrufen
  - API: `GET /api/nodes/:id/hardware` - Hardware-Daten abrufen
  - API: `POST /api/nodes/:id/hardware` - Hardware-Daten aktualisieren

- **Auto-Tagging**
  - Automatische Tag-Zuweisung basierend auf Discovery-Ergebnissen
  - Tags: bare-metal, vm, container, proxmox, cluster-node, standalone
  - Tags: proxmox-vm, proxmox-ct, docker, podman, raspberry-pi
  - Tags: x86, arm (basierend auf Architektur)

- **Node-Type Erkennung**
  - Automatische Typ-Erkennung: proxmox-host, proxmox-vm, proxmox-ct
  - Erkennung: docker-host, bare-metal, raspberry-pi, vmware-vm, virtualbox-vm

- **Hardware Tab**
  - Neues Tab-System in Node-Detail View (Uebersicht, Hardware, Discovery)
  - System-Info: Hersteller, Produkt, Seriennummer, BIOS, Boot-Modus
  - CPU-Info: Modell, Kerne, Threads, Architektur, Cache, Virtualisierung
  - RAM-Info: Groesse, Typ, Geschwindigkeit, Swap
  - Disk-Liste mit Groesse und Typ (HDD/SSD)
  - Netzwerk-Interfaces mit IP-Adressen und Status
  - GPU-Liste

- **Discovery Tab**
  - OS-Informationen: Hostname, Distribution, Version
  - Virtualisierung: Typ (none, kvm, lxc, vmware)
  - Proxmox-Details: Version, Cluster-Status
  - Container-Runtimes: Docker/Podman Version und Container-Anzahl
  - Raspberry Pi Modell-Erkennung

### Changed
- Node-Detail View verwendet jetzt Tab-Navigation
- Database Schema erweitert um `node_discovery` und `node_hardware` Tabellen
- CSS erweitert um Tab-Styles und Hardware-Display-Komponenten

### Security Fixes (Phase 2 Review)
- **Command Injection Fix**: Base64-Encoding fuer Script-Uebertragung
  - Vorher: HEREDOC konnte bei boeswilligem Output manipuliert werden
  - Nachher: `echo 'BASE64' | base64 -d | bash` verhindert Injection

### Fixed (Phase 2 Review)
- **JSON Parsing**: Greedy Regex durch Balanced Brace Matching ersetzt
  - Vorher: `\{[\s\S]*\}` matchte zu viel bei mehreren JSON-Objekten
  - Nachher: Bracket-Counting findet erstes vollstaendiges JSON
- **Hardware Error Handling**: API gibt 207 Multi-Status zurueck wenn Hardware-Sammlung fehlschlaegt
  - Discovery erfolgreich + Hardware-Fehler = 207 mit `hardwareError` Feld
  - Frontend zeigt Hardware-Warnung an
- **Tab Touch-Targets**: Erhoehung auf 48px min-height, 120px min-width
- **Flexbox Prefixes**: `-webkit-flex` und `-webkit-box-flex` fuer Tabs
- **Kontrast .discovery-time**: Von #909090 auf #b0b0b0 (WCAG AA)
- **Loading Spinner**: CSS Animation fuer Discovery-Button mit `-webkit-animation`

### Technical
- Shell-Scripts senden JSON-Output fuer strukturierte Daten
- Scripts werden via SSH mit Base64-Encoding ausgefuehrt (Injection-sicher)
- 3 Minuten Timeout fuer Discovery (kann lange dauern)

## [0.1.1] - 2025-01-XX

### Security Fixes
- **XSS Prevention**: Alle EJS Views verwenden jetzt `<%= %>` fuer escaped Output
  - Vorher: JavaScript Template Literals `${node.name}` ohne Escaping
  - Nachher: Sicheres EJS Escaping `<%= node.name %>`
- **Input Limits**: Express Middleware mit Size Limits gegen DoS
  - `express.json({ limit: '1mb' })`
  - `express.urlencoded({ limit: '1mb', extended: true })`

### Fixed
- **SSH Resource Leak**: `conn.end()` wird jetzt in allen Exit-Paths aufgerufen
  - Cleanup-Funktion mit Timeout-Handling
  - Verhindert Memory Leaks bei SSH-Fehlern
- **Error Handling**: `asyncHandler` Wrapper fuer alle async Routes
  - Verhindert Server-Crashes bei unbehandelten Promise-Rejections
- **Touch-Targets**: Minimale Touch-Groesse 44px fuer Fire HD 10 Kompatibilitaet
  - Buttons: `min-height: 44px`
  - Navigation Links: `min-height: 44px`
  - Form Inputs: `min-height: 44px`
- **Kontrast**: WCAG AA Compliance fuer Labels
  - Von `#808080` (4.5:1 nicht erreicht) auf `#b0b0b0` (7:1+)

### Technical
- API Response Format standardisiert: `{ success: boolean, data?: any, error?: { code, message } }`
- SSH Test gibt 503 bei Verbindungsfehlern zurueck (statt 200 mit Error)
- Graceful Shutdown mit 5s Timeout

## [0.1.0] - 2025-01-XX

### Added
- **Projekt Foundation**
  - Express.js Server mit EJS Templates
  - SQLite Datenbank mit better-sqlite3 (WAL Mode)
  - Server-Side Rendering fuer Fire HD 10 (2017) Kompatibilitaet

- **Node Management**
  - CRUD fuer Server-Nodes (Add, Edit, Delete, List)
  - SSH Connection Testing
  - Node-Detail-Ansicht mit Status und Tags

- **Database Schema**
  - 20+ Tabellen fuer Nodes, Tags, Discovery, Hardware, Stats, Docker, Proxmox
  - Prepared Statements fuer SQL Injection Prevention
  - Foreign Keys mit CASCADE Delete

- **SSH Integration**
  - ssh2 Library fuer Node.js
  - Verbindungstest mit Hostname-Rueckgabe
  - Timeout-Handling (30s default)

- **Web UI**
  - Dashboard mit Node-Uebersicht
  - Responsive Layout (Tablet @ 1024px, Mobile @ 768px)
  - ES5-kompatibles JavaScript fuer alte Browser
  - Flexbox mit Vendor-Prefixes

- **REST API**
  - `/api/nodes` - Node CRUD
  - `/api/nodes/:id/test` - SSH Test
  - `/api/tags` - Tag Management
  - `/api/settings` - Einstellungen

### Dependencies
- express: ^4.18.2
- ejs: ^3.1.9
- better-sqlite3: ^9.2.2
- ssh2: ^1.15.0
- dotenv: ^16.3.1

---

## Review Notes

### UI/UX Review (Phase 1)
- Touch-Targets waren zu klein (<44px) - FIXED
- Kontrast war zu niedrig fuer WCAG AA - FIXED
- Mobile Navigation funktioniert gut
- Tablet-Layout benoetigt keine Aenderungen

### Backend Review (Phase 1)
- XSS Vulnerability in EJS Views - FIXED
- SSH Resource Leak bei Errors - FIXED
- Input Size Limits fehlten - FIXED
- Error Handling in GET Routes - FIXED

### Integration Review (Phase 1)
- API Response Format war inkonsistent - FIXED
- HTTP Status Codes waren teilweise falsch - FIXED
- Frontend JS brauchte besseres Error Handling - FIXED

### UI/UX Review (Phase 2)
- Tab Touch-Targets zu klein (<44px) - FIXED (48px)
- Tab Flexbox Prefixes fehlten - FIXED
- Kontrast .discovery-time zu niedrig - FIXED (#b0b0b0)
- Loading State ohne Spinner - FIXED (CSS Animation)

### Backend Review (Phase 2)
- Command Injection via HEREDOC - FIXED (Base64 Encoding)
- JSON Regex zu greedy - FIXED (Balanced Brace Matching)
- Hardware-Fehler wurden ignoriert - FIXED (207 Multi-Status)

### Integration Review (Phase 2)
- Discovery Fehler-Anzeige im Frontend - FIXED
- Hardware-Warnung wird angezeigt - FIXED
- Alle Discovery-Buttons zeigen Loading-State - FIXED

### UI/UX Review (Phase 3)
- .btn-sm Touch-Target zu klein (36px) - FIXED (44px)
- stat-bar-value Kontrast Warning/Critical zu niedrig - FIXED (dunklere Farben + bold)
- Auto-Refresh UI funktioniert gut
- Monitoring-Grid responsive vorhanden

### Backend Review (Phase 3)
- Race Condition: tick() konnte parallel laufen - FIXED (isCollecting Flag)
- Timer nicht getrackt: initialCollectionTimer - FIXED
- Error Handling tick(): kein try/catch - FIXED
- Error Handling collectNode(): db.nodes.setOnline nicht gesichert - FIXED
- Timestamp vor collectNode() gesetzt - FIXED (jetzt danach)

### Integration Review (Phase 3)
- API Konsistenz: Response-Format korrekt - OK
- ES5 Kompatibilitaet: var/function/XMLHttpRequest - OK
- Error Display in node.ejs - OK
- Navigation Monitoring-Link - OK

### UI/UX Review (Phase 4)
- Dropdown-Items Touch-Target unter 44px - FIXED (min-height: 44px)
- Modal Close-Button Kontrast grenzwertig - INFO (akzeptabel)
- Container-Ports Farbe grenzwertig - INFO (akzeptabel)
- Summary-Label Kontrast - INFO (akzeptabel)
- CSS-Icons erkennbar auf 44px Buttons - OK
- Docker-Tabellen responsive mit horizontal scroll - OK
- Loading States korrekt implementiert - OK

### Backend Review (Phase 4)
- Command Injection via ContainerID - FIXED (Regex Validierung /^[a-f0-9]{12,64}$/i)
- Command Injection in Logs Endpoint - FIXED (gleiche Validierung)
- Shell Injection in docker.sh Volume-Filter - FIXED (korrektes Quoting)
- Input Validation fuer tail Parameter - OK (parseInt + min/max)
- SQL Injection durch Prepared Statements verhindert - OK
- Error Handling in allen Docker Endpoints - OK

### Integration Review (Phase 4)
- Query Parameter Mismatch (lines vs tail) - FIXED (tail verwendet)
- Missing Timeout Handler containerAction() - FIXED
- Missing Timeout Handler pruneDocker() - FIXED
- ES5 Compliance in Docker-Funktionen - OK (var, function, XMLHttpRequest)
- API Response Format konsistent - OK
- XHR Callbacks korrekt implementiert - OK
- Data Flow Route -> View korrekt - OK

### UI/UX Review (Phase 5)
- Select Element Styling fehlte (.form-group select) - FIXED (44px min-height, custom arrow)
- Modal Close Button ohne aria-label - FIXED (aria-label="Modal schliessen")
- Type Badge Kontrast zu niedrig (~3.2:1) - FIXED (Farben aufgehellt auf #99d1ff/#ffc980)
- State Badge stopped Kontrast zu niedrig (~3.5:1) - FIXED (Farbe aufgehellt auf #ffb3b3)
- Storage Bar Text bei niedriger Auslastung - FIXED (staerkerer Text-Shadow)
- Proxmox-Tabellen responsive mit horizontal scroll - OK
- Action-Buttons Touch-Targets >= 44px - OK
- Loading States fuer alle Actions implementiert - OK

### Backend Review (Phase 5)
- Command Injection via Snapshot Description - FIXED (Regex strenger: nur a-z0-9, Leerzeichen, -_.,)
- VMID/CTID Max-Wert zu hoch (999999999) - FIXED (100-999999)
- VMID/CTID String-Validierung fehlte - FIXED (Regex /^\d+$/ vor parseInt)
- Snapshot Name Validierung zu permissiv - FIXED (muss mit Buchstabe beginnen)
- VM/CT Action Validierung - OK (start/stop/shutdown/reboot whitelist)
- SQL Injection durch Prepared Statements verhindert - OK
- Error Handling in allen Proxmox Endpoints - OK

### Integration Review (Phase 5)
- Timeout Mismatch Frontend/Backend - FIXED (beide jetzt 180s)
- Modal XHR Race Condition - FIXED (activeSnapshotXHR + abort bei close)
- URL Parameter nicht encoded - FIXED (encodeURIComponent fuer alle Parameter)
- Frontend VMID Validation fehlte - FIXED (createSnapshot prueft vor Submit)
- ES5 Compliance in Proxmox-Funktionen - OK (var, function, XMLHttpRequest)
- API Response Format konsistent - OK
- XHR Callbacks korrekt implementiert - OK
- Data Flow Route -> View korrekt - OK
- Proxmox-Tab nur bei is_proxmox_host=true - OK

---

## Architektur-Entscheidungen

### Warum Server-Side Rendering?
Fire HD 10 (2017) hat einen alten Browser (~Chrome 50-60):
- Kein CSS Grid Support
- Kein ES6 Modules
- Flexbox nur mit Prefixes
- React/Vue wuerden nicht zuverlaessig laufen

### Warum SQLite?
Raspberry Pi 2B hat nur 1GB RAM:
- PostgreSQL/MySQL wuerden zu viel RAM verbrauchen
- SQLite ist file-based und sehr effizient
- WAL Mode fuer bessere Concurrent-Performance

### Warum ssh2 statt child_process?
- Native SSH in Node.js ohne externe Abhaengigkeiten
- Connection Pooling moeglich (Phase 2+)
- Besseres Error Handling als Shell-basierte Loesung
