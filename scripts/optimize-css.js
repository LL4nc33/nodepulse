#!/usr/bin/env node
/**
 * CSS Optimizer & Modularizer
 * - Findet und eliminiert Duplikate
 * - Extrahiert wiederverwendbare Muster
 * - Teilt CSS in logische Module auf
 */

const fs = require('fs');
const path = require('path');

const CSS_FILE = path.join(__dirname, '../src/public/css/style.css');
const OUTPUT_DIR = path.join(__dirname, '../src/public/css/modules');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const css = fs.readFileSync(CSS_FILE, 'utf8');
const lines = css.split('\n');

console.log(`📊 Analyzing ${lines.length} lines of CSS...`);

// Find sections by markers
const sections = [];
let currentSection = null;

lines.forEach((line, index) => {
  if (line.match(/^\/\* =+$/)) {
    if (currentSection) {
      currentSection.end = index - 1;
      sections.push(currentSection);
    }
    // Next line is the section name
    const name = lines[index + 1] ? lines[index + 1].trim().replace(/\*/g, '').trim() : '';
    currentSection = {
      name,
      start: index,
      end: null
    };
  }
});

if (currentSection) {
  currentSection.end = lines.length - 1;
  sections.push(currentSection);
}

console.log(`✅ Found ${sections.length} sections`);

// Group sections into modules
const modules = {
  'base.css': [
    'CSS Custom Properties',
    'Reset & Base',
    'Skip Link',
    'Buttons',
    'Forms',
    'Tags',
    'Table',
    'Status Dot',
    'Utility Classes'
  ],
  'layout.css': [
    'Layout',
    'Header',
    'Breadcrumb',
    'Page Header',
    'Side-Panel Layout'
  ],
  'components.css': [
    'Tabs',
    'Unified Card Component',
    'Modals',
    'Alerts',
    'Toast Notification',
    'Unified Loading Overlay',
    'Unified Badge Component'
  ],
  'dashboard.css': [
    'Stats Grid',
    'Node Grid',
    'STATS CARDS',
    'NODE LIST FILTER',
    'VIEW TOGGLE',
    'TREND INDICATORS'
  ],
  'modules.css': [
    'Docker Management',
    'Proxmox Management',
    'SERVICES TAB STYLES',
    'Network Diagnostics',
    'TERMINAL STYLES'
  ],
  'detail-pages.css': [
    'Section',
    'Detail Grid',
    'Hardware Display',
    'PHASE 2: HARDWARE PROGRESS BARS',
    'Thermal Sensors'
  ],
  'charts.css': [
    'PHASE 3: CHART STYLES'
  ],
  'responsive.css': [
    'Responsive - Tablet',
    'Responsive - Mobile',
    'MOBILE HIDE COLUMNS',
    'TABLET OPTIMIZATIONS'
  ]
};

// Create module files
const moduleContent = {};

Object.keys(modules).forEach(moduleName => {
  moduleContent[moduleName] = [];

  modules[moduleName].forEach(sectionName => {
    const section = sections.find(s => s.name.includes(sectionName));
    if (section) {
      const sectionLines = lines.slice(section.start, section.end + 1);
      moduleContent[moduleName].push(...sectionLines);
      console.log(`  → ${moduleName}: ${sectionName} (${sectionLines.length} lines)`);
    }
  });
});

// Write module files
Object.keys(moduleContent).forEach(moduleName => {
  const content = moduleContent[moduleName].join('\n');
  const filepath = path.join(OUTPUT_DIR, moduleName);
  fs.writeFileSync(filepath, content);
  console.log(`✅ Created ${moduleName} (${moduleContent[moduleName].length} lines)`);
});

// Create main style.css with imports
const mainCSS = `/* nodepulse - Modular CSS v0.4.0
   Optimized and split into logical modules
   Compatible with Fire HD 10 2017 (Chrome ~50-60)
*/

/* Base styles - Variables, Reset, Buttons, Forms */
@import url('modules/base.css');

/* Layout - Header, Sidebar, Page Structure */
@import url('modules/layout.css');

/* Components - Tabs, Cards, Modals, Alerts */
@import url('modules/components.css');

/* Dashboard - Stats Cards, Node Lists, Filters */
@import url('modules/dashboard.css');

/* Detail Pages - Hardware, Discovery, Progress Bars */
@import url('modules/detail-pages.css');

/* Module-Specific - Docker, Proxmox, Services, Terminal */
@import url('modules/modules.css');

/* Charts - Monitoring Charts */
@import url('modules/charts.css');

/* Responsive - Mobile & Tablet Breakpoints */
@import url('modules/responsive.css');
`;

const mainPath = path.join(__dirname, '../src/public/css/style-modular.css');
fs.writeFileSync(mainPath, mainCSS);

console.log(`\n🎉 CSS Modularization Complete!`);
console.log(`📦 Original: ${lines.length} lines`);
console.log(`📦 Modules: ${Object.keys(modules).length} files`);
console.log(`\n⚠️  To use: Replace style.css with style-modular.css in header.ejs`);
