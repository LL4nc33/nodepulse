/**
 * Tag Consolidation Script
 * Reduces tags to: proxmox, docker, raspberry-pi, vm, bare-metal
 */
var path = require('path');
var dbPath = path.join(__dirname, '..', 'data', 'nodepulse.db');

// Initialize database
process.env.DB_PATH = dbPath;
var db = require('../src/db');

async function main() {
  // Initialize database
  await db.init(dbPath);

  console.log('Starting tag consolidation...\n');

  // Get all current tags
  var allTags = db.tags.getAll();
  console.log('Current tags:', allTags.map(function(t) { return t.name; }).join(', '));

  // Define tag mappings
  var tagsToKeep = ['proxmox', 'docker', 'raspberry-pi', 'vm', 'bare-metal'];
  var tagMappings = {
    'proxmox-ct': 'proxmox',
    'proxmox-vm': 'proxmox',
    'container': 'docker',
    'podman': 'docker'
  };
  var tagsToRemove = ['arm', 'x86', 'cluster-node', 'standalone', 'proxmox-ct', 'proxmox-vm', 'container', 'podman'];

  // Get tag IDs
  var tagIds = {};
  allTags.forEach(function(t) {
    tagIds[t.name] = t.id;
  });

  // Get all nodes
  var nodes = db.nodes.getAll();
  console.log('\nProcessing ' + nodes.length + ' nodes...\n');

  nodes.forEach(function(node) {
    var currentTags = node.tags ? node.tags.split(',') : [];
    console.log(node.name + ': ' + currentTags.join(', '));

    // Check for mappings
    currentTags.forEach(function(tagName) {
      if (tagMappings[tagName]) {
        var newTagName = tagMappings[tagName];
        var newTagId = tagIds[newTagName];

        // Add new tag if not already present
        if (currentTags.indexOf(newTagName) === -1 && newTagId) {
          console.log('  + Adding ' + newTagName);
          db.tags.addToNode(node.id, newTagId);
        }
      }
    });

    // Remove unwanted tags
    tagsToRemove.forEach(function(tagName) {
      if (currentTags.indexOf(tagName) !== -1 && tagIds[tagName]) {
        console.log('  - Removing ' + tagName);
        db.tags.removeFromNode(node.id, tagIds[tagName]);
      }
    });

    // Add bare-metal to proxmox hosts (node_type = proxmox-host)
    if (node.node_type === 'proxmox-host' && currentTags.indexOf('bare-metal') === -1) {
      console.log('  + Adding bare-metal (proxmox host)');
      db.tags.addToNode(node.id, tagIds['bare-metal']);
    }
  });

  console.log('\nDone! Tags consolidated.');

  // Now delete the unused tags from the tags table
  console.log('\nDeleting unused tags from database...');
  var deleteStmt = db.getDb().prepare('DELETE FROM tags WHERE id = ?');
  tagsToRemove.forEach(function(t) {
    if (tagIds[t]) {
      console.log('  Deleting tag: ' + t + ' (id: ' + tagIds[t] + ')');
      deleteStmt.run(tagIds[t]);
    }
  });

  console.log('\nAll done!');
  db.close();
}

main().catch(function(err) {
  console.error('Error:', err);
  process.exit(1);
});
