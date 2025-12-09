/**
 * Mock Confluence Server
 *
 * A complete mock of Confluence REST API for testing conf-poll.
 * Features:
 * - Exact Confluence API response structure
 * - Web UI for editing pages
 * - SQLite persistence
 * - Version tracking
 */

import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

import { initDatabase, closeDatabase } from './db/database.js';
import { requestLogger } from './middleware/logger.js';
import apiRoutes from './routes/api.js';
import adminRoutes from './routes/admin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.MOCK_CONFLUENCE_PORT || 3001;

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(requestLogger);

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../frontend')));

// API Routes (Confluence-compatible)
app.use('/wiki/rest/api', apiRoutes);

// Admin Routes (for UI)
app.use('/admin', adminRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Catch-all for SPA (serve index.html for non-API routes)
app.get('*', (req, res) => {
  if (!req.path.startsWith('/wiki/') && !req.path.startsWith('/admin/')) {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

// Error handler
app.use((err, req, res, next) => {
  console.error('[ERROR]', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Graceful shutdown
function shutdown() {
  console.log('\n[Server] Shutting down...');
  closeDatabase();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Start server
async function start() {
  try {
    await initDatabase();

    app.listen(PORT, () => {
      console.log('');
      console.log('='.repeat(60));
      console.log('  Mock Confluence Server');
      console.log('='.repeat(60));
      console.log('');
      console.log(`  Web UI:      http://localhost:${PORT}`);
      console.log(`  API Base:    http://localhost:${PORT}/wiki/rest/api`);
      console.log('');
      console.log('  Use this base URL in conf-poll:');
      console.log(`  CONFLUENCE_BASE_URL=http://localhost:${PORT}`);
      console.log('');
      console.log('  Sample page ID: 123456789');
      console.log('');
      console.log('='.repeat(60));
      console.log('');
    });
  } catch (error) {
    console.error('[Server] Failed to start:', error);
    process.exit(1);
  }
}

start();
