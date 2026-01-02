# Session 2026-01-02: Go Agent & Frontend Bug-Fix

## Zusammenfassung

Diese Session umfasste zwei Hauptaufgaben:
1. **Go Agent fertigstellen und testen** - Der Agent für Push-basierte Metriken
2. **Frontend Bug-Fix** - Fehlende Edit-Panel-Funktionen implementieren

---

## Teil 1: Go Agent

### Was wurde gemacht

Der Go Agent wurde erfolgreich auf dem Raspberry Pi 2B getestet:

```
[INFO] Connected to server
[INFO] Received welcome from server
[DEBUG] Sent metrics: CPU=2.1%, RAM=24.4%, Disk=29.1%
```

### Dateien erstellt (agent/)

| Datei | Beschreibung |
|-------|-------------|
| `cmd/nodepulse-agent/main.go` | Entry Point, Signal Handler |
| `internal/config/config.go` | Config Reader für JSON |
| `internal/logger/logger.go` | Level-basierter Logger |
| `internal/collector/collector.go` | Metrics-Aggregation |
| `internal/collector/cpu.go` | CPU-Usage via /proc/stat |
| `internal/collector/memory.go` | RAM via /proc/meminfo |
| `internal/collector/disk.go` | Disk via syscall.Statfs |
| `internal/collector/network.go` | Network via /proc/net/dev |
| `internal/collector/loadavg.go` | Load via /proc/loadavg |
| `internal/collector/temperature.go` | Temp via thermal_zone |
| `internal/collector/uptime.go` | Uptime via /proc/uptime |
| `internal/collector/processes.go` | Process count |
| `internal/websocket/client.go` | WebSocket Client |
| `internal/websocket/reconnect.go` | Exponential Backoff |
| `Makefile` | Cross-Compilation für 4 Architekturen |
| `go.mod` | Go Module Definition |

### Build-Targets

```bash
make build-amd64   # x86_64 Server
make build-arm64   # Pi 4, moderne ARM
make build-armv7   # Pi 3, Pi 2 v1.2
make build-armv6   # Pi 2B, Pi 1, Pi Zero (KRITISCH!)
```

### Test-Ergebnis

- Agent verbindet sich erfolgreich zum WebSocket-Server
- API-Key Authentifizierung funktioniert
- Metriken werden empfangen und in DB gespeichert
- Agent noch nicht als systemd-Service installiert

### Debug-API hinzugefügt

Neue Route für einfaches Testing ohne SSH-Installation:

```
POST /api/nodes/:nodeId/agent/enable-debug
```

Generiert API-Key und gibt Config zurück.

---

## Teil 2: Frontend Bug-Fix

### Problem

```
Uncaught ReferenceError: openEditPanel is not defined
```

Die Edit-Panel-Funktionen wurden nie implementiert - sie wurden im HTML aufgerufen aber existierten nirgendwo im JavaScript.

### Fehlende Funktionen

| Funktion | Zweck |
|----------|-------|
| `openEditPanel()` | Öffnet das Edit-Panel |
| `closeEditPanel()` | Schließt das Edit-Panel |
| `saveNode(event)` | Speichert Node via API |
| `toggleMonitoring()` | Schaltet Monitoring an/aus |
| `deleteNode(id, name)` | Löscht Node mit Bestätigung |

### Lösung

**Neues Modul erstellt:** `src/public/js/detail/edit-panel.js`

Enthält alle fehlenden Funktionen in ES5-kompatiblem Code (Chrome 50+ Support).

### Geänderte Dateien

| Datei | Änderung |
|-------|----------|
| `src/public/js/detail/edit-panel.js` | **NEU** - 206 Zeilen |
| `scripts/build-detail-js.js` | Modul zur Build-Liste |
| `src/public/js/main.js` | ESC-Handler erweitert |
| `src/public/js/detail-page.js` | Neu gebaut (5051 Zeilen) |

---

## Teil 3: Weitere Fixes

### SSH CompressionLevel Option entfernt

```
Unsupported option "compressionlevel"
```

Die Option `CompressionLevel` ist in neueren OpenSSH-Versionen deprecated.

**Fix:** `src/ssh/control-master.js` - Zeile entfernt

---

## Commits

```
88cea65 fix: Fehlende Edit-Panel-Funktionen implementiert
1bc0c9c fix: Veraltete SSH-Option CompressionLevel entfernt
d59b187 feat: Debug-Route für Agent-Aktivierung ohne SSH
0f81b3f feat: NodePulse Go Agent - Vollständige Implementierung
```

---

## Offene Tasks

1. **Agent als systemd-Service installieren** auf Pi 2B
2. **Agent-Optionen im Sidepanel** statt separate Seite (Nice-to-have)
3. **GitHub Release erstellen** mit 4 Agent-Binaries
4. **sshpass installieren** auf Pi für SSH-Fallback

---

## Test-Befehle

### Auf dem Pi:

```bash
# Code aktualisieren
cd ~/nodepulse && git pull && sudo systemctl restart nodepulse

# Agent manuell testen
~/nodepulse/agent/dist/nodepulse-agent-linux-armv6 -config /tmp/agent-test.json

# Agent als Service installieren (TODO)
sudo cp ~/nodepulse/agent/dist/nodepulse-agent-linux-armv6 /opt/nodepulse-agent/nodepulse-agent
```

### API testen:

```bash
# Agent aktivieren (Debug)
curl -X POST http://192.168.178.63:3000/api/nodes/5/agent/enable-debug

# Node-API testen
curl http://192.168.178.63:3000/api/nodes/5
```
