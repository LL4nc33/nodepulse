#!/usr/bin/env node
/**
 * Build Script - Concatenates detail-page modules into single file
 */

const fs = require('fs');
const path = require('path');

const MODULES_DIR = path.join(__dirname, '../src/public/js/detail');
const OUTPUT_FILE = path.join(__dirname, '../src/public/js/detail-page.js');
const BACKUP_FILE = path.join(__dirname, '../src/public/js/detail-page-backup.js');

const modules = [
  'docker.js',
  'proxmox.js',
  'modals.js',
  'terminal.js',
  'services.js',
  'storage.js',
  'backup.js',
  'tasks.js',
  'network.js',
  'health.js',
  'live-metrics.js'
];

console.log('🔨 Building detail-page.js from modules...\n');

// Backup original
if (fs.existsSync(OUTPUT_FILE)) {
  fs.copyFileSync(OUTPUT_FILE, BACKUP_FILE);
  console.log(`💾 Backed up original to detail-page-backup.js`);
}

// Get header from first module
const firstModule = fs.readFileSync(path.join(MODULES_DIR, modules[0]), 'utf8');
const headerEnd = firstModule.indexOf('// ================');
const header = firstModule.substring(0, headerEnd);

let output = header;
output += '\n/* Built from modular JavaScript v0.4.0\n   Generated: ' + new Date().toISOString() + '\n*/\n\n';

let totalLines = 0;

// Concatenate all modules (skip header in subsequent modules)
modules.forEach(moduleName => {
  const modulePath = path.join(MODULES_DIR, moduleName);

  if (!fs.existsSync(modulePath)) {
    console.warn(`⚠️  Module not found: ${moduleName}`);
    return;
  }

  let content = fs.readFileSync(modulePath, 'utf8');

  // Skip header in all modules except first
  if (moduleName !== modules[0]) {
    const sectionStart = content.indexOf('// ================');
    if (sectionStart !== -1) {
      content = content.substring(sectionStart);
    }
  } else {
    // For first module, skip the header we already added
    content = content.substring(headerEnd);
  }

  const lines = content.split('\n').length;
  totalLines += lines;

  output += `\n// ============================================================\n// FROM: ${moduleName} (${lines} lines)\n// ============================================================\n\n`;
  output += content;
  output += '\n';

  console.log(`✅ Added ${moduleName} (${lines} lines)`);
});

// Write output
fs.writeFileSync(OUTPUT_FILE, output);

console.log(`\n🎉 Build complete!`);
console.log(`📦 Total: ${totalLines} lines across ${modules.length} modules`);
console.log(`📄 Output: ${OUTPUT_FILE}`);
