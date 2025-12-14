const path = require('path');

// Load .env from project root
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const config = {
  // Server
  port: parseInt(process.env.PORT, 10) || 3000,
  host: process.env.HOST || '0.0.0.0',

  // Database
  dbPath: process.env.DB_PATH || path.join(__dirname, '../../data/nodepulse.db'),

  // SSH Defaults
  ssh: {
    defaultPort: parseInt(process.env.SSH_DEFAULT_PORT, 10) || 22,
    defaultUser: process.env.SSH_DEFAULT_USER || 'root',
    defaultKeyPath: process.env.SSH_DEFAULT_KEY_PATH || path.join(process.env.HOME || process.env.USERPROFILE, '.ssh/id_rsa'),
    connectionTimeout: parseInt(process.env.SSH_TIMEOUT, 10) || 10000,
    keepaliveInterval: parseInt(process.env.SSH_KEEPALIVE, 10) || 10000,
  },

  // Monitoring
  monitoring: {
    defaultInterval: parseInt(process.env.MONITORING_INTERVAL, 10) || 30,
    statsRetentionHours: parseInt(process.env.STATS_RETENTION_HOURS, 10) || 168,
  },

  // Paths
  paths: {
    scripts: path.join(__dirname, '../../scripts'),
    views: path.join(__dirname, '../views'),
    public: path.join(__dirname, '../public'),
  },
};

module.exports = config;
