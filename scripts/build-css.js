#!/usr/bin/env node
/**
 * CSS Build Script - Concatenates modular CSS into single file
 * For production performance (no @import overhead)
 */

const fs = require('fs');
const path = require('path');

const MODULES_DIR = path.join(__dirname, '../src/public/css/modules');
const OUTPUT_FILE = path.join(__dirname, '../src/public/css/style.css');
const BACKUP_FILE = path.join(__dirname, '../src/public/css/style-backup.css');

// Module load order (important for cascading)
const modules = [
  'base.css',
  'layout.css',
  'components.css',
  'dashboard.css',
  'detail-pages.css',
  'docker.css',
  'proxmox.css',
  'services.css',
  'storage.css',
  'backup.css',
  'tasks.css',
  'network.css',
  'charts.css',
  'responsive.css'
];

console.log('🔨 Building CSS from modules...\n');

// Backup original style.css
if (fs.existsSync(OUTPUT_FILE)) {
  fs.copyFileSync(OUTPUT_FILE, BACKUP_FILE);
  console.log(`💾 Backed up original to style-backup.css`);
}

// Build header
let output = `/* nodepulse - Built from modular CSS v0.4.0
   Generated: ${new Date().toISOString()}
   Compatible with Fire HD 10 2017 (Chrome ~50-60)

   Source modules:
   ${modules.map(m => `   - ${m}`).join('\n')}
*/

`;

// Concatenate all modules
let totalLines = 0;
modules.forEach(moduleName => {
  const modulePath = path.join(MODULES_DIR, moduleName);

  if (!fs.existsSync(modulePath)) {
    console.warn(`⚠️  Module not found: ${moduleName}`);
    return;
  }

  const content = fs.readFileSync(modulePath, 'utf8');
  const lines = content.split('\n').length;
  totalLines += lines;

  output += `\n/* ============================================================\n   FROM: ${moduleName} (${lines} lines)\n   ============================================================ */\n\n`;
  output += content;
  output += '\n';

  console.log(`✅ Added ${moduleName} (${lines} lines)`);
});

// Write output
fs.writeFileSync(OUTPUT_FILE, output);

console.log(`\n🎉 Build complete!`);
console.log(`📦 Total: ${totalLines} lines across ${modules.length} modules`);
console.log(`📄 Output: ${OUTPUT_FILE}`);
console.log(`\n💡 To rebuild: npm run build:css`);
