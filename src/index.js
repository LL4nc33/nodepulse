const express = require('express');
const path = require('path');
const config = require('./config');
const db = require('./db');
const scheduler = require('./collector/scheduler');

// Main startup (async for sql.js initialization)
(async () => {
  // Initialize database (async for sql.js)
  await db.init();

  // Create Express app
  const app = express();

// Security: Input size limits (prevent DoS)
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ limit: '1mb', extended: true }));

// Static files (no logging)
app.use('/static', express.static(config.paths.public, {
  maxAge: '1d',
  etag: true,
}));

// View engine
app.set('view engine', 'ejs');
app.set('views', config.paths.views);

// Request logging (only non-static, only in dev)
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    if (!req.path.startsWith('/static')) {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    }
    next();
  });
}

// Load routes
const webRoutes = require('./routes/web');
const apiRoutes = require('./routes/api');

app.use('/', webRoutes);
app.use('/api', apiRoutes);

// 404 handler
app.use((req, res) => {
  if (req.path.startsWith('/api')) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Endpoint nicht gefunden' } });
  } else {
    res.status(404).render('error', {
      title: '404 - Nicht gefunden',
      message: 'Die angeforderte Seite wurde nicht gefunden.',
      statusCode: 404,
    });
  }
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.stack || err);

  // Don't leak error details in production
  const isProd = process.env.NODE_ENV === 'production';
  const message = isProd ? 'Ein interner Fehler ist aufgetreten' : err.message;
  const details = isProd ? null : err.stack;

  if (req.path.startsWith('/api')) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message },
    });
  } else {
    res.status(500).render('error', {
      title: 'Interner Fehler',
      message,
      statusCode: 500,
      details,
    });
  }
});

// Start server
const server = app.listen(config.port, config.host, () => {
  console.log('');
  console.log('  nodepulse v0.2.0');
  console.log('  ================');
  console.log(`  Server: http://${config.host}:${config.port}`);
  console.log(`  DB:     ${config.dbPath}`);
  console.log(`  Env:    ${process.env.NODE_ENV || 'development'}`);
  console.log('');

  // Start background stats collector
  scheduler.start();
});

// Graceful shutdown
const shutdown = (signal) => {
  console.log(`\n[SHUTDOWN] ${signal} empfangen`);

  // Stop background collector
  scheduler.stop();

  // Stop accepting new connections
  server.close(async () => {
    console.log('[SHUTDOWN] Server geschlossen');
    await db.close();
    process.exit(0);
  });

  // Force close after 5 seconds
  setTimeout(() => {
    console.error('[SHUTDOWN] Erzwungener Shutdown nach Timeout');
    process.exit(1);
  }, 5000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

})().catch(err => {
  console.error('[FATAL] Startup failed:', err);
  process.exit(1);
});
