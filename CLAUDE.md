# NodePulse - Projekt-Kontext

## Testumgebung

**Raspberry Pi 2B (Testserver):**
- URL: `http://pi.2b:3000/` oder `http://192.168.178.63:3000/`
- SSH: `lance@192.168.178.63`
- NodePulse läuft als systemd Service

**Entwicklung:** Windows
**Zielplattform:** Linux (Debian-basiert)

## Test-Workflow

Da wir auf Windows entwickeln aber auf Linux testen:

```bash
# 1. Änderungen committen und pushen (Windows)
git add -A && git commit -m "..." && git push

# 2. Auf Pi pullen und Service neustarten
ssh lance@192.168.178.63
cd nodepulse && git pull && sudo systemctl restart nodepulse

# Oder als Einzeiler:
ssh lance@192.168.178.63 "cd nodepulse && git pull && sudo systemctl restart nodepulse"
```

## ES5-Kompatibilität

Der Pi 2B hat einen alten Browser (Chrome 50+). JavaScript muss ES5-kompatibel sein:
- Kein `const`/`let` → `var`
- Keine Arrow Functions → `function() {}`
- Kein `Promise.finally()` → `.then().catch()`
- Kein Template Literals → String-Concatenation

## Wichtige Pfade

- CSS Module: `src/public/css/modules/`
- JS Module: `src/public/js/detail/`
- Views: `src/views/`
- DB Entities: `src/db/entities/`

## Build-Befehle

```bash
npm run build:css    # CSS Module zusammenführen
npm run build:js     # JS Module zusammenführen (detail-page.js)
```

## Code-Review Team

10 spezialisierte Subagents in `.claude/agents/` für Code-Analyse:

| Agent | Spitzname | Spezialisierung | Model |
|-------|-----------|-----------------|-------|
| spock | Spock auf Koks | Logik, Conditionals, Dead Code | sonnet |
| petra | Pattern-Petra | Architektur, SOLID, Modulstruktur | opus |
| bernd | Benchmark-Bernd | Performance, Big-O, Memory | opus |
| paul | Paranoid-Paul | Security, Injection, Secrets | opus |
| queen | Query-Queen | SQL, N+1, Indizes | sonnet |
| chad | CSS-Chad | Frontend, ES5, Touch-Targets | sonnet |
| carla | Coverage-Carla | Tests, Edge Cases | sonnet |
| klaus | Comment-Klaus | Naming, Dokumentation | sonnet |
| alex | Algorithm-Alex | Datenstrukturen, Komplexität | opus |
| ralf | Refactor-Ralf | Code Smells, DRY, KISS | sonnet |

**Nutzung:**
```
Lass Paul mal über die API-Routes schauen
Nutze bernd für Performance-Analyse des Collectors
Queen, check die Stats-Queries
```
