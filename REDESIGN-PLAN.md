# nodepulse Redesign Plan v2.0

## Vision
Ein modernes, flaches Dashboard mit Node-Hierarchie, Side-Panels und optimaler Performance auf allen Geraeten (Pi2B, Fire HD 10, Desktop, Mobile).

---

## Kernkonzepte

### 1. Node-Hierarchie (Parent-Child)

**Automatische Erkennung:**
- Proxmox-Host erkennt → VMs/LXCs werden automatisch als "Child-Nodes" hinzugefuegt
- Docker-Host erkennt → Container werden als untergeordnete Einheiten angezeigt

**Datenbankstruktur:**
```sql
ALTER TABLE nodes ADD COLUMN parent_id INTEGER REFERENCES nodes(id);
ALTER TABLE nodes ADD COLUMN auto_discovered_from INTEGER REFERENCES nodes(id);
```

**UI-Darstellung:**
```
proxmox1 (Host)                    ● Online
├── vm-100 ubuntu-server           ● Running
├── vm-101 windows-10              ○ Stopped
├── ct-200 nginx-proxy             ● Running
└── ct-201 pihole                  ● Running

docker1 (Host)                     ● Online
├── nginx                          ● Running
├── postgres                       ● Running
└── redis                          ○ Exited
```

**Logik:**
1. Bei Discovery eines Proxmox-Hosts → VMs/CTs als potentielle Child-Nodes vorschlagen
2. User kann "Auto-Import" aktivieren → Neue VMs/CTs werden automatisch als Nodes hinzugefuegt
3. Child-Nodes erben SSH-Credentials oder haben eigene

---

### 2. Layout-Konzept: Side-Panel + Main-Content

```
┌──────────────────────────────────────────────────────────────────┐
│  nodepulse                              [Toggle Panel] [Theme]   │
├────────────────────┬─────────────────────────────────────────────┤
│                    │                                             │
│  [SIDE PANEL]      │  [MAIN CONTENT]                             │
│                    │                                             │
│  ▼ Alle Nodes (12) │  Dashboard                                  │
│    ● pi2b          │  ─────────────────────────────────          │
│    ● proxmox1      │                                             │
│      ├ vm-100      │  Stats: 12 Nodes · 8 Online · 4 Offline     │
│      └ ct-200      │                                             │
│    ○ docker1       │  [Node-Cards oder Liste hier]               │
│                    │                                             │
│  ▼ Tags            │                                             │
│    [proxmox] (3)   │                                             │
│    [docker] (2)    │                                             │
│                    │                                             │
│  ▼ Typen           │                                             │
│    proxmox-host    │                                             │
│    raspberry-pi    │                                             │
│                    │                                             │
└────────────────────┴─────────────────────────────────────────────┘
```

**Responsive Verhalten:**
- **Desktop (>1024px):** Side-Panel immer sichtbar
- **Tablet (768-1024px):** Side-Panel ein/ausklappbar (Standard: eingeklappt)
- **Mobile (<768px):** Side-Panel als Overlay/Drawer

---

### 3. Flat Design Prinzipien

**Entfernen:**
- Box-Shadows auf Cards
- Tiefe Border-Radii (max 4px)
- Verschachtelte Container

**Beibehalten:**
- Farbpalette (Khaki-Green Dark, Brown Light)
- Touch-Targets (min 44px)
- Status-Indikatoren (Dots)

**Neu:**
- Linien-Trenner statt Boxes
- Mehr Whitespace
- Groessere Typografie fuer Hierarchie

---

### 4. Komponenten-Design

#### Node-Row (kompakt)
```
┌────────────────────────────────────────────────────────────────┐
│ ● proxmox1          10.0.0.1      proxmox-host    8 VMs  [→]  │
│   Last seen: 2 min ago                                         │
└────────────────────────────────────────────────────────────────┘
```

#### Node-Card (erweitert, fuer wenige Nodes)
```
┌────────────────────────────────────────────────────────────────┐
│ ● proxmox1                                        [Edit] [Del] │
│ ──────────────────────────────────────────────────────────────│
│ Host: 10.0.0.1:22                   Type: proxmox-host         │
│ Last seen: 2 min ago                Uptime: 45d 3h             │
│                                                                │
│ Children: 4 VMs, 2 CTs              Tags: [proxmox] [cluster]  │
└────────────────────────────────────────────────────────────────┘
```

#### Side-Panel Node-Tree
```
▼ proxmox1 (● Online)
  ├── ● vm-100 ubuntu
  ├── ● vm-101 debian
  ├── ○ vm-102 win10
  └── ● ct-200 nginx
```

---

### 5. Performance-Optimierungen

| Optimierung | Impact | Prioritaet |
|-------------|--------|------------|
| Lazy-Load Tabs | -50% initial DOM | Hoch |
| Virtual Scrolling fuer lange Listen | Konstante Performance | Mittel |
| CSS Custom Properties reduzieren | -10ms Repaint | Niedrig |
| Shadow-Box entfernen | -5ms/frame | Hoch |
| Debounced Window Resize | Weniger Layout Thrashing | Mittel |

---

## Implementierungs-Phasen

### Phase 1: Backend-Erweiterungen (Node-Hierarchie)
1. DB-Schema erweitern (parent_id, auto_discovered_from)
2. API: GET /nodes mit Hierarchie-Option
3. API: POST /nodes/:id/import-children (fuer Proxmox)
4. Scheduler: Auto-Import bei aktivierter Option

### Phase 2: Side-Panel + Navigation
1. Neues Layout mit Side-Panel
2. Node-Tree Komponente
3. Responsive Breakpoints
4. Panel Toggle (ein/ausklappen)

### Phase 3: Flat Design Migration
1. CSS Variables bereinigen
2. Shadows entfernen
3. Border auf 1px reduzieren
4. Whitespace optimieren

### Phase 4: Node-Detail Redesign
1. Kompakte Header-Info
2. Tab-Lazy-Loading
3. Inline-Stats statt Cards

### Phase 5: Dashboard Redesign
1. Stats als Inline-Zeile
2. Node-Liste/Grid hybrid
3. Quick-Actions

---

## CSS-Aenderungen (Vorschau)

```css
/* ALT */
.detail-card {
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 1.25rem;
  box-shadow: var(--shadow-sm);
}

/* NEU */
.detail-section {
  padding: 1rem 0;
  border-bottom: 1px solid var(--color-border);
}

.detail-section:last-child {
  border-bottom: none;
}
```

---

## Farbpalette (unveraendert)

### Dark Mode
- Background: `#0a0a0a`
- Surface: `#1a1a1a` (weniger nutzen!)
- Accent: `#5fa332` (Khaki Green)
- Text: `#e0e0e0`

### Light Mode
- Background: `#ffffff`
- Surface: `#f5f5f5` (weniger nutzen!)
- Accent: `#7C5E46` (Brown)
- Text: `#1a1a1a`

---

## Risiken & Mitigation

| Risiko | Mitigation |
|--------|------------|
| Breaking Changes fuer bestehende User | Opt-in Beta, dann graduelle Migration |
| Performance-Regression | Benchmarks vor/nach jeder Phase |
| Touch-Usability leidet | Usability-Tests auf Fire HD nach jeder Phase |

---

## Naechste Schritte

1. [ ] Entscheidung: Komplettes Redesign oder inkrementell?
2. [ ] Prototyp fuer Side-Panel in HTML/CSS
3. [ ] DB-Migration fuer parent_id planen
4. [ ] Performance-Baseline messen (Fire HD 10)
