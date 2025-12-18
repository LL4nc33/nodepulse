# Changelog

Alle bemerkenswerten Änderungen an diesem Projekt werden in dieser Datei dokumentiert.

Das Format basiert auf [Keep a Changelog](https://keepachangelog.com/de/1.0.0/).

---

## [0.5.0] - 2025-12-18

### Added - Task History & Logs

- **Tasks Tab** für Proxmox-Hosts
  - Summary-Cards: Gesamt, Laufend, Erfolgreich, Fehler
  - Tasks-Tabelle mit Typ, VMID, User, Status, Startzeit, Dauer
  - Server-side Pagination (10 pro Seite)
  - Filter nach Task-Typ und Status
  - Task Log Modal mit Live-Updates
  - Stop-Button für laufende Tasks

- **Cluster-weite Task Discovery**
  - Sammelt Tasks von `/cluster/tasks` (alle Nodes)
  - Filtert nach Node-Name für Node-spezifische Ansicht
  - UPID-basierte Task-Identifikation

- **Task API**
  - `GET /api/nodes/:id/tasks` - Task-Liste mit Pagination
  - `GET /api/nodes/:id/tasks/:upid/log` - Live Task-Log
  - `GET /api/nodes/:id/tasks/:upid/status` - Task Status
  - `POST /api/nodes/:id/tasks/refresh` - Discovery ausführen
  - `DELETE /api/nodes/:id/tasks/:upid` - Task stoppen

### Fixed - Storage Tab

- **Thin Pool Erkennung** - VM-Disks werden nicht mehr als Thin Pools angezeigt
- **VG Status** - Zeigt enthaltene registrierte Thin Pools (z.B. "local-lvm")
- **Proxmox Storage Config Parser** - Python-basiert für robustes Parsing
- **LV Registration** - UPSERT statt DELETE+INSERT erhält registered_storage_id

---

## [0.4.5] - 2025-12-18

### Added - Backup & Restore

- **Backup Tab** für Proxmox-Hosts
  - Summary: Backup-Count, Gesamt-Größe, Storage-Count
  - Backup Storages mit Kapazitaet und Auslastung
  - Backups-Tabelle mit VMID, Typ, Größe, Alter
  - Backup erstellen (vzdump) mit Mode/Compression Optionen
  - Backup löschen mit Bestätigung
  - VM/CT wiederherstellen

- **Backup API**
  - `GET /api/nodes/:id/backup` - Alle Backup-Daten
  - `POST /api/nodes/:id/backup/create` - Backup erstellen
  - `DELETE /api/nodes/:id/backup/:volid` - Backup löschen
  - `POST /api/nodes/:id/backup/restore` - Wiederherstellen

---

## [0.4.4] - 2025-12-18

### Added - LVM Storage Management

- **Storage Tab** für Proxmox-Hosts
  - Volume Groups mit Auslastung und Proxmox-Status
  - Thin Pools mit Data-Percent
  - Physical Volumes und Logical Volumes Listen
  - Verfügbare Disks für VG-Erstellung

- **Storage Operationen**
  - VG erstellen aus freien Disks
  - Thin Pool in VG erstellen
  - In Proxmox registrieren (lvm/lvmthin)
  - Aus Proxmox entfernen
  - VG/Thin Pool löschen (mit Bestätigung)

- **Storage API**
  - `GET /api/nodes/:id/storage/lvm` - Alle LVM-Daten
  - `POST /api/nodes/:id/storage/lvm/vg` - VG erstellen
  - `POST /api/nodes/:id/storage/lvm/thinpool` - Thin Pool erstellen
  - `POST /api/nodes/:id/storage/lvm/register` - In Proxmox registrieren

---

## [0.4.2] - 2025-12-18

### Added - Design System

- **CSS Design-System Variablen**
  - Spacing Scale, Typography Scale, Border Radius
  - Einheitliche Transitions und Colors

- **Progress-Bar Komponente**
  - 3 Varianten: mini, standard, large
  - Threshold-basierte Farbcodierung
  - Offline-State Support

---

## [0.4.1] - 2025-12-18

### Fixed - Security & Stability

- **Command Injection Prevention** - Network Target Validation
- **XSS Fixes** - JSON.stringify() für onclick Handler
- **Path Traversal Prevention** - Snapshot-Namen Validierung
- **ES5 Compatibility** - Promise.finally() entfernt (12 Stellen)
- **SSH Connection Leaks** - Sauberes Cleanup bei stop()

---

## [0.4.0] - 2025-12-17

### Added - TOON Format & Performance

- **TOON Format v1.0** (Token-Oriented Object Notation)
  - 81% Response-Size-Reduktion
  - 4x schnelleres Parsing
  - ES5-kompatibel

- **Circuit Breaker Pattern**
  - Verhindert SSH-Spam bei Offline-Nodes
  - 3-State-Machine: closed → open → half-open

- **Safe Storage Wrapper**
  - LRU-Eviction für Fire HD 10 localStorage
  - 2 MB Safe-Limit

- **DB-Optimierung**
  - VMs/Container-Counts ohne SubQueries
  - 30-50% Performance-Gewinn

---

## [0.3.3] - 2025-12-17

### Added

- **System Health-Check** - APT Updates, Kernel, Reboot-Required
- **Proxmox Repository Management** - Enterprise <-> No-Subscription
- **Hardware-Discovery erweitert** - Thermal, Power, SMART, Network

### Changed

- **CSS Modularisierung** - 11 Module mit Build-System
- **JavaScript Modularisierung** - 7 Module für detail-page.js
- **API Modularisierung** - 11 Route-Module

---

## [0.3.2] - 2025-12-16

### Added

- **NP.* JavaScript-Bibliothek**
  - `NP.API` - Promise-basierter API-Client
  - `NP.UI` - Alerts, Loading States, Toasts
  - `NP.Tabs` - Tab-System mit URL-Hash Persistenz

- **Einheitliche CSS-Komponenten**
  - Loading Overlays, Alerts, Toasts, Badges
  - Tabs, Cards, Tables, Forms
  - Empty States

---

## [0.3.0] - 2025-12-16

### Added

- **Live Monitoring System**
  - Background Collector mit konfigurierbaren Intervallen
  - Auto-Refresh mit Countdown
  - Alert Thresholds aus Settings

- **Stats Collection**
  - Aktuelle Stats in `node_stats_current`
  - History in `node_stats_history`
  - Automatische Bereinigung

---

## [0.2.0] - 2025-12-15

### Added

- **Discovery System**
  - Automatische Hardware-Erkennung
  - Node-Type Bestimmung (Proxmox, Docker, Bare-Metal, RPi)
  - Auto-Tagging basierend auf Discovery

- **Hardware Tab**
  - System-Info, CPU, RAM, Disks, Network, GPU

- **Discovery Tab**
  - OS-Info, Virtualisierung, Container-Runtimes

---

## [0.1.0] - 2025-12-14

### Added

- **Projekt Foundation**
  - Express.js Server mit EJS Templates
  - SQLite Datenbank mit better-sqlite3
  - Server-Side Rendering für Fire HD 10 (2017)

- **Node Management**
  - CRUD für Server-Nodes
  - SSH Connection Testing
  - Tag-System

- **Web UI**
  - Dashboard mit Node-Übersicht
  - Responsive Layout
  - ES5-kompatibles JavaScript

- **REST API**
  - `/api/nodes` - Node CRUD
  - `/api/tags` - Tag Management
  - `/api/settings` - Einstellungen

---

## Architektur-Entscheidungen

### Warum Server-Side Rendering?
Fire HD 10 (2017) hat einen alten Browser (~Chrome 50-60) - React/Vue wuerden nicht zuverlaessig laufen.

### Warum SQLite?
Raspberry Pi 2B hat nur 1GB RAM - PostgreSQL/MySQL wuerden zu viel verbrauchen.

### Warum ssh2 statt child_process?
Native SSH in Node.js ohne externe Abhaengigkeiten, besseres Error Handling.
