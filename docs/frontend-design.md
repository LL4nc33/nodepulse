# NodePulse Frontend Design System

Version: 1.0 (Sprint 1)
Stand: 2025-12-18

---

## Ueberblick

Dieses Dokument beschreibt das Design-System fuer NodePulse. Das System basiert auf CSS Custom Properties (Variablen) und sorgt fuer konsistentes Styling in der gesamten Anwendung.

**Inspiriert von:**
- Proxmox VE (Datacenter-View, Summary-Cards)
- Docker Desktop (Clean Cards, Sidebar)
- Pulse Dashboard (Metriken-Format mit absoluten Werten)

---

## Design-System Variablen

### Spacing Scale

Konsistentes Spacing fuer die gesamte Anwendung:

```css
:root {
  --space-xs: 0.25rem;    /* 4px */
  --space-sm: 0.5rem;     /* 8px */
  --space-md: 1rem;       /* 16px */
  --space-lg: 1.5rem;     /* 24px */
  --space-xl: 2rem;       /* 32px */
  --space-2xl: 3rem;      /* 48px */
}
```

**Verwendung:**
- `--space-xs`: Mini-Gaps, Badge-Padding
- `--space-sm`: Button-Padding, Card-Gaps
- `--space-md`: Standard-Padding, Section-Gaps
- `--space-lg`: Card-Padding, Grid-Gaps
- `--space-xl`: Section-Padding
- `--space-2xl`: Page-Padding, grosse Abstände

### Typography Scale

```css
:root {
  --font-size-xs: 0.6875rem;   /* 11px - Mini-Labels */
  --font-size-sm: 0.75rem;     /* 12px - Badges, Meta */
  --font-size-base: 0.875rem;  /* 14px - Body Text */
  --font-size-md: 1rem;        /* 16px - Headings */
  --font-size-lg: 1.25rem;     /* 20px - Section Headers */
  --font-size-xl: 1.5rem;      /* 24px - Page Titles */
  --font-size-2xl: 2rem;       /* 32px - Stats Values */
}
```

### Font Weights

```css
:root {
  --font-weight-normal: 400;
  --font-weight-medium: 500;
  --font-weight-semibold: 600;
  --font-weight-bold: 700;
}
```

### Line Heights

```css
:root {
  --line-height-tight: 1.25;
  --line-height-normal: 1.5;
  --line-height-relaxed: 1.75;
}
```

### Border Radius

```css
:root {
  --radius-sm: 4px;     /* Badges, kleine Elemente */
  --radius-md: 6px;     /* Buttons, Inputs */
  --radius-lg: 8px;     /* Cards */
  --radius-xl: 12px;    /* Modals, grosse Cards */
  --radius-full: 9999px; /* Pills, runde Elemente */
}
```

### Transitions

```css
:root {
  --transition-fast: 150ms ease;    /* Hover-Effekte */
  --transition-base: 200ms ease;    /* Standard-Animationen */
  --transition-slow: 300ms ease;    /* Komplexe Animationen */
}
```

---

## Farb-System

Das bestehende Farb-System bleibt unveraendert:

```css
:root {
  /* Primary Colors */
  --color-accent: #5cb3ff;
  --color-accent-hover: #7cc4ff;
  --color-accent-bg: rgba(92, 179, 255, 0.1);

  /* Semantic Colors */
  --color-warning: #f6ad55;
  --color-warning-bg: rgba(246, 173, 85, 0.15);
  --color-error: #fc8181;
  --color-error-text: #ff6b6b;
  --color-error-bg: rgba(252, 129, 129, 0.15);

  /* Surface Colors */
  --color-bg: #1a1a2e;
  --color-bg-surface: #1e1e32;
  --color-bg-elevated: #252542;
  --color-border: #3d3d5c;
  --color-border-light: rgba(255, 255, 255, 0.1);

  /* Text Colors */
  --color-text: #e0e0e0;
  --color-text-muted: #b0b0b0;
}
```

---

## Komponenten

### Progress-Bar

Die Progress-Bar-Komponente ist vereinheitlicht und unterstuetzt 3 Varianten:

#### Mini (6px Hoehe)
Fuer Dashboard Listen-View, kompakte Darstellung.

```ejs
<%- include('partials/progress-bar', {
  progressValue: 45,
  variant: 'mini'
}) %>
```

#### Standard (8px Hoehe)
Fuer Cards-View, mit optionalen absoluten Werten.

```ejs
<%- include('partials/progress-bar', {
  progressValue: 82,
  variant: 'standard',
  showAbsolute: true,
  usedValue: 13,
  totalValue: 16,
  unit: 'GB'
}) %>
```

#### Large (12px Hoehe)
Fuer Detail-Pages, mit Label und absoluten Werten.

```ejs
<%- include('partials/progress-bar', {
  progressValue: 65,
  variant: 'large',
  label: 'Memory',
  showAbsolute: true,
  usedValue: 52.4,
  totalValue: 64,
  unit: 'GB',
  thresholdWarning: 80,
  thresholdCritical: 95
}) %>
```

#### Parameter

| Parameter | Typ | Default | Beschreibung |
|-----------|-----|---------|--------------|
| `progressValue` | Number | 0 | Wert 0-100 |
| `variant` | String | 'mini' | 'mini', 'standard', 'large' |
| `label` | String | '' | Label fuer large Variante |
| `showAbsolute` | Boolean | false | Absolute Werte anzeigen |
| `usedValue` | Number/String | - | Verwendeter Wert |
| `totalValue` | Number/String | - | Gesamtwert |
| `unit` | String | '' | Einheit (GB, cores, etc.) |
| `thresholdWarning` | Number | 80 | Warning-Schwelle |
| `thresholdCritical` | Number | 95 | Critical-Schwelle |
| `offline` | Boolean | false | Offline-Status |
| `timestamp` | Number | - | Unix-Timestamp fuer Alter |

#### Farbcodierung

- **OK (gruen)**: Wert < Warning-Threshold
- **Warning (orange)**: Wert >= Warning-Threshold
- **Critical (rot)**: Wert >= Critical-Threshold

### Buttons

#### Primary Button
```html
<button class="btn">Primary</button>
```

#### Success Button
```html
<button class="btn btn-success">Success</button>
```

#### Warning Button
```html
<button class="btn btn-warning">Warning</button>
```

### Utility-Klassen

#### Text
```html
<span class="text-muted">Muted Text</span>
<span class="text-danger">Error Text</span>
<span class="text-success">Success Text</span>
<span class="text-warning">Warning Text</span>
```

---

## CSS-Modul-Architektur

Das CSS ist in 11 logische Module aufgeteilt:

| Modul | Beschreibung | Zeilen |
|-------|--------------|--------|
| `base.css` | Design-System, Variablen, Reset, Buttons | ~900 |
| `layout.css` | Header, Sidebar, Page-Structure | ~975 |
| `components.css` | Tabs, Cards, Modals, Progress-Bars | ~800 |
| `dashboard.css` | Stats, Node-Lists, Filters | ~920 |
| `detail-pages.css` | Hardware, Progress-Bars | ~450 |
| `docker.css` | Docker-Tab Styles | ~800 |
| `proxmox.css` | Proxmox-Tab Styles | ~450 |
| `services.css` | Services-Tab Styles | ~240 |
| `network.css` | Network-Diagnostics | ~500 |
| `charts.css` | Monitoring-Charts | ~180 |
| `responsive.css` | Mobile/Tablet Breakpoints | ~330 |

**Build-System:**
```bash
npm run build:css  # Baut alle Module zu style.css zusammen
```

---

## Browser-Kompatibilitaet

Optimiert fuer aeltere Browser (Chrome 50+, Fire HD 10 2017):

- Flexbox mit `-webkit-` Prefixes
- Kein CSS Grid
- ES5 JavaScript
- CSS Custom Properties (ab Chrome 49)
- Touch-Targets mindestens 44px

---

## Roadmap

### Sprint 1 - Foundations (ABGESCHLOSSEN)
- [x] Design-System CSS-Variablen
- [x] CSS-Klassen Deduplizierung
- [x] Progress-Bar vereinheitlicht

### Sprint 2 - Dashboard (GEPLANT)
- [ ] Stats-Cards Proxmox-Style
- [ ] Listen-View mit absoluten Werten
- [ ] Cards-View Docker Desktop-Style
- [ ] Tree-View verbessern

### Sprint 3 - Node-Detail (GEPLANT)
- [ ] Overview-Tab Proxmox-Style
- [ ] Docker-Tab Docker Desktop-Style
- [ ] Tab-Navigation optimieren

### Sprint 4 - Sidebar & Navigation (GEPLANT)
- [ ] Sidebar Baum-Navigation
- [ ] Header Optimierung

### Sprint 5 - Polish (GEPLANT)
- [ ] Animations & Transitions
- [ ] Responsive Feinschliff
- [ ] Accessibility Audit

---

## Dateien

### CSS-Module
- `src/public/css/modules/base.css`
- `src/public/css/modules/layout.css`
- `src/public/css/modules/components.css`
- `src/public/css/modules/dashboard.css`
- `src/public/css/modules/detail-pages.css`
- `src/public/css/modules/docker.css`
- `src/public/css/modules/proxmox.css`
- `src/public/css/modules/services.css`
- `src/public/css/modules/network.css`
- `src/public/css/modules/charts.css`
- `src/public/css/modules/responsive.css`

### Komponenten
- `src/views/partials/progress-bar.ejs`
- `src/views/partials/empty-state.ejs`

### Build-Scripts
- `scripts/build-css.js`
- `scripts/build-detail-js.js`
